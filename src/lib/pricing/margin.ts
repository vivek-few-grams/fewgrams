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
 */
export function retailPrice(cost: number, margin: Margin): number {
  const marked = cost * (1 + margin.markupPercent / 100);
  const step = margin.roundUpToNearest;
  return step > 1 ? Math.ceil(marked / step) * step : Math.ceil(marked);
}

/** What a range prices at before anyone has set a margin: cost, to the rupee.
 *  Zero for the reason on `Margin.markupPercent`. */
export const NO_MARGIN: Margin = { markupPercent: 0, roundUpToNearest: 1 };

