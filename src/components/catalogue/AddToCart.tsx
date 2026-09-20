"use client";

import { useActionState, useState } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import { Link } from "@/i18n/navigation";
import type { CartKind } from "@/lib/cart/cart";
import { setCartQuantity } from "@/app/[locale]/cart/actions";

/**
 * The buy box — price, quantity, and add to cart (SPEC §18.6, §22.2).
 *
 * Shared by every kind that sells this way; what one unit *is* — a tray, a
 * 100 g pack — is entirely the caller's business, carried in `labels` (see
 * `microgreens/[key]/page.tsx` and `seeds/[key]/page.tsx`).
 *
 * ## Why this is one filled panel
 *
 * The price used to sit as loose text under the stepper, on the same cream as
 * the body copy, where it read as a caption rather than as the number being
 * decided on. Everything that belongs to *buying* now lives in one sand panel
 * — total, rate, quantity, CTA — so the eye lands on a block instead of
 * hunting for a line of text. It is the only filled panel in its column,
 * deliberately: a second one flattens the emphasis this one exists to carry.
 *
 * **The total for the chosen quantity is the headline; the per-unit rate is
 * the caption.** That ordering matters. The total is what gets charged, so it
 * is what the customer is agreeing to; the rate is the comparison figure
 * against a weekly plan. Setting the rate larger would emphasise the one
 * number that does not change whatever the customer does.
 *
 * The stepper is deliberately not a free-text number field. Everything here
 * sells in whole units — a tray, a 100 g pack — so every value in between is
 * invalid, and a text input invites "2.5" and "100" and then has to reject
 * them. Two buttons and a readout cannot express a wrong quantity.
 *
 * ## The stepper shows the cart, not "how many to add"
 *
 * It used to mount at 1 every time, so with 3 in the cart the header badge read
 * 3 while this control read 1 — two numbers for one fact, and a refresh looked
 * like it had thrown the quantity away. `inCart` seeds it, and the action
 * **sets** rather than adds (`setCartQuantity`), because "add 3" when the
 * control already shows 3 would silently make it 6.
 *
 * The seed is an initial value, not a synced one: after a commit the server
 * state and the local state already agree, and re-keying the component on
 * `inCart` would wipe the "Added to your cart" confirmation the instant it
 * appeared.
 *
 * ## `max` is one cap, not two, and nothing here can sell out
 *
 * `max` is the per-line wholesale ceiling (`MAX_UNITS_PER_LINE`) for **both**
 * kinds. Greens have no stock at all — they are sown to order — and a seed's
 * stock stopped being a ceiling on 17 Sep 2026, when the owner replaced it
 * with a delivery rule: *"we should let them allow to order how much ever they
 * want but the delivery logic changes."*
 *
 * So the sold-out panel this component used to render is **gone**, along with
 * the `max < 1` branch that chose it. Nothing in the catalogue can now be
 * unbuyable-but-listed: a withdrawn item 404s on its own page, and an empty
 * shelf is a later date rather than a refusal (`src/lib/seeds/stock.ts`).
 *
 * What replaced it is `dispatch` — one pre-formatted line per quantity, so
 * stepping past what the shelf holds changes the promise in front of the
 * customer *before* they commit, rather than surprising them at checkout.
 *
 * All validation is repeated server-side in `setCartQuantity`. The clamping
 * here is a convenience: a form control is not a security boundary (SPEC §8).
 */
