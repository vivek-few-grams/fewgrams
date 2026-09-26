"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, ChevronRight, Info, Lock, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { PinnedColumn } from "@/components/ui/PinnedColumn";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import { AddressStep, StepHeading, useAddressChoice, type AddressPrefill, type PayAddress } from "./AddressStep";
import { scanDelivery, startCheckout } from "./actions";
import { openGateway } from "./open-gateway";
import { PaymentConfirming } from "./PaymentConfirming";
import { DeliveryPartners, type PartnerName } from "./DeliveryPartners";
import { DeliveryRide } from "./DeliveryRide";
import { CHECKOUT_IDLE, choiceField, type CheckoutState, type DeliveryScan } from "./state";

/** How long the delivery scan stays on screen at the least. */
const MIN_SCAN_MS = 1800;

export type { PayAddress, AddressPrefill } from "./AddressStep";

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
 * ## Delivery partner (the owner, 24 Sep 2026)
 *
 * Accepting an address starts a scan (`scanDelivery`): every connected
 * courier is asked for its price to that address, the step shows each one
 * being checked, and then lists every option with the cheapest picked. The
 * customer may pick another. An order is split by where each thing is
 * collected (SPEC §7), so there is one choice per courier parcel; greens and
 * whatever of ours rides with them go on the owner's own run at the fixed fee.
 *
 * The scan is held on screen for at least `MIN_SCAN_MS` so it reads as a
 * comparison; a scan that comes back in 200 ms would otherwise flash past.
 *
 * ## Payment
 *
 * **Shown only once an address is accepted and priced**, because the
 * delivery charge — and so the total — is per address and per partner. It is
 * items + delivery = total, then the pay button, or the "not open yet" notice
 * when no gateway is set.
 *
 * The add form and the default switch post to the account's own actions, so
 * an address added here is the same row the account page shows, validated by
 * the same `validateAddress`. They sit **outside** the pay `<form>` — a form
 * cannot nest — and the pay form carries the chosen address id, and one
 * `delivery:<parcel>` option id per parcel, in hidden inputs.
 *
 * The server action places the order and returns what the gateway's own
 * payment screen needs (`openGateway` — Razorpay's modal, or Cashfree's
 * redirect). The browser learns nothing it could use to change the amount:
 * the gateway order was opened by the server, for the server's total. Each
 * vendor's script loads on submit, not with the page.
 */
