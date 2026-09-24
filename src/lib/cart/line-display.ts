import { rackLineHref } from "@/lib/racks/cart-key";

/**
 * How a line reads and where it links — shared by the cart, checkout and
 * order pages, so one item is described the same way on all three. Pure:
 * each caller passes its own `t` scoped to the `cart` namespace.
 */

/**
 * Back to the page this line was added from.
 *
 * A rack is the only kind whose link carries a query string: the other three
 * are one key to one page, while a rack key is a SKU that has to be unpacked
 * into the height, size and colour the detail page reads (`rackLineHref`).
 *
 * `/shop/racks` is the fallback for a rack key that will not parse — a cart can
 * hold a line written by an older format, and the range index is a true answer
 * where a 404 would not be.
 */
export function lineHref(item: { kind: string; key: string }): string {
  if (item.kind === "seed") return `/seeds/${item.key}`;
  if (item.kind === "tray") return `/shop/trays/${item.key}`;
  if (item.kind === "rack") return rackLineHref(item.key) ?? "/shop/racks";
  return `/microgreens/${item.key}`;
}

/**
 * The price-and-quantity line, whose **unit** is the kind's.
 *
 * Extracted when racks arrived and made `item.grams === null` ambiguous: it
 * had meant "a pack" while trays were the only unweighed kind, and a rack
 * priced "per pack" and counted in "packs" is the exact class of wrong number
 * that survives review because the code reads fine.
 */
export function lineUnits(
  item: { kind: string; unitPrice: number; units: number; grams: number | null },
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (item.kind === "rack") {
    return `${t("linePriceRack", { price: item.unitPrice })} · ${t("lineRacks", { count: item.units })}`;
  }
  /* A green moved from the 100 g to the tray on 19 Sep 2026 — its own wording
     rather than falling into the pack branch below, because "pack" is a
     tray-product's unit (a moulded plastic pack), not a grown tray of
     greens. Checked first, since it is also `grams === null` now. */
  if (item.kind === "variety") {
    return `${t("linePriceTray", { price: item.unitPrice })} · ${t("lineTrays", { count: item.units })}`;
  }
  if (item.grams === null) {
    return `${t("linePricePack", { price: item.unitPrice })} · ${t("linePacks", { count: item.units })}`;
  }
  return `${t("linePrice", { price: item.unitPrice })} · ${t("lineGrams", { grams: item.grams })}`;
}