export function AddToCart({
  kind,
  contentKey,
  max,
  inCart,
  labels,
}: {
  kind: CartKind;
  contentKey: string;
  /** Ceiling for the stepper — the per-line wholesale cap. See above for why
   *  it is no longer also a stock figure. */
  max: number;
  /** Units of this item already in the cart, 0 if none. */
  inCart: number;
  labels: {
    quantity: string;
    decrease: string;
    increase: string;
    add: string;
    update: string;
    added: string;
    updated: string;
    viewCart: string;
    /** A condition of the purchase — the one-off sow timing for a green, the
     *  minimum order and dispatch for a seed. Belongs with the CTA rather
     *  than loose in the page. */
    note: string;
    /**
     * When this quantity would arrive, one entry per reachable quantity —
     * indexed the same way as `totals`.
     *
     * Per quantity rather than one string, because for a seed the answer
     * changes with the amount: what we hold goes out tomorrow, and anything
     * beyond it is ordered in (SPEC §22.2). Omitted for a green, whose date is
     * already a fact under the title.
     */
    dispatch?: string[];
    /** Pre-formatted, one entry per reachable quantity. A client component
     *  cannot call `getTranslations`, and currency and digit grouping belong to
     *  Intl via the message file rather than to string concatenation here. */
    totals: string[];
    breakdowns: string[];
    errors: Record<string, string>;
  };
}) {
  /* Seeded from the cart so this control and the header badge agree on load.
     Falls back to 1 for an item not in the cart — a stepper offering 0 has
     nothing to commit. Clamped to `max` so a cookie written when the per-line
     cap was higher cannot mount above today's. */
  const [units, setUnits] = useState(() =>
    Math.min(Math.max(inCart > 0 ? inCart : 1, 1), Math.max(max, 1)),
  );
  const [state, action, pending] = useActionState<FormState, FormData>(
    setCartQuantity,
    IDLE,
  );

  /* The label follows the cart, not the local stepper: while this item is in
     the cart the button's job is to change that quantity, whatever the stepper
     currently reads. */
  const alreadyIn = inCart > 0;

  const step = (delta: number) =>
    setUnits((n) => Math.min(Math.max(n + delta, 1), max));

  const error =
    state.status === "error"
      ? labels.errors[state.code] ?? labels.errors.generic
      : null;

  return (
    <form action={action} className="mt-8 rounded-2xl bg-sand p-5 sm:p-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={contentKey} />
      <input type="hidden" name="units" value={units} />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        {/* One live region wrapping both lines, so a screen reader announces
            the new total and the new weight together rather than twice. */}
        <div aria-live="polite">
          <p className="font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-none tabular-nums text-forest">
            {labels.totals[units - 1]}
          </p>
          <p className="mt-2 font-body text-xs text-stone">
            {labels.breakdowns[units - 1]}
          </p>
          {/* Inside the same live region as the total and the weight, so a
              screen reader announces "₹540 · 200 g · arrives Fri 18 Sept" as
              one change rather than three. */}
          {labels.dispatch && (
            <p className="mt-1.5 font-body text-xs font-medium text-forest">
              {labels.dispatch[units - 1]}
            </p>
          )}
        </div>

        <div>
          <span className="block font-body text-[10px] uppercase tracking-widest text-stone">
            {labels.quantity}
          </span>
          {/* `bg-cream` on the stepper, against the panel's sand: the control
              has to read as inset and operable, and a sand control on a sand
              panel reads as a label. */}
          <div className="mt-1.5 flex items-center gap-1 rounded-full border border-forest/20 bg-cream p-1">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={units <= 1}
              aria-label={labels.decrease}
              className="grid size-9 place-items-center rounded-full text-forest transition-colors hover:bg-sand disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <Minus size={16} strokeWidth={2} />
            </button>
            {/* `tabular-nums` so the row does not jog sideways between 9 and 10. */}
            <span className="min-w-12 text-center font-display text-base font-semibold tabular-nums text-forest">
              {units}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={units >= max}
              aria-label={labels.increase}
              className="grid size-9 place-items-center rounded-full text-forest transition-colors hover:bg-sand disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <Plus size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        /* Full width on a phone, where a thumb target should span the panel;
           auto from `sm` up, because the right column is half a 1400px page
           and a 576px-wide button reads as a stretched banner rather than a
           button. `min-w-52` keeps it substantial rather than shrinking to
           its label. */
        className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-forest px-7 py-3.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60 sm:w-auto sm:min-w-52"
      >
        <ShoppingBag size={17} strokeWidth={1.75} />
        {alreadyIn ? labels.update : labels.add}
      </button>

      {/* Confirmation stays on the page rather than redirecting to /cart:
          §18.6 makes this the low-commitment entry point, and someone
          comparing three greens should not be bounced out of the catalogue on
          each add. The link is offered, not forced. */}
      {state.status === "saved" && (
        <p className="mt-4 flex flex-wrap items-center gap-2 font-body text-sm font-medium text-forest">
          <Check size={16} strokeWidth={2.25} />
          {alreadyIn ? labels.updated : labels.added}
          <Link
            href="/cart"
            className="font-semibold underline underline-offset-4 hover:text-forest-deep"
          >
            {labels.viewCart}
          </Link>
        </p>
      )}

      {error && <p className="mt-4 font-body text-sm text-terracotta">{error}</p>}

      <p className="mt-5 border-t border-forest/10 pt-4 font-body text-xs leading-relaxed text-stone">
        {labels.note}
      </p>
    </form>
  );
}
