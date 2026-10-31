import { seedMaxUnits } from "@/lib/seeds/stock";

/**
 * Which seeds a starter pack offers — SPEC §29.4 (the owner, 30 Oct 2026).
 *
 * **The cheapest seeds by our cost per 100 g, worked out every time**, not a
 * list somebody keeps. Each seed's cost is set by its latest bill (SPEC
 * §26.6.1), so when a bill moves a seed's cost the menu moves with it, and a
 * seed that runs short of 100 g drops off and the next cheapest takes its
 * place. A pack is priced once in admin; the menu is what keeps a customer's
 * free choice from turning a ₹14,499 pack into a loss.
 *
 * Only seeds that could be ordered on their own are offered: on sale (a price
 * above zero — an unbilled seed is hidden at ₹0), at least 100 g held, and a
 * known cost. The caller has already dropped rows with no content file, as
 * every grid does.
 *
 * Ties on cost go to the content key, so the menu does not reshuffle between
 * two reads of the same data.
 */
export function packSeedMenu<
  S extends { contentKey: string; costPer100g?: number; pricePer100g: number; stockGrams: number },
>(seeds: readonly S[], size: number): S[] {
  return seeds
    .filter(
      (s) =>
        s.pricePer100g > 0 &&
        seedMaxUnits(s.stockGrams) > 0 &&
        typeof s.costPer100g === "number" &&
        s.costPer100g > 0,
    )
    .sort((a, b) => a.costPer100g! - b.costPer100g! || a.contentKey.localeCompare(b.contentKey))
    .slice(0, Math.max(0, size));
}
