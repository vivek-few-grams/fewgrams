/**
 * What a courier bills a parcel at — SPEC §7.
 *
 * A courier charges the **larger** of the parcel's real weight and its
 * volumetric weight, `L × W × H (cm) ÷ 5000` kg. A flat-packed rack is where
 * this bites: a long box of light angle legs bills as far more than it weighs.
 * Delhivery reports the divisor on every quote (`divisor: 5000`), and it is
 * the Indian domestic norm, so it is declared once here rather than per
 * courier.
 */
export const VOLUMETRIC_DIVISOR = 5000;

export type BoxCm = { length: number; width: number; height: number };

/** Volumetric weight in grams, rounded up to the gram. */
export function volumetricGrams(box: BoxCm): number {
  return Math.ceil(((box.length * box.width * box.height) / VOLUMETRIC_DIVISOR) * 1000);
}

/** The weight to ask a courier to price: the larger of dead and volumetric.
 *  With no box, the dead weight — a seed packet is never bulk-limited. */
export function chargeableGrams(deadGrams: number, box: BoxCm | null): number {
  const dead = Math.ceil(deadGrams);
  return box ? Math.max(dead, volumetricGrams(box)) : dead;
}
