import { rackLineHref } from "@/lib/racks/cart-key";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";

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
  if (item.kind === "media") return `/shop/grow-media/${item.key}`;
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
  /* A green ordered between 19 Sep and 19 Oct 2026 was a tray, and its order
     line says so by carrying no grams. Its own wording rather than the pack
     branch below — a grown tray is not a moulded pack — so an old order or
     invoice still reads as it was bought. A green since is weighed, below. */
  if (isTrayGreen(item.kind, item.grams)) {
    return `${t("linePriceTray", { price: item.unitPrice })} · ${t("lineTrays", { count: item.units })}`;
  }
  /* A compressed coir block (SPEC §24). "Pack" would be true but vague — the
     thing arriving is one block, and the kilos are already in its name. */
  if (item.kind === "media") {
    return `${t("linePriceBlock", { price: item.unitPrice })} · ${t("lineBlocks", { count: item.units })}`;
  }
  if (item.grams === null) {
    return `${t("linePricePack", { price: item.unitPrice })} · ${t("linePacks", { count: item.units })}`;
  }
  return `${t("linePrice", { price: item.unitPrice })} · ${t("lineGrams", { grams: item.grams })}`;
}

/**
 * Which stepper label names this kind's unit.
 *
 * A screen reader hearing "one less 100 g" beside a rack is the only person
 * this affects, which is precisely why it is worth a function: it is invisible
 * to everyone reviewing the page.
 */
export function stepKey(kind: string, dir: "decrease" | "increase"): string {
  if (kind === "rack") return dir === "decrease" ? "decreaseRack" : "increaseRack";
  if (kind === "tray") return dir === "decrease" ? "decreasePack" : "increasePack";
  if (kind === "media") return dir === "decrease" ? "decreaseBlock" : "increaseBlock";
  return dir;
}

/**
 * The quantity on a catalogue card's quick-add stepper, in the kind's own unit
 * — "200 g" for a seed or a green. The same words the cart line uses
 * (`cart.json`), so a card and the cart never describe one line two ways.
 *
 * `grams` is an order line's, for a tax document: null on a green bought as a
 * tray (`isTrayGreen`). A stepper has no line yet and leaves it out.
 */
export function lineQuantity(
  kind: string,
  units: number,
  t: (key: string, values?: Record<string, number>) => string,
  grams?: number | null,
): string {
  if (kind === "rack") return t("lineRacks", { count: units });
  if (grams !== undefined && isTrayGreen(kind, grams)) return t("lineTrays", { count: units });
  if (kind === "media") return t("lineBlocks", { count: units });
  if (kind === "tray") return t("linePacks", { count: units });
  return t("lineGrams", { grams: units * GRAMS_PER_UNIT });
}

/** A green bought between 19 Sep and 19 Oct 2026, when the unit was a grown
 *  tray: its order line has no grams. One since is weighed, in 100 g. */
function isTrayGreen(kind: string, grams: number | null): boolean {
  return kind === "variety" && grams === null;
}