export function PayForm({
  locale,
  summary: summaryInArea,
  summaryOutside,
  subtotalOutside,
  payable,
  gatewayLabel,
  subtotal: subtotalInArea,
  partners,
  greensOnly,
  addresses,
  savedCount,
  emptyBody,
  prefill,
}: {
  locale: string;
  /** The order summary, rendered by the page, at the top of the right column. */
  summary: ReactNode;
  /** The same summary for an address outside the greens area: the greens
   *  greyed and uncounted, the rest as usual. Null unless the cart holds
   *  greens **and** something else — greens alone are never offered such an
   *  address. */
  summaryOutside: ReactNode | null;
  /** The items total without the greens, for that case. */
  subtotalOutside: number;
  /** False when no gateway is configured: the address step still works, the
      pay button is replaced by a notice. */
  payable: boolean;
  /** The configured gateway's name, for the "you pay on …" note. */
  gatewayLabel: string;
  subtotal: number;
  /** The couriers a scan will ask, for its "checking" rows. */
  partners: PartnerName[];
  /** Fresh greens in the cart: only the own run's area can be delivered to,
   *  so a new address outside it is turned away at the PIN step. */
  greensOnly: boolean;
  /** Deliverable addresses only, default first. */
  addresses: PayAddress[];
  /** Every saved address, deliverable or not — the limit counts them all. */
  savedCount: number;
  /** Why there is nothing to pick, when `addresses` is empty. */
  emptyBody: string;
  prefill: AddressPrefill;
}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const router = useRouter();

  const choice = useAddressChoice(addresses);
  const { selected, confirmed } = choice;
  /* Outside the area, the greens are set aside (`splitByArea`): the summary
     greys them and every figure below is without them — which is also what
     `scanDelivery` quotes and `startCheckout` charges. */
  const setAside = !!selected?.outsideArea && summaryOutside !== null;
  const summary = setAside ? summaryOutside : summaryInArea;
  const subtotal = setAside ? subtotalOutside : subtotalInArea;

  /* The scan for the accepted address. Keyed by address so a scan that
     lands after the customer has moved on is dropped, and `round` so a
     re-scan can be forced for the same address. */
  const [scan, setScan] = useState<{ key: string; result: DeliveryScan } | null>(null);
  /* Parcel id → the option picked for it; each starts on its cheapest. */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [round, setRound] = useState(0);
  const scanKey = confirmed && selected ? `${selected.addrId}#${round}` : null;
  const current = scan && scan.key === scanKey ? scan.result : null;

  useEffect(() => {
    if (!scanKey || !selected) return;
    let live = true;
    Promise.all([
      scanDelivery(selected.addrId, locale).catch((): DeliveryScan => ({ status: "none", operatorNote: null })),
      new Promise((r) => setTimeout(r, MIN_SCAN_MS)),
    ]).then(([result]) => {
      if (!live) return;
      setScan({ key: scanKey, result });
      setChosen(
        result.status === "ready"
          ? Object.fromEntries(result.parcels.flatMap((p) => (p.options[0] ? [[p.id, p.options[0].id]] : [])))
          : {},
      );
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `scanKey` names the address and the round; `selected` follows it.
  }, [scanKey, locale]);

  /* Each parcel's chosen price, plus the own run's fee. Null until every
     parcel has a choice, so the total is never shown short of a parcel. */
  const picked =
    current?.status === "ready"
      ? current.parcels.map((p) => p.options.find((o) => o.id === chosen[p.id]) ?? null)
      : null;
  const delivery =
    current?.status === "ready" && picked && picked.every(Boolean)
      ? (current.ownRun?.amount ?? 0) + picked.reduce((sum, o) => sum + o!.amount, 0)
      : null;
  const scanning = confirmed && current === null;
  const total = delivery === null ? null : subtotal + delivery;

  /* The date under the order summary follows the partners chosen (the owner,
     24 Sep 2026): the day the last parcel arrives — the own run on its ready
     date, each courier parcel on its chosen option's. Where a courier gave
     no transit time, the latest collection day is the best that can be said. */
  const localeTag = useLocale() === "kn" ? "kn-IN" : "en-IN";
  const dateLine = (() => {
    if (current?.status !== "ready" || !picked) return null;
    const arrivals = [...(current.ownRun ? [current.ownRun.arrives] : []), ...picked.map((o) => o?.arrives ?? null)];
    if (arrivals.every((d): d is string => d !== null)) {
      return { key: "arrives", iso: arrivals.sort().at(-1)! };
    }
    const pickups = current.parcels.map((p) => p.pickup).sort();
    return pickups.length > 0 ? { key: "readyToShip", iso: pickups.at(-1)! } : null;
  })();

  /* The gateway hand-off happens inside the action, not in an effect after
     it: `pending` then stays true until the payment screen has replaced the
     page, so the button cannot be pressed twice while it opens. */
  /* Set by the gateway's success callback: from there until the confirmation
     page loads, the checkout is covered by a "confirming" screen. */
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData): Promise<CheckoutState> => {
      const next = await startCheckout(prev, fd);
      /* The delivery prices on screen are what moved — ask the couriers again. */
      if (next.status === "error" && (next.code === "deliveryChanged" || next.code === "deliveryUnavailable")) {
        setRound((r) => r + 1);
      }
      if (next.status !== "ready") return next;
      try {
        /* Only comes back if the screen was closed or never opened; on
           success the page is replaced first. */
        return { status: "error", code: await openGateway(next.checkout, () => setConfirming(true)) };
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
      (state.code === "priceChanged" ||
        state.code === "cartChanged" ||
        state.code === "deliveryUnavailable" ||
        state.code === "deliveryChanged")
    ) {
      router.refresh();
    }
  }, [state, router]);

  const error =
    state.status === "error"
      ? t.has(`errors.${state.code}`)
        ? t(`errors.${state.code}`, state.values)
        : t("errors.gatewayError")
      : null;

  const deliveryStep = (
    <AddressStep
      n={1}
      choice={choice}
      addresses={addresses}
      savedCount={savedCount}
      emptyBody={emptyBody}
      prefill={prefill}
      greensOnly={greensOnly}
    />
  );

  /* What the pay button says, in order of what is missing. */
  const payLabel = pending
    ? t("paying")
    : !confirmed
      ? t("payLocked")
      : scanning
        ? t("payScanning")
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
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-10">
      {confirming && <PaymentConfirming title={t("confirming.title")} body={t("confirming.body")} />}
      <div className="space-y-5">
        {deliveryStep}

        <DeliveryPartners
          n={selected ? 2 : 3}
          locked={!confirmed}
          partners={partners}
          scan={current}
          chosen={chosen}
          onChoose={(parcel, option) => setChosen((c) => ({ ...c, [parcel]: option }))}
          heading={({ id, n, done, muted, children }) => (
            <StepHeading id={id} n={n} done={done} muted={muted}>
              {children}
            </StepHeading>
          )}
        />

        {/* Payment sits under delivery, in the wide column: it is the step
            that follows, and the right card is only what is being bought.
            On the page from the start, dimmed and locked, so the customer
            can see where confirming an address leads. */}
        <section
          aria-labelledby="pay-heading"
          className={`co-card co-card--leaf p-5 transition-opacity duration-300 md:p-6 ${confirmed ? "" : "opacity-80"}`}
        >
          <StepHeading id="pay-heading" n={selected ? 3 : 4} muted={!confirmed}>
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
                ) : scanning ? (
                  <span className="font-normal text-stone">{t("deliveryScanning")}</span>
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
              {Object.entries(chosen).map(([parcel, option]) => (
                <input key={parcel} type="hidden" name={choiceField(parcel)} value={option} />
              ))}
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
              {t("payNote", { gateway: gatewayLabel })}
            </p>
          )}
        </section>
      </div>

      {/* The road scene hangs above the column, out of flow, so "Your order"
          starts on the same line as the delivery box. It is inside the
          sticky element so the two stay on screen together (`PinnedColumn`).

          The height cap is on an inner box, not the aside: a sticky panel
          taller than the window never shows its bottom, where the pay button
          is. On the aside, `overflow` would also clip the scene.

          The card is what is being bought and nothing else — the items and
          their total. Delivery, the grand total and the pay button are the
          payment step, in the left column. */}
      <PinnedColumn className="relative lg:self-start">
        <DeliveryRide className="absolute inset-x-0 bottom-full mb-3 hidden lg:block" />
        <div className="pin-column__scroll co-card co-card--dark p-5 md:p-6">
          {summary}
          {dateLine && (
            <p className="mt-4 flex items-center gap-2.5 rounded-xl bg-cream/10 px-3.5 py-2.5 font-body text-[13px] text-cream/85">
              <CalendarCheck size={16} strokeWidth={1.75} className="shrink-0 text-cream" />
              <span aria-live="polite">
                {t.rich(dateLine.key, {
                  date: formatDeliveryDate(fromIstDateISO(dateLine.iso), localeTag),
                  b: (chunks) => <strong className="font-semibold text-cream">{chunks}</strong>,
                })}
              </span>
            </p>
          )}
        </div>
      </PinnedColumn>
    </div>
  );
}
