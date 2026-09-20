import type { RackColour } from "./colours";
import type { SellableRack } from "./catalogue";

/**
 * How a rack is written out for a customer — SPEC §19.9.
 *
 * ## Why this is a function and not a field
 *
 * Every other cart kind gets its name from a content file, where a person wrote
 * it: "Red Amaranthus", "Microgreen trays — pair". A rack has no content file,
 * and §19.5 is explicit that `RackModel` carries **no customer-facing name** —
 * *"a model is identified by what it is: 6 ft · 5 shelves · 1¼ × 3 ft ·
 * 1.4 mm Green"*. So the name has to be composed from the figures, every time.
 *
 * Two consequences worth being deliberate about:
 *
 * 1. **It has to be localised**, which a stored string could not be without a
 *    migration. `shop.racks.lineName` is an ICU template in both languages, so
 *    a Kannada cart reads a Kannada rack.
 * 2. **An order line must still snapshot it.** SPEC §4.3 requires a *purchase*
 *    to freeze its name so history cannot be rewritten; this composes the
 *    current one, and checkout is where it gets frozen. That is not yet built
 *    (§19.10), and it is the one thing this module must not be mistaken
 *    for.
 *
 * ## The translator is passed in
 *
 * Rather than calling `getTranslations` here, so the same function serves the
 * cart hydration (which has a locale) and a page (which already has a `t`), and
 * so it stays synchronous and testable without a request context.
 */

/** The shape `getTranslations("shop.racks")` satisfies — just enough of it to
 *  call, so this module does not depend on next-intl's types. */
export type RackTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** `1.25 × 3 ft`. The footprint, which is the figure buyers compare on. */
export function rackSizeLabel(t: RackTranslator, rack: SellableRack): string {
  return t("size", { depth: rack.depthFt, length: rack.lengthFt });
}

/**
 * `Shelf racks · 6 ft · 5 shelves · 1.25 × 3 ft · Orange`.
 *
 * **The colour is in the name because it is in the key** (see `rackCartKey`):
 * two racks of one size in two colours are two cart lines, so if the name did
 * not say which, a cart holding both would show the same line twice.
 *
 * Plain decimals rather than the admin table's `1¼`, deliberately: a fraction
 * glyph needs a mapping table, does not exist for every size the vendor might
 * add, and is harder to read aloud on the phone when someone is confirming an
 * order.
 */
export function rackLineName(
  t: RackTranslator,
  rack: SellableRack,
  colour: RackColour | null,
): string {
  const common = {
    range: t(`ranges.${rack.range}.name`),
    height: rack.heightFt,
    shelves: rack.shelves,
    size: rackSizeLabel(t, rack),
  };
  /* A pipe rack has no colour to name — one spec, and it is white (SPEC §21).
     The separate template rather than an empty placeholder, because
     "… · 1 × 3 ft · " with nothing after it reads as a missing value. */
  return colour === null
    ? t("lineNamePipe", common)
    : t("lineName", { ...common, colour: t(`colours.${colour}`) });
}
