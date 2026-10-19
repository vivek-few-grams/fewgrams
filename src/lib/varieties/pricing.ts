import { NO_MARGIN, retailPrice } from "@/lib/pricing/margin";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import type { Variety, VarietyCosting } from "@/lib/types";

/**
 * What a 100 g box of a microgreen costs us, and what it sells for (the
 * owner, 19 Oct 2026).
 *
 *     a tray  = seed sown × the seed's cost per 100 g (its latest bill)
 *             + cocopeat block ÷ trays per block
 *             + electricity and water
 *     100 g   = a tray ÷ (the tray's low yield ÷ 100 g)
 *     price   = 100 g with the microgreens margin (`retailPrice`)
 *
 * Spread over the **low** yield, so a poor tray is never sold at a loss — the
 * same figure the subscription tray plan counts at.
 *
 * Pure, so a screen can show the working beside the number it produced.
 */

/** What a variety prices at before anyone has saved the costing: the owner's
 *  figures of 19 Oct 2026, and no margin — cost, to the rupee. */
export const DEFAULT_COSTING: VarietyCosting = {
  cocopeatBlockCost: 300,
  traysPerBlock: 16,
  overheadPerTray: 30,
  margin: NO_MARGIN,
};

/** One tray's cost, part by part, and 100 g of what it grows. */
export type TrayCost = {
  seed: number;
  cocopeat: number;
  overhead: number;
  tray: number;
  per100g: number;
};

/** Why a variety cannot be priced — each one something the owner can fix. */
export type Unpriced = "noSeedRate" | "noSeedCost" | "noYield";

export function cocopeatPerTray(c: VarietyCosting): number {
  return c.traysPerBlock > 0 ? c.cocopeatBlockCost / c.traysPerBlock : 0;
}

/**
 * The cost of a tray of `variety` and of 100 g of it, or why there is none.
 *
 * `seedCostPer100g` is the seed of the same key's `costPer100g` — undefined
 * when there is no such seed or no bill has costed it.
 */
export function varietyCost(
  variety: Pick<Variety, "seedGramsPerTray" | "yieldGramsPerTrayMin">,
  seedCostPer100g: number | undefined,
  costing: VarietyCosting,
): { ok: true; cost: TrayCost } | { ok: false; reason: Unpriced } {
  if (!variety.seedGramsPerTray || variety.seedGramsPerTray <= 0) return { ok: false, reason: "noSeedRate" };
  if (seedCostPer100g === undefined || seedCostPer100g <= 0) return { ok: false, reason: "noSeedCost" };
  if (variety.yieldGramsPerTrayMin <= 0) return { ok: false, reason: "noYield" };

  const seed = (variety.seedGramsPerTray / GRAMS_PER_UNIT) * seedCostPer100g;
  const cocopeat = cocopeatPerTray(costing);
  const overhead = costing.overheadPerTray;
  const tray = seed + cocopeat + overhead;
  return {
    ok: true,
    cost: { seed, cocopeat, overhead, tray, per100g: (tray * GRAMS_PER_UNIT) / variety.yieldGramsPerTrayMin },
  };
}

/** What a variety's row should hold: its cost and price per 100 g, or a price
 *  of 0 and no cost when it cannot be priced. */
export function varietyPrice(
  variety: Pick<Variety, "seedGramsPerTray" | "yieldGramsPerTrayMin">,
  seedCostPer100g: number | undefined,
  costing: VarietyCosting,
): { pricePer100g: number; costPer100g?: number } {
  const result = varietyCost(variety, seedCostPer100g, costing);
  if (!result.ok) return { pricePer100g: 0 };
  /* Paise, so a stored cost reads back as the figure on the screen. */
  const costPer100g = Math.round(result.cost.per100g * 100) / 100;
  return { pricePer100g: retailPrice(costPer100g, costing.margin), costPer100g };
}
