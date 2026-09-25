import { getTranslations } from "next-intl/server";
import { MAX_UNITS_PER_LINE, unitsFor, type CartKind } from "@/lib/cart/cart";
import { readCartLines } from "@/lib/cart/server";
import { lineQuantity, stepKey } from "@/lib/cart/line-display";

/**
 * Everything a grid needs to put `QuickAdd` on its cards: one cart read and
 * one set of messages for the whole page, then `props(kind, key, name)` per
 * card. Server-only, because the labels are resolved here — the same words
 * the cart page uses for the same line (`cart.json`), so "One more tray of
 * Radish" reads identically on a card and in the basket.
 */
export async function quickAddFor() {
  const [lines, q, c] = await Promise.all([
    readCartLines(),
    getTranslations("common.quickAdd"),
    getTranslations("cart"),
  ]);
  const errors = {
    notSellable: q("errors.notSellable"),
    cartFull: q("errors.cartFull"),
    unitsInvalid: q("errors.unitsInvalid"),
    soldOut: q("errors.soldOut"),
    overStock: q("errors.overStock"),
    generic: q("errors.generic"),
  };
  /* `max` defaults to the per-line cap; a seed passes what its shelf allows
     (`seedMaxUnits`), and 0 renders the sold-out chip. */
  return (kind: CartKind, contentKey: string, name: string, max: number = MAX_UNITS_PER_LINE) => ({
    kind,
    contentKey,
    inCart: unitsFor(lines, kind, contentKey),
    max,
    labels: {
      add: q("add"),
      addAria: q("addAria", { name }),
      decrease: c(stepKey(kind, "decrease"), { name }),
      increase: c(stepKey(kind, "increase"), { name }),
      quantities: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
        lineQuantity(kind, i + 1, c),
      ),
      errors,
      soldOut: q("soldOut"),
    },
  });
}
