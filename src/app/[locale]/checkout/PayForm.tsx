"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronRight, Home, Info, Lock, MapPin, PenLine, Phone, Plus, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { MAX_ADDRESSES } from "@/lib/account/validation";
import { AddressEntry } from "../account/addresses/AddressEntry";
import { setDefaultAddressAction } from "../account/actions";
import { startCheckout } from "./actions";
import { DeliveryRide } from "./DeliveryRide";
import { CHECKOUT_IDLE, type CheckoutState } from "./state";

export type PayAddress = {
  addrId: string;
  recipient: string;
  /** Flat, street and landmark, joined. */
  street: string;
  /** `formatPlace`: district, state and PIN. */
  place: string;
  /** Display form, `98450 12345`. */
  phone: string;
  isDefault: boolean;
  /** Rupees to deliver to this address, or null when no price could be had. */
  delivery: number | null;
};

/** What a first address is pre-filled with — the account holder, usually. */
export type AddressPrefill = { recipient: string; phone: string };

/**
 * The delivery step and the payment step — SPEC §9.2.
 *
 * ## Delivery (the owner's layout, 23 Sep 2026)
 *
 * - **Nothing saved:** a PIN card first; once the PIN is one we deliver to,
 *   the address card below it, with district and state filled from India
 *   Post (`AddressEntry`). Typed once here, saved to the account, never
 *   asked for again. Saving it counts as accepting it.
 * - **Something saved:** the default is shown with "Deliver here" to accept
 *   it and "Change" to pick another, make another the default, or add one
 *   more, up to `MAX_ADDRESSES`.
 *
 * ## Layout
 *
 * Two columns from `lg`: delivery on the left, and on the right a sticky
 * panel with the page's order summary and, below it, payment. One component
 * renders both because the right column depends on the left one's state.
 * Below `lg` they stack, delivery first.
 *
 * ## Payment
 *
 * **Shown only once an address is accepted**, because the delivery charge —
 * and so the total — is per address. It is items + delivery = total, then
 * the pay button, or the "not open yet" notice when no gateway is set.
 *
 * The add form and the default switch post to the account's own actions, so
 * an address added here is the same row the account page shows, validated by
 * the same `validateAddress`. They sit **outside** the pay `<form>` — a form
 * cannot nest — and the pay form carries the chosen id in a hidden input.
 *
 * The server action places the order and returns a gateway session; this
 * component then hands that session to Cashfree's own checkout, which
 * replaces the page. The browser learns nothing it could use to change the
 * amount: the session was opened by the server, for the server's total.
 *
 * `@cashfreepayments/cashfree-js` injects its script the moment it is
 * imported, so it is imported on submit rather than at the top of this file
 * — otherwise every visit to checkout would load a third-party script.
 */
