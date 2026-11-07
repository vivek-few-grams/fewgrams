import { NO_MARGIN, retailPrice } from "@/lib/pricing/margin";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import type { LoggedGrowth } from "@/lib/sowing/sowing";
import type { VarietyCosting } from "@/lib/types";

/**
 * What a 100 g box of a microgreen costs us, and what it sells for (the
 * owner, 19 Oct 2026; priced from the sowing log since 7 Nov 2026).
 *
 *     a tray  = seed sown per tray × the seed's cost per 100 g (its latest bill)
 *             + cocopeat block ÷ trays per block
 *             + electricity and water
 *             + cleaning
 *     a box   = a tray × trays per box
 *             + packing per 100 g + flat packaging per box
 *     price   = the higher of the margin on a box and a box + the minimum profit
 *
 * **Seed and yield per tray come from the sowing log** (`loggedGrowth`): the
 * average of every harvest whose "count in average" tick is on. A variety
 * with no such harvest has no proven yield and is not sold; neither is one
 * averaging the cutoff or less (60 g, `minYieldPerTray`). The typed yields on
 * admin → varieties no longer price anything.
 *
 * **Under 100 g a tray, a box takes whole trays** — 60 g needs two, and both
 * are paid for in full; the second tray's spare grams are not sold. At 100 g
 * or more the tray is shared out, because the grams over a box go into the
 * next one.
 *
 * **Packing is per box**, added after the trays, because it is bought per box
 * sold, not per tray grown.
 *
 * Pure, so a screen can show the working beside the number it produced.
 */

/** What a variety prices at before anyone has saved the costing: the owner's
 *  cost figures (19 Oct 2026; cleaning, packing and the yield cutoff 7 Nov
 *  2026), and no margin and no minimum profit — cost, to the rupee. */
export const DEFAULT_COSTING: VarietyCosting = {
  cocopeatBlockCost: 300,
  traysPerBlock: 16,
  overheadPerTray: 30,
  cleaningPerTray: 10,
  packingPer100g: 20,
  packingPerBox: 10,
  minProfitPerBox: 0,
  minYieldPerTray: 60,
  margin: NO_MARGIN,
};

/** One tray's cost, part by part, and a packed 100 g box of what it grows. */
export type TrayCost = {
  /** From the sowing log, so the working shows what was averaged. */
  seedGramsPerTray: number;
  gramsPerTray: number;
  harvests: number;
  seed: number;
  cocopeat: number;
  overhead: number;
  cleaning: number;
  tray: number;
  /** Whole trays under 100 g a tray, a share of one otherwise. */
  traysPerBox: number;
  /** `tray × traysPerBox` — growing a box, before packing. */
  grown: number;
  /** Packing on one 100 g box: per 100 g plus the flat per-box figure. */
  packing: number;
  per100g: number;
};

/** Why a variety cannot be priced — each one something the owner can see on
 *  the sowing log or a purchase bill. */
export type Unpriced = "noHarvest" | "lowYield" | "noSeedCost";

export function cocopeatPerTray(c: VarietyCosting): number {
  return c.traysPerBlock > 0 ? c.cocopeatBlockCost / c.traysPerBlock : 0;
}

/**
 * Trays one 100 g box takes: whole trays when a tray yields under 100 g, a
 * share of a tray otherwise. The tolerance keeps 33.3 g from reading as 3.0001
 * and paying for a fourth tray.
 */
export function traysPerBox(gramsPerTray: number): number {
  const share = GRAMS_PER_UNIT / gramsPerTray;
  return gramsPerTray < GRAMS_PER_UNIT ? Math.ceil(share - 1e-9) : share;
}

/**
 * The cost of a tray of a variety and of a packed 100 g box of it, or why
 * there is none.
 *
 * `growth` is the variety's entry in `loggedGrowth` — undefined with no
 * counted harvest. `seedCostPer100g` is the seed of the same key's
 * `costPer100g` — undefined when there is no such seed or no bill has costed
 * it.
 */
export function varietyCost(
  growth: LoggedGrowth | undefined,
  seedCostPer100g: number | undefined,
  costing: VarietyCosting,
): { ok: true; cost: TrayCost } | { ok: false; reason: Unpriced } {
  if (!growth) return { ok: false, reason: "noHarvest" };
  if (growth.gramsPerTray <= costing.minYieldPerTray) return { ok: false, reason: "lowYield" };
  if (seedCostPer100g === undefined || seedCostPer100g <= 0) return { ok: false, reason: "noSeedCost" };

  const seed = (growth.seedGramsPerTray / GRAMS_PER_UNIT) * seedCostPer100g;
  const cocopeat = cocopeatPerTray(costing);
  const overhead = costing.overheadPerTray;
  const cleaning = costing.cleaningPerTray;
  const tray = seed + cocopeat + overhead + cleaning;
  const trays = traysPerBox(growth.gramsPerTray);
  const grown = tray * trays;
  /* A box is the cart's unit, 100 g, so per-100 g packing is added once. */
  const packing = (costing.packingPer100g * GRAMS_PER_UNIT) / 100 + costing.packingPerBox;
  return {
    ok: true,
    cost: {
      seedGramsPerTray: growth.seedGramsPerTray,
      gramsPerTray: growth.gramsPerTray,
      harvests: growth.harvests,
      seed,
      cocopeat,
      overhead,
      cleaning,
      tray,
      traysPerBox: trays,
      grown,
      packing,
      per100g: grown + packing,
    },
  };
}

/**
 * A box's price from its cost: the markup, or cost plus the minimum profit,
 * whichever is higher — both rounded the same way (`retailPrice`), so the
 * floor never lands a rupee under itself or off the ₹9 ending over ₹300.
 */
export function boxPrice(cost: number, costing: VarietyCosting): number {
  const marked = retailPrice(cost, costing.margin);
  if (costing.minProfitPerBox <= 0) return marked;
  const floor = retailPrice(cost + costing.minProfitPerBox, {
    markupPercent: 0,
    roundUpToNearest: costing.margin.roundUpToNearest,
  });
  return Math.max(marked, floor);
}

/** What a variety's row should hold: its cost and price per 100 g, or a price
 *  of 0 and no cost when it cannot be priced. */
export function varietyPrice(
  growth: LoggedGrowth | undefined,
  seedCostPer100g: number | undefined,
  costing: VarietyCosting,
): { pricePer100g: number; costPer100g?: number } {
  const result = varietyCost(growth, seedCostPer100g, costing);
  if (!result.ok) return { pricePer100g: 0 };
  /* Paise, so a stored cost reads back as the figure on the screen. */
  const costPer100g = Math.round(result.cost.per100g * 100) / 100;
  return { pricePer100g: boxPrice(costPer100g, costing), costPer100g };
}
