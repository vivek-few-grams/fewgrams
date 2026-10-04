import type { Margin } from "@/lib/types";

/**
 * Cost → selling price, for everything priced by a markup on what it costs us
 * — the three rack ranges (SPEC §19.3.4), trays and drainage (§23) and grow
 * media (§24). One formula, so a rack and a block of cocopeat cannot round
 * differently.
 */

/**
 * Material cost → what a customer pays.
 *
 * Rounds **up**. Rounding to the nearest multiple would put a ₹2,310 rack
 * with no markup at ₹2,300 — below cost — so the direction is not a
 * cosmetic choice. `Math.ceil` on the un-rounded value too, because a rack
 * priced at ₹2,310.40 should not invoice at ₹2,310.
 *
 * **Over ₹300, it ends one rupee under the step** (the owner, 4 Oct 2026:
 * charm pricing for the bigger items only). A step of 10 gives ₹339 rather
 * than ₹340; a step of 100 gives ₹2,599. Still never below the marked-up
 * price: it is the smallest such price at or above it, so ₹390 exactly
 * becomes ₹399, not ₹389. At ₹300 or under the price stays round — ₹230, not
 * ₹229. Step 1 is no rounding.
 */
export function retailPrice(cost: number, margin: Margin): number {
  const marked = cost * (1 + margin.markupPercent / 100);
  const step = margin.roundUpToNearest;
  if (step <= 1) return Math.ceil(marked);
  const round = Math.ceil(marked / step) * step;
  return round > CHARM_PRICE_ABOVE ? Math.ceil((marked + 1) / step) * step - 1 : round;
}

/** A rounded price over this ends in 9; at or under it stays round. */
export const CHARM_PRICE_ABOVE = 300;

/** What a range prices at before anyone has set a margin: cost, to the rupee.
 *  Zero for the reason on `Margin.markupPercent`. */
export const NO_MARGIN: Margin = { markupPercent: 0, roundUpToNearest: 1 };

