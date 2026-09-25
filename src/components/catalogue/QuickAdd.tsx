"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import type { CartKind } from "@/lib/cart/cart";
import { removeCartLine, setCartQuantity } from "@/app/[locale]/cart/actions";

/**
 * Add to cart from a catalogue card, without opening the detail page (the
 * owner, 24 Sep 2026). An "Add" button until the item is in the cart, then a
 * − n + stepper that **is** the cart line: every press commits.
 *
 * **Only for an item with no choice to make.** A green, a seed, a tray pack
 * and a coir block are each one product at one price, so one press is a
 * complete decision. A rack is not — model, bay count and colour are picked
 * on its range page — so the rack grid carries no quick add, and should not
 * gain one.
 *
 * **Commits on every press, unlike `AddToCart`.** The detail page's buy box
 * has a price panel that follows the stepper and one button to agree to it;
 * a card has no room for that, and a stepper that did nothing until a second
 * button was pressed would read as broken. So each press sends an absolute
 * quantity — `setCartQuantity` for one or more, `removeCartLine` at zero —
 * which is idempotent, so a double-click cannot double a line. The server
 * re-validates everything (`sellable()`); the `max` here is a convenience.
 *
 * `useOptimistic` so the number moves on the press rather than a round trip
 * later. Once the action settles, the page re-renders with the cart's real
 * figure in `inCart`, and a refused press falls back to it on its own.
 */
export function QuickAdd({
  kind,
  contentKey,
  inCart,
  max,
  labels,
  className = "",
}: {
  kind: CartKind;
  contentKey: string;
  /** Units of this item already in the cart, 0 if none. */
  inCart: number;
  max: number;
  labels: {
    add: string;
    addAria: string;
    decrease: string;
    increase: string;
    /** Pre-formatted readout per quantity, index 0 = one unit — "100 g",
     *  "2 trays". A client component cannot format messages itself. */
    quantities: string[];
    errors: Record<string, string>;
    /** Shown instead of the button when `max` is 0 — a seed with nothing on
     *  the shelf (the owner, 25 Sep 2026). */
    soldOut?: string;
  };
  /** Placement only. Compact by design (the owner, 24 Sep 2026): it sits on
   *  the caption's line, beside the name and price, not as a bar under it. */
  className?: string;
}) {
  const [units, setOptimistic] = useOptimistic(inCart);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const commit = (next: number) => {
    const target = Math.min(Math.max(next, 0), max);
    setError(null);
    startTransition(async () => {
      setOptimistic(target);
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("key", contentKey);
      if (target === 0) {
        await removeCartLine(fd);
        return;
      }
      fd.set("units", String(target));
      const state: FormState = await setCartQuantity(IDLE, fd);
      if (state.status === "error") {
        setError(labels.errors[state.code] ?? labels.errors.generic);
      }
    });
  };

  /* Sold out: nothing to add. A line already in the cart can still be
     reduced or removed from the cart page. */
  if (max < 1 && units === 0) {
    return (
      <div className={className}>
        <span className="inline-flex h-8 items-center rounded-full bg-forest/10 px-3 font-body text-xs font-semibold text-stone">
          {labels.soldOut}
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      {units === 0 ? (
        <button
          type="button"
          onClick={() => commit(1)}
          aria-label={labels.addAria}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-forest bg-cream pl-2.5 pr-3 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
        >
          <Plus size={14} strokeWidth={2.25} />
          {labels.add}
        </button>
      ) : (
        /* Filled forest once the item is in the cart, so a grid shows at a
           glance which cards are already in it. */
        <div className="flex h-8 items-center rounded-full bg-forest p-0.5 text-cream">
          <button
            type="button"
            onClick={() => commit(units - 1)}
            aria-label={labels.decrease}
            className="grid size-7 place-items-center rounded-full transition-colors hover:bg-forest-deep"
          >
            <Minus size={14} strokeWidth={2.25} />
          </button>
          <span
            aria-live="polite"
            className="min-w-8 whitespace-nowrap px-0.5 text-center font-body text-xs font-semibold tabular-nums"
          >
            {labels.quantities[units - 1]}
          </span>
          <button
            type="button"
            onClick={() => commit(units + 1)}
            disabled={units >= max}
            aria-label={labels.increase}
            className="grid size-7 place-items-center rounded-full transition-colors hover:bg-forest-deep disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Plus size={14} strokeWidth={2.25} />
          </button>
        </div>
      )}
      {error && (
        <p className="mt-1 max-w-40 text-right font-body text-[11px] leading-snug text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}
