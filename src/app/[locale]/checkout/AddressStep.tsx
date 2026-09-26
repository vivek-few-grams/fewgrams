"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronRight, Home, Leaf, MapPin, PenLine, Phone, Plus, Truck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { MAX_ADDRESSES } from "@/lib/account/validation";
import { AddressEntry } from "../account/addresses/AddressEntry";
import { setDefaultAddressAction } from "../account/actions";

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
  /** Outside the fresh-greens area while the cart holds greens and other
   *  things: offered anyway, and the greens are set aside for it. */
  outsideArea?: boolean;
};

/** What a first address is pre-filled with — the account holder, usually. */
export type AddressPrefill = { recipient: string; phone: string };

/**
 * Which address is chosen, and whether it has been accepted — the state
 * behind `AddressStep`, lifted out so the page that owns the pay button can
 * read it (checkout scans couriers for it; subscribe unlocks paying).
 *
 * The list arrives fresh from the server after every save. An id that was
 * not there before is the address just typed here, so it becomes the one
 * delivered to and counts as accepted; a selection that has vanished falls
 * back to the default and has to be accepted again. Adjusted during render
 * rather than in an effect, so the total never paints for the old address
 * first.
 */
export function useAddressChoice(addresses: PayAddress[]) {
  const defaultId = (addresses.find((a) => a.isDefault) ?? addresses[0])?.addrId ?? "";
  const [addrId, setAddrId] = useState(defaultId);
  const [accepted, setAccepted] = useState(false);
  const [changing, setChanging] = useState(false);
  const [adding, setAdding] = useState(false);

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
  return {
    addrId,
    setAddrId,
    accepted,
    setAccepted,
    changing,
    setChanging,
    adding,
    setAdding,
    selected,
    confirmed: !!selected && accepted && !changing,
    accept: () => {
      setChanging(false);
      setAccepted(true);
    },
  };
}

export type AddressChoice = ReturnType<typeof useAddressChoice>;

/**
 * The delivery-address step — SPEC §9.2 (the owner's layout, 23 Sep 2026).
 * Shared by checkout and `/subscribe`, so the two read as one site.
 *
 * - **Nothing saved:** a PIN card first; once the PIN is one we deliver to,
 *   the address card below it, with district and state filled from India
 *   Post (`AddressEntry`). Typed once here, saved to the account, never
 *   asked for again. Saving it counts as accepting it.
 * - **Something saved:** the default is shown with "Deliver here" to accept
 *   it and "Change" to pick another, make another the default, or add one
 *   more, up to `MAX_ADDRESSES`.
 *
 * The add form and the default switch post to the account's own actions, so
 * an address added here is the same row the account page shows. This step
 * therefore renders **outside** the pay `<form>` — a form cannot nest — and
 * the pay form carries the chosen id in a hidden input.
 */
export function AddressStep({
  n,
  choice,
  addresses,
  savedCount,
  emptyBody,
  prefill,
  greensOnly,
  forSubscription = false,
}: {
  /** The step's number on its page. */
  n: number;
  choice: AddressChoice;
  /** Deliverable addresses only, default first. */
  addresses: PayAddress[];
  /** Every saved address, deliverable or not — the limit counts them all. */
  savedCount: number;
  /** Why there is nothing to pick, when `addresses` is empty. */
  emptyBody: string;
  prefill: AddressPrefill;
  /** Fresh greens: only the own run's area can be delivered to, so a new
   *  address outside it is turned away at the PIN step. */
  greensOnly: boolean;
  /** `/subscribe`: the out-of-area message mentions no cart. */
  forSubscription?: boolean;
}) {
  const t = useTranslations("checkout");
  const ta = useTranslations("account.addresses");
  const router = useRouter();
  const { addrId, setAddrId, accepted, setAccepted, changing, setChanging, adding, setAdding, selected, confirmed, accept } =
    choice;
  const canAdd = savedCount < MAX_ADDRESSES;

  /* A saved address changes what the page can offer, which only the server
     can work out — so the page is re-read, not patched. */
  const addressSaved = () => {
    setAdding(false);
    setChanging(false);
    router.refresh();
  };

  const entry = (layout?: Parameters<typeof AddressEntry>[0]["layout"]) => (
    <AddressEntry
      defaultRecipient={prefill.recipient}
      defaultPhone={prefill.phone}
      onDone={addressSaved}
      onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
      offerDefault={savedCount > 0}
      greensOnly={greensOnly}
      forSubscription={forSubscription}
      layout={layout}
    />
  );

  const card = "co-card co-card--leaf p-5 md:p-6";

  /* Nothing to pick: the PIN in a card of its own, and the address card
     below it, collapsed until the PIN is one we deliver to. */
  if (!selected) {
    return canAdd ? (
      entry((pin, form) => (
        <div className="space-y-5">
          {/* Once the PIN has passed, the card has said what it had to: only
              its one-line result stays, with "Change", and the address card
              below does the talking. */}
          {form ? (
            pin
          ) : (
            <section aria-labelledby="pin-heading" className={card}>
              <StepHeading id="pin-heading" n={n}>
                {ta("pinHeading")}
              </StepHeading>
              <p className="mt-2 font-body text-sm leading-relaxed text-stone">{ta(forSubscription ? "pinBodySubscription" : "pinBody")}</p>
              <div className="mt-5">{pin}</div>
            </section>
          )}
          {/* Always on the page, so the customer can see what comes next; shut
              and dimmed until the PIN passes, then open with the form. */}
          <section
            aria-labelledby="deliver-to"
            className={`${card} transition-opacity duration-300 ${form ? "" : "opacity-55"}`}
          >
            <StepHeading id="deliver-to" n={form ? n : n + 1}>
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
        <StepHeading id="deliver-to" n={n}>
          {t("noAddressHeading")}
        </StepHeading>
        <p className="mt-2 font-body text-sm leading-relaxed text-stone">{emptyBody}</p>
        <p className="mt-4 font-body text-sm text-terracotta">{t("addressLimit", { max: MAX_ADDRESSES })}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="deliver-to" className="co-card co-card--leaf p-5 md:p-6">
      <StepHeading
        id="deliver-to"
        n={n}
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
                {selected.outsideArea && <OutsideNote text={t("setAsideAddress")} />}
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
                      <span className="min-w-0">
                        <AddressSummary address={a} />
                        {a.outsideArea && <OutsideNote text={t("setAsideAddress")} />}
                      </span>
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
}

/** A card's heading with its step number; a tick once the step is done.
 *  `sub` is a line under the title — "Manage addresses" on the delivery card. */
export function StepHeading({
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

/** Under an address outside the greens area: the greens stay behind, the
 *  rest still comes. */
function OutsideNote({ text }: { text: string }) {
  return (
    <span className="mt-2 flex items-start gap-2 rounded-lg bg-terracotta/[0.07] px-2.5 py-1.5 font-body text-xs leading-relaxed text-terracotta">
      <Leaf aria-hidden size={13} strokeWidth={1.75} className="mt-[2px] shrink-0" />
      {text}
    </span>
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