export function PayForm({
  locale,
  summary,
  payable,
  subtotal,
  operatorNote,
  addresses,
  savedCount,
  emptyBody,
  prefill,
}: {
  locale: string;
  /** The order summary, rendered by the page, at the top of the right column. */
  summary: ReactNode;
  /** False when no gateway is configured: the address step still works, the
      pay button is replaced by a notice. */
  payable: boolean;
  subtotal: number;
  /** Why there is no delivery price, in operator wording — only ever
   *  non-null for an admin (the page resolves it from `admin` messages). */
  operatorNote: { body: string; cta: string } | null;
  /** Deliverable addresses only, default first. */
  addresses: PayAddress[];
  /** Every saved address, deliverable or not — the limit counts them all. */
  savedCount: number;
  /** Why there is nothing to pick, when `addresses` is empty. */
  emptyBody: string;
  prefill: AddressPrefill;
}) {
  const t = useTranslations("checkout");
  const ta = useTranslations("account.addresses");
  const tc = useTranslations("cart");
  const router = useRouter();

  const defaultId = (addresses.find((a) => a.isDefault) ?? addresses[0])?.addrId ?? "";
  const [addrId, setAddrId] = useState(defaultId);
  const [accepted, setAccepted] = useState(false);
  const [changing, setChanging] = useState(false);
  const [adding, setAdding] = useState(false);

  /* The list arrives fresh from the server after every save. An id that was
     not there before is the address just typed here, so it becomes the one
     delivered to and counts as accepted; a selection that has vanished falls
     back to the default and has to be accepted again. Adjusted during render
     rather than in an effect, so the total never paints for the old address
     first. */
  const ids = addresses.map((a) => a.addrId).join(",");
  const [knownIds, setKnownIds] = useState(ids);
  if (ids !== knownIds) {
    const before = new Set(knownIds.split(","));
    const added = addresses.find((a) => !before.has(a.addrId));
    setKnownIds(ids);
    if (added) {
      setAddrId(added.addrId);
      setAccepted(true);
    } else if (!addresses.some((a) => a.addrId === addrId)) {
      setAddrId(defaultId);
      setAccepted(false);
    }
  }

  const selected = addresses.find((a) => a.addrId === addrId) ?? null;
  const delivery = selected?.delivery ?? null;
  const total = delivery === null ? null : subtotal + delivery;
  const canAdd = savedCount < MAX_ADDRESSES;

  /* The gateway hand-off happens inside the action, not in an effect after
     it: `pending` then stays true until the payment screen has replaced the
     page, so the button cannot be pressed twice while it opens. */
  const [state, action, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData): Promise<CheckoutState> => {
      const next = await startCheckout(prev, fd);
      if (next.status !== "ready") return next;
      try {
        const { load } = await import("@cashfreepayments/cashfree-js");
        const cashfree = await load({ mode: next.mode });
        if (!cashfree) return { status: "error", code: "notCompleted" };
        const result = await cashfree.checkout({
          paymentSessionId: next.sessionId,
          redirectTarget: "_self",
        });
        /* On success the redirect has already replaced the page. An error
           means the screen was closed or never opened — "not completed",
           never "failed", because a payment may still be in flight. */
        return result.error ? { status: "error", code: "notCompleted" } : next;
      } catch {
        return { status: "error", code: "notCompleted" };
      }
    },
    CHECKOUT_IDLE,
  );

  /* The action refused because the cart moved under the page — re-render it,
     so the customer is looking at the total they would now be charged. */
  useEffect(() => {
    if (
      state.status === "error" &&
      (state.code === "priceChanged" || state.code === "cartChanged" || state.code === "deliveryUnavailable")
    ) {
      router.refresh();
    }
  }, [state, router]);

  /* Pin the right column exactly where it starts, so scrolling never moves
     it. A fixed `top` cannot do that: the column's starting offset depends
     on the header and on the heading, whose size is a `clamp()` of the
     window width, so any constant makes it travel a few pixels and then
     stop. The grid is measured rather than the aside, because a stuck
     sticky element reports where it is stuck, not where it began. Any
     change in the page's size — resize, fonts arriving — re-measures. */
  const gridRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    const aside = asideRef.current;
    if (!grid || !aside) return;
    const measure = () => {
      const top = grid.getBoundingClientRect().top + window.scrollY;
      aside.style.setProperty("--pin-top", `${Math.round(top)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const error =
    state.status === "error"
      ? t.has(`errors.${state.code}`)
        ? t(`errors.${state.code}`, state.values)
        : t("errors.gatewayError")
      : null;

  /* A saved address changes the page's delivery quotes, which only the server
     can work out — so the page is re-read, not patched. */
  const addressSaved = () => {
    setAdding(false);
    setChanging(false);
    router.refresh();
  };

  const accept = () => {
    setChanging(false);
    setAccepted(true);
  };

  const entry = (layout?: Parameters<typeof AddressEntry>[0]["layout"]) => (
    <AddressEntry
      defaultRecipient={prefill.recipient}
      defaultPhone={prefill.phone}
      onDone={addressSaved}
      onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
      offerDefault={savedCount > 0}
      layout={layout}
    />
  );

  const card = "co-card co-card--leaf p-5 md:p-6";

  /* Nothing to pick: the PIN in a card of its own, and the address card
     below it, collapsed until the PIN is one we deliver to. */
  const empty = canAdd ? (
    entry((pin, form) => (
      <div className="space-y-5">
        {/* Once the PIN has passed, the card has said what it had to: only
            its one-line result stays, with "Change", and the address card
            below does the talking. */}
        {form ? (
          pin
        ) : (
          <section aria-labelledby="pin-heading" className={card}>
            <StepHeading id="pin-heading" n={1}>
              {ta("pinHeading")}
            </StepHeading>
            <p className="mt-2 font-body text-sm leading-relaxed text-stone">{ta("pinBody")}</p>
            <div className="mt-5">{pin}</div>
          </section>
        )}
        {/* Always on the page, so the customer can see what comes next; shut
            and dimmed until the PIN passes, then open with the form. */}
        <section
          aria-labelledby="deliver-to"
          className={`${card} transition-opacity duration-300 ${form ? "" : "opacity-55"}`}
        >
          <StepHeading id="deliver-to" n={form ? 1 : 2}>
            {t("noAddressHeading")}
          </StepHeading>
          <p className="mt-2 font-body text-sm leading-relaxed text-stone">
            {form ? emptyBody : ta("addressLocked")}
          </p>
          {form && <div className="mt-6">{form}</div>}
        </section>
      </div>
    ))
  ) : (
    <section aria-labelledby="deliver-to" className={card}>
      <StepHeading id="deliver-to" n={1}>
        {t("noAddressHeading")}
      </StepHeading>
      <p className="mt-2 font-body text-sm leading-relaxed text-stone">{emptyBody}</p>
      <p className="mt-4 font-body text-sm text-terracotta">{t("addressLimit", { max: MAX_ADDRESSES })}</p>
    </section>
  );

  const confirmed = !!selected && accepted && !changing;

  const deliveryStep = !selected ? (
    empty
  ) : (
    <section aria-labelledby="deliver-to" className="co-card co-card--leaf p-5 md:p-6">
      <StepHeading
        id="deliver-to"
        n={1}
        done={confirmed}
        sub={
          <Link
            href="/account/addresses"
            className="group inline-flex items-center gap-1 font-body text-xs text-stone transition-colors hover:text-forest"
          >
            {t("manageAddresses")}
            <ChevronRight size={13} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      >
        {t("addressHeading")}
      </StepHeading>

      {!changing ? (
        <>
          <div
            /* The chosen address, so it is marked as chosen: a sage fill and a
               sage border (not a dark one — the owner's call). */
            className="mt-4 rounded-xl border border-sage bg-sage/15 px-4 py-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <AddressSummary address={selected} />
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {selected.isDefault && <DefaultChip label={ta("default")} />}
                {confirmed && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccepted(false);
                      setChanging(true);
                    }}
                    aria-label={t("changeAddressLabel")}
                    className="shrink-0 rounded-full bg-forest px-3.5 py-1.5 font-body text-xs font-semibold text-cream transition-colors hover:bg-forest-deep"
                  >
                    {t("changeAddress")}
                  </button>
                )}
              </span>
            </div>
          </div>
          {!accepted && (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setChanging(true)}
                aria-label={t("changeAddressLabel")}
                className="flex items-center gap-2 rounded-full border-2 border-forest/20 bg-white px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:border-forest"
              >
                <PenLine size={14} strokeWidth={1.75} />
                {t("changeAddress")}
              </button>
              <button
                type="button"
                onClick={accept}
                className="group flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream shadow-[0_8px_20px_-12px_rgb(3_57_35/0.7)] transition-colors hover:bg-forest-deep"
              >
                <Truck size={15} strokeWidth={1.75} />
                {t("useThisAddress")}
                <ArrowRight size={16} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 space-y-3">
          <fieldset>
            <legend className="sr-only">{t("chooseAddress")}</legend>
            <div className="space-y-2.5">
              {addresses.map((a) => (
                <div
                  key={a.addrId}
                  className="rounded-2xl border border-l-4 border-forest/10 border-l-transparent bg-cream/70 p-4 transition-colors hover:border-forest/25 has-[:checked]:border-l-sage has-[:checked]:bg-cream has-[:checked]:shadow-sm md:p-5"
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="addrChoice"
                      value={a.addrId}
                      checked={a.addrId === addrId}
                      onChange={() => setAddrId(a.addrId)}
                      className="mt-3 size-4 accent-forest"
                    />
                    <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <AddressSummary address={a} />
                      {a.isDefault && <DefaultChip label={ta("default")} />}
                    </span>
                  </label>
                  {!a.isDefault && (
                    <form action={setDefaultAddressAction} className="mt-2 pl-7">
                      <input type="hidden" name="addrId" value={a.addrId} />
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 font-body text-xs text-stone underline underline-offset-4 transition-colors hover:text-forest"
                      >
                        <Check size={13} strokeWidth={1.75} />
                        {ta("setDefault")}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </fieldset>

          {adding ? (
            <div className="rounded-2xl border-2 border-dashed border-sage bg-cream/80 p-5">
              <h3 className="mb-4 font-display text-sm font-semibold text-forest">{t("newAddressHeading")}</h3>
              {entry()}
            </div>
          ) : canAdd ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 rounded-full border border-dashed border-forest/30 px-4 py-2 font-body text-xs font-semibold text-forest transition-colors hover:border-forest hover:bg-sand/60"
            >
              <Plus size={14} strokeWidth={2} />
              {t("addAnother")}
            </button>
          ) : (
            <p className="font-body text-xs text-stone">{t("addressLimit", { max: MAX_ADDRESSES })}</p>
          )}

          {!adding && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={accept}
                className="group flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
              >
                {t("useThisAddress")}
                <ArrowRight size={16} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  /* What the pay button says, in order of what is missing. */
  const payLabel = pending
    ? t("paying")
    : !confirmed
      ? t("payLocked")
      : total === null
        ? t("payUnavailable")
        : t("pay", { amount: total });

  const payButton = (
    <button
      type={confirmed ? "submit" : "button"}
      disabled={!confirmed || pending || total === null}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-forest px-7 py-3 sm:ml-auto sm:w-auto sm:min-w-72 font-body text-sm font-semibold text-cream shadow-[0_8px_20px_-10px_rgb(3_57_35/0.6)] transition-colors hover:bg-forest-deep disabled:bg-forest/35 disabled:shadow-none"
    >
      <Lock size={16} strokeWidth={1.75} />
      {payLabel}
    </button>
  );

  return (
    <div ref={gridRef} className="grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-10">
      <div className="space-y-5">
        {deliveryStep}

        {/* Payment sits under delivery, in the wide column: it is the step
            that follows, and the right card is only what is being bought.
            On the page from the start, dimmed and locked, so the customer
            can see where confirming an address leads. */}
        <section
          aria-labelledby="pay-heading"
          className={`co-card co-card--leaf p-5 transition-opacity duration-300 md:p-6 ${confirmed ? "" : "opacity-80"}`}
        >
          <StepHeading id="pay-heading" n={selected ? 2 : 3} muted={!confirmed}>
            {t("payHeading")}
          </StepHeading>

          <dl className="mt-4 divide-y divide-forest/10 border-y border-forest/10">
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="flex items-center gap-3 font-body text-sm text-forest">
                <ReceiptText size={16} strokeWidth={1.75} className="text-forest/70" />
                {t("subtotal")}
              </dt>
              <dd className="font-body text-sm font-semibold tabular-nums text-forest">
                {tc("subtotalValue", { amount: subtotal })}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="flex items-center gap-3 font-body text-sm text-forest">
                <Truck size={16} strokeWidth={1.75} className="text-forest/70" />
                {t("delivery")}
              </dt>
              <dd className="font-body text-sm font-semibold tabular-nums text-forest">
                {!confirmed ? (
                  <span className="flex items-center gap-1 font-normal text-stone">
                    {t("deliveryPending")}
                    <ChevronRight aria-hidden size={15} strokeWidth={2} />
                  </span>
                ) : delivery === null ? (
                  <span className="text-terracotta">{t("deliveryUnavailableShort")}</span>
                ) : (
                  tc("subtotalValue", { amount: delivery })
                )}
              </dd>
            </div>
            {confirmed && total !== null && (
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="font-body text-sm font-semibold text-forest">{t("total")}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums tracking-tight text-forest">
                  {tc("subtotalValue", { amount: total })}
                </dd>
              </div>
            )}
          </dl>

          {confirmed && total === null &&
            (operatorNote ? (
              <div role="status" className="mt-4 rounded-xl bg-terracotta/[0.07] p-4 font-body text-sm text-terracotta">
                <p>{operatorNote.body}</p>
                <Link
                  href="/admin/delivery"
                  className="mt-2 inline-block font-semibold underline underline-offset-4 transition-colors hover:text-forest"
                >
                  {operatorNote.cta}
                </Link>
              </div>
            ) : (
              <p role="status" className="mt-4 rounded-xl bg-terracotta/[0.07] p-4 font-body text-sm text-terracotta">
                {t("deliveryUnavailableBody")}
              </p>
            ))}

          {!payable ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-sage/50 bg-sage/20 p-4">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-forest text-cream">
                <Info size={15} strokeWidth={2} />
              </span>
              <div>
                <h3 className="font-display text-sm font-semibold text-forest">{t("closedHeading")}</h3>
                <p className="mt-1 font-body text-sm leading-relaxed text-stone">{t("closedBody")}</p>
              </div>
            </div>
          ) : confirmed && selected ? (
            <form action={action} className="mt-6 flex flex-col gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="addrId" value={selected.addrId} />
              <input type="hidden" name="total" value={total ?? ""} />
              {error && (
                <p role="alert" className="rounded-xl bg-terracotta/[0.07] p-4 font-body text-sm text-terracotta">
                  {error}
                </p>
              )}
              {payButton}
            </form>
          ) : (
            <div className="mt-6 flex">{payButton}</div>
          )}

          {payable && (
            <p className="mt-3 flex items-start justify-center gap-1.5 text-center font-body text-xs leading-relaxed text-stone sm:justify-end sm:text-right">
              <ShieldCheck size={14} strokeWidth={1.75} className="mt-px shrink-0 text-forest/70" />
              {t("payNote")}
            </p>
          )}
        </section>
      </div>

      {/* The road scene hangs above the column, out of flow, so "Your order"
          starts on the same line as the delivery box. It is inside the
          sticky element so the two stay on screen together. `.pay-pin` in
          `globals.css` pins it at `--pin-top`, measured above.

          The height cap is on an inner box, not the aside: a sticky panel
          taller than the window never shows its bottom, where the pay button
          is. On the aside, `overflow` would also clip the scene.

          The card is what is being bought and nothing else — the items and
          their total. Delivery, the grand total and the pay button are the
          payment step, in the left column. */}
      <aside ref={asideRef} className="pay-pin relative lg:self-start">
        <DeliveryRide className="absolute inset-x-0 bottom-full mb-3 hidden lg:block" />
        <div className="pay-pin__scroll co-card co-card--dark p-5 md:p-6">{summary}</div>
      </aside>
    </div>
  );
}

/** A card's heading with its step number; a tick once the step is done.
 *  `sub` is a line under the title — "Manage addresses" on the delivery card. */
function StepHeading({
  id,
  n,
  done = false,
  muted = false,
  sub,
  children,
}: {
  id: string;
  n: number;
  done?: boolean;
  muted?: boolean;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={`flex size-8 shrink-0 items-center justify-center rounded-full font-body text-xs font-bold tabular-nums transition-colors ${
          muted ? "bg-forest/55 text-cream" : "bg-forest text-cream"
        }`}
      >
        {done ? <Check size={15} strokeWidth={2.5} /> : n}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="font-display text-lg font-bold leading-8 text-forest">
          {children}
        </h2>
        {sub && <div className="-mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/** On the right of an address row, beside its actions — the owner's layout,
 *  24 Sep 2026. A word, not an icon, so it keeps the sage chip. */
function DefaultChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-sage px-2 py-px font-body text-[10px] font-semibold uppercase tracking-wider text-forest">
      {label}
    </span>
  );
}

/**
 * No label chip, here or in the picker — the owner's call, 24 Sep 2026. The
 * name, phone and street already tell addresses apart, and a label is free
 * text: one saved as "39" read as a stray badge.
 */
function AddressSummary({ address }: { address: PayAddress }) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest text-cream">
        <Home size={16} strokeWidth={1.75} />
      </span>
      <span className="block min-w-0 font-body text-[13px] leading-relaxed">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-forest">{address.recipient}</span>
        </span>
        <span className="mt-1 flex items-center gap-2 tabular-nums text-stone">
          <Phone aria-hidden size={13} strokeWidth={1.75} className="shrink-0 text-forest/70" />
          {address.phone}
        </span>
        <span className="mt-0.5 flex items-start gap-2 text-stone">
          <MapPin aria-hidden size={13} strokeWidth={1.75} className="mt-[3px] shrink-0 text-forest/70" />
          <span>
            {address.street}, {address.place}
          </span>
        </span>
      </span>
    </span>
  );
}
