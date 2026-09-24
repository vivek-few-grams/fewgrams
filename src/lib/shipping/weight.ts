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

/**
 * A cube whose volumetric weight does not exceed `grams` — the box to declare
 * to a courier that asks for dimensions. We have already priced the parcel at
 * its chargeable weight (the larger of dead and volumetric, summed over every
 * box in the order), and an order of several boxes has no one set of
 * dimensions. Declaring this cube makes the courier bill the grams we send,
 * so every courier prices the same weight. Side = ⌊∛(grams × 5)⌋ cm, since a
 * cube of side s is s³ ÷ 5 g by volume.
 */
export function boxForGrams(grams: number): BoxCm {
  const side = Math.max(1, Math.floor(Math.cbrt((grams * VOLUMETRIC_DIVISOR) / 1000)));
  return { length: side, width: side, height: side };
}
