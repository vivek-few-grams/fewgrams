import type { CartKind } from "@/lib/cart/cart";
import { chargeableGrams, type BoxCm } from "./weight";

/**
 * What a courier order weighs as a parcel — SPEC §7.
 *
 * The cart knows what was bought; a courier prices what is carried, which is
 * the packing. Each kind is measured where its numbers already live, per the
 * owner (23 Sep 2026):
 *
 * - **Seeds** — by the grams ordered. Each 100 g packet is a 5 × 5 × 5 cm
 *   cube, which by size is 25 g, so the real weight always decides; the
 *   order's padding (admin → delivery) is added once.
 * - **Trays and drainage** — per product row: a piece's footprint, its
 *   height, the height each further stacked piece adds, and its grams. Every
 *   piece of one product in the order goes in one stack.
 * - **Grow media** — per product row, exactly as trays: a compressed block is
 *   one piece, and several blocks in one order go in one stack (SPEC §24).
 * - **Racks** — from the model: the legs set the box length (the longer of
 *   the rack's height and its shelf length). A shelf rack is a stack of
 *   plates, each adding its plate's packed thickness; an angle or pipe rack
 *   is a bundle of pieces, each adding its section (`rackBox`). Weight is the
 *   shelves times the grams per shelf of its shelf size.
 *
 * Greens are not here: an order with greens goes on the owner's own run at a
 * fixed fee (`deliveryCharge`), because a courier's overnight hub has no
 * cold chain.
 */

/** A 100 g seed packet, per the owner. */
export const SEED_PACKET_CM: BoxCm = { length: 5, width: 5, height: 5 };

const CM_PER_FT = 30.48;

export type TrayPacking = {
  packPieces: number;
  pieceLengthCm: number;
  pieceWidthCm: number;
  pieceHeightCm: number;
  pieceStackCm: number;
  pieceGrams: number;
};

export type RackPacking = {
  heightFt: number;
  shelves: number;
  depthFt: number;
  lengthFt: number;
  gramsPerShelf: number;
  /** How the box is built — see `SellableRack.packing`. Every figure here is
   *  measured; an unmeasured rack has no `RackPacking` at all. */
  stack:
    | { kind: "plates"; shelfCm: number }
    | { kind: "bundle"; pieces: number; widthCm: number; stackCm: number }
    | { kind: "pipes"; piecesFt: number[]; diameterCm: number };
};

/** The order-wide figures from admin → delivery. */
export type PackingRules = {
  /** Box and padding for the seeds in one order, added once. */
  seedPackingGrams: number;
};

/** A cart or order line with whatever its kind needs to be measured. Null
 *  packing means the owner has not measured that item yet. */
export type ParcelLine =
  | { kind: "variety"; units: number }
  | { kind: "seed"; units: number; grams: number | null }
  | { kind: "tray"; units: number; packing: TrayPacking | null }
  /* The same six figures as a tray — a block of coir stacks the way a tray
     does, so it is measured and boxed by the same rule. */
  | { kind: "media"; units: number; packing: TrayPacking | null }
  | { kind: "rack"; units: number; packing: RackPacking | null };

/** True when the order goes on the owner's own run rather than the courier. */
export function travelsOnOwnRun(lines: readonly { kind: CartKind }[]): boolean {
  return lines.some((l) => l.kind === "variety");
}

/** Every piece of one tray product in the order, as one stack. */
export function trayStack(p: TrayPacking, packs: number): { grams: number; box: BoxCm } {
  const pieces = p.packPieces * packs;
  return {
    grams: pieces * p.pieceGrams,
    box: {
      length: p.pieceLengthCm,
      width: p.pieceWidthCm,
      height: p.pieceHeightCm + (pieces - 1) * p.pieceStackCm,
    },
  };
}

