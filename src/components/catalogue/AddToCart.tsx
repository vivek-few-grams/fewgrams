"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import { Link } from "@/i18n/navigation";
import type { CartKind } from "@/lib/cart/cart";
import { removeCartLine, setCartQuantity } from "@/app/[locale]/cart/actions";

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
 * ## One button, then the stepper is the cart line (the owner, 7 Nov 2026)
 *
 * It was a stepper to pick an amount and a button to agree to it — and, once
 * in the cart, an "Update cart" button under a stepper that already showed
 * the cart. Two steps for one decision. Now, as on a grid card (`QuickAdd`)
 * and in the quick-commerce apps people know: until the item is in the cart
 * there is only "Add to cart", and one tap puts one unit in; from then on the
 * − n + stepper **is** the cart line — each press sends the absolute quantity
 * (`setCartQuantity`; `removeCartLine` at zero, which brings the button back),
 * its caption reads "In your cart", and the button becomes "View cart".
 *
 * The cart figure is optimistic (`useOptimistic` over `inCart`), so the
 * number moves on the press; the action's re-render brings the real figure,
 * and a refused press falls back to it on its own.
 *
 * ## `max` is the cap, and 0 is sold out
 *
 * `max` is the per-line wholesale ceiling (`MAX_UNITS_PER_LINE`) for a
 * green, and for a seed the lower of that and what is on the shelf in 100 g
 * units (the owner, 25 Sep 2026 — from 17 Sep a seed could be ordered past
 * the shelf and was bought in). A seed with nothing on the shelf has `max`
 * 0, and the panel says it is sold out instead of offering a stepper.
 *
 * `dispatch` is one pre-formatted line per quantity, for a kind whose date
 * depends on the amount; nothing passes it now that every seed ships next
 * day, but it stays optional rather than being ripped out mid-change.
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
    decrease: string;
    increase: string;
    add: string;
    /** The stepper's caption while the item is in the cart — it then edits
     *  the cart line itself. */
    inCartCaption: string;
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
    /** Shown in place of the stepper when `max` is 0. */
    soldOut?: { title: string; body: string };
  };
}) {
  const [cartUnits, setOptimistic] = useOptimistic(inCart);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<"added" | "updated" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyIn = cartUnits > 0;
  /* What the panel prices: the cart line once there is one, and one unit —
     what "Add to cart" puts in — before. Clamped to `max` so a cookie written
     when the per-line cap was higher cannot price above today's. */
  const units = alreadyIn ? Math.min(cartUnits, Math.max(max, 1)) : 1;

  /** Save an absolute quantity to the cart — 0 takes the line out. */
  const commit = (next: number) => {
    const target = Math.min(Math.max(next, 0), max);
    const wasIn = alreadyIn;
    setError(null);
    startTransition(async () => {
      setOptimistic(target);
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("key", contentKey);
      if (target === 0) {
        await removeCartLine(fd);
        setSaved(null);
        return;
      }
      fd.set("units", String(target));
      const state: FormState = await setCartQuantity(IDLE, fd);
      if (state.status === "error") {
        setError(labels.errors[state.code] ?? labels.errors.generic);
        setSaved(null);
      } else {
        setSaved(wasIn ? "updated" : "added");
      }
    });
  };

  const step = (delta: number) => commit(cartUnits + delta);

  if (max < 1) {
    return (
      <div role="status" className="mt-8 rounded-2xl bg-sand p-5 sm:p-6">
        <p className="font-display text-xl font-bold text-forest">{labels.soldOut?.title}</p>
        <p className="mt-2 font-body text-sm leading-relaxed text-stone">{labels.soldOut?.body}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl bg-sand p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        {/* One live region wrapping both lines, so a screen reader announces
            the new total and the new weight together rather than twice. */}
        <div aria-live="polite">
          <p className="font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-none tabular-nums text-forest">
            {labels.totals[units - 1]}
          </p>
          <p className="mt-2 font-body text-xs text-stone">{labels.breakdowns[units - 1]}</p>
          {/* Inside the same live region as the total and the weight, so a
              screen reader announces "₹540 · 200 g · arrives Fri 18 Sept" as
              one change rather than three. */}
          {labels.dispatch && (
            <p className="mt-1.5 font-body text-xs font-medium text-forest">{labels.dispatch[units - 1]}</p>
          )}
        </div>

        {/* Only once the item is in the cart: the stepper is the cart line. */}
        {alreadyIn && (
          <div>
            <span className="block font-body text-[10px] uppercase tracking-widest text-stone">
              {labels.inCartCaption}
            </span>
            {/* `bg-cream` on the stepper, against the panel's sand: the control
              has to read as inset and operable, and a sand control on a sand
              panel reads as a label. */}
            <div className="mt-1.5 flex items-center gap-1 rounded-full border border-forest/20 bg-cream p-1">
              <button
                type="button"
                onClick={() => step(-1)}
                /* At 1, one more press takes it out of the cart. */
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
        )}
      </div>

      {/* Full width on a phone, where a thumb target should span the panel;
          auto from `sm` up, because the right column is half a 1400px page
          and a 576px-wide button reads as a stretched banner rather than a
          button. `min-w-52` keeps it substantial rather than shrinking to
          its label. */}
      {alreadyIn ? (
        <Link
          href="/cart"
          className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-forest px-7 py-3.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep sm:w-auto sm:min-w-52"
        >
          <ShoppingBag size={17} strokeWidth={1.75} />
          {labels.viewCart}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => commit(1)}
          disabled={pending}
          className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-forest px-7 py-3.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60 sm:w-auto sm:min-w-52"
        >
          <ShoppingBag size={17} strokeWidth={1.75} />
          {labels.add}
        </button>
      )}

      {/* Confirmation stays on the page rather than redirecting to /cart:
          §18.6 makes this the low-commitment entry point, and someone
          comparing three greens should not be bounced out of the catalogue on
          each add. */}
      {alreadyIn && saved && (
        <p
          role="status"
          className="mt-4 flex flex-wrap items-center gap-2 font-body text-sm font-medium text-forest"
        >
          <Check size={16} strokeWidth={2.25} />
          {saved === "updated" ? labels.updated : labels.added}
        </p>
      )}

      {error && <p className="mt-4 font-body text-sm text-terracotta">{error}</p>}

      <p className="mt-5 border-t border-forest/10 pt-4 font-body text-xs leading-relaxed text-stone">
        {labels.note}
      </p>
    </div>
  );
}