/**
 * One flat-packed rack. The long side is always the longer of the legs and
 * the shelf length. Across it, one of two builds (the owner, 24 Sep 2026):
 *
 * - **Plates** stack: width is the shelf depth, height is the plates × each
 *   plate's packed thickness.
 * - **A bundle** of slotted angle: the L-shaped pieces nest, each `widthCm`
 *   across and adding `stackCm`, so 29 pieces of 2 in angle at 1 cm each is a
 *   5 × 29 cm section. Shorter pieces ride inside the length of the longest.
 * - **Pipes** do not nest (the owner, 24 Sep 2026): each takes its full
 *   diameter. So the pieces are laid into lines as long as the longest piece —
 *   two 2 ft rails end to end fill one 4 ft line — and the lines are grouped
 *   square: four lines of 1 in pipe are 2 × 2 in, nine are 3 × 3.
 */
export function rackBox(p: RackPacking): { grams: number; box: BoxCm } {
  const length = Math.max(p.heightFt, p.lengthFt) * CM_PER_FT;
  const grams = p.shelves * p.gramsPerShelf;
  if (p.stack.kind === "plates") {
    return { grams, box: { length, width: p.depthFt * CM_PER_FT, height: p.shelves * p.stack.shelfCm } };
  }
  if (p.stack.kind === "bundle") {
    return { grams, box: { length, width: p.stack.widthCm, height: p.stack.pieces * p.stack.stackCm } };
  }
  const lines = pipeLines(p.stack.piecesFt, Math.max(p.heightFt, p.lengthFt));
  const across = Math.ceil(Math.sqrt(lines));
  const down = Math.ceil(lines / across);
  return { grams, box: { length, width: across * p.stack.diameterCm, height: down * p.stack.diameterCm } };
}

/**
 * How many end-to-end lines of `lineFt` the pieces fill — first-fit
 * decreasing, longest pieces placed first, each into the first line with room.
 * Not always the fewest possible lines, but never more than about a fifth
 * over, and for a rack's handful of equal rails it is exact. A piece longer
 * than a line gets a line of its own rather than being cut.
 */
export function pipeLines(piecesFt: readonly number[], lineFt: number): number {
  const room: number[] = [];
  for (const piece of [...piecesFt].sort((a, b) => b - a)) {
    /* A hair of tolerance, so two 2 ft halves of a 4 ft rail fill one line
       rather than tipping into a second on floating point. */
    const i = room.findIndex((r) => r + 1e-9 >= piece);
    if (i === -1) room.push(Math.max(0, lineFt - piece));
    else room[i] -= piece;
  }
  return room.length;
}

/**
 * Chargeable grams for a courier order as one shipment, or **null when any
 * line has not been measured** — refused rather than guessed, because a
 * parcel quoted lighter than it is costs the owner the difference.
 *
 * Each box is charged at the larger of its dead and volumetric weight and
 * the boxes summed, an upper bound on what the courier bills. The `switch`
 * is exhaustive on purpose: a fifth kind must decide how it travels
 * (CLAUDE.md, "a fourth kind means four branches").
 */
export function parcelGrams(lines: readonly ParcelLine[], rules: PackingRules): number | null {
  let grams = 0;
  let seedGrams = 0;
  let seedPackets = 0;
  for (const l of lines) {
    switch (l.kind) {
      case "variety":
        throw new Error("Greens travel on the own run, never by courier — see travelsOnOwnRun");
      case "seed":
        seedGrams += l.grams ?? 0;
        seedPackets += l.units;
        break;
      case "tray": {
        if (!l.packing) return null;
        const s = trayStack(l.packing, l.units);
        grams += chargeableGrams(s.grams, s.box);
        break;
      }
      case "media": {
        if (!l.packing) return null;
        const s = trayStack(l.packing, l.units);
        grams += chargeableGrams(s.grams, s.box);
        break;
      }
      case "rack": {
        if (!l.packing) return null;
        const r = rackBox(l.packing);
        grams += l.units * chargeableGrams(r.grams, r.box);
        break;
      }
      default: {
        const never: never = l;
        throw new Error(`No packing rule for ${JSON.stringify(never)}`);
      }
    }
  }
  if (seedPackets > 0) {
    /* One packet per 100 g unit; the packets' size only matters if it ever
       outweighs the seed, which at 25 g a packet it cannot. */
    const bySize = seedPackets * chargeableGrams(0, SEED_PACKET_CM);
    grams += Math.max(seedGrams, bySize) + rules.seedPackingGrams;
  }
  return Math.ceil(grams);
}
