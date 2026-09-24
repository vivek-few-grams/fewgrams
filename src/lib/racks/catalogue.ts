import { cache } from "react";
import {
  listAngleRackModels,
  listPipeRackModels,
  listRackModels,
  loadRateCard,
  priceable,
} from "@/lib/repo/racks";
import {
  ANGLE_PIECES_PER_SHELF,
  angleRackSku,
  pipeRackPiecesFt,
  pipeRackSku,
  rackCapacityKg,
  rackSku,
} from "./pricing";
import { isRackColour, type RackColour } from "./colours";
import { parseRackCartKey, type RackRange } from "./cart-key";

/**
 * The rack catalogue as a customer meets it — SPEC §19.6, §19.7.
 *
 * ## What this layer is for
 *
 * Three ranges live in three model tables with three config shapes, priced
 * from one rate card, and *none* of them carries a name, a footprint or a
 * colour list on the row: a `RackModel` holds `{ heightFt, shelves, plateId,
 * angleId }` and a price. Everything a buyer needs to see — 1¼ × 3 ft, 1.4 mm,
 * available in orange — is on the rate card behind those ids.
 *
 * So every customer surface would otherwise have to load the card, join it to
 * three model lists, and know which range keeps its footprint in `plates`,
 * which in `frames` and which in `pipes`. This does that join once and hands
 * back one flat shape.
 *
 * ## Why the join can fail, and why that means "not for sale"
 *
 * A model referencing a **retired** plate, grade, frame or pipe size cannot be
 * described or SKU'd, so it is dropped rather than rendered with blanks. That
 * is deliberately the same answer the pricing layer gives: a rack whose parts
 * have gone is not a rack anyone can order, and half a description is worse
 * than an absence. It is also why this is the single gate — `sellable()` in the
 * cart actions asks this module rather than re-deriving the test.
 *
 * ## The price is read, never recomputed
 *
 * `model.price` is stored and re-cascaded by `repriceAllRacks` on every rate
 * edit, precisely so a cart, a receipt and an order line quote one concrete
 * figure. Recomputing it here would be a second answer to what a rack costs,
 * and the two would disagree the moment a rate changed between the write and
 * the read. `costAtPublish` stays admin-only: it is the margin, not a price.
 */

/** One buyable rack, with everything a page or a cart line needs to describe
 *  it. Flat on purpose: nothing downstream should have to hold a rate card. */
export type SellableRack = {
  range: RackRange;
  /** `RK-6F-5S-1.25x3-1.4` — the packing-slip identifier, uppercase as built. */
  sku: string;
  heightFt: number;
  shelves: number;
  depthFt: number;
  lengthFt: number;
  /** Angle gauge in mm, or **null for pipe**: there is one pipe spec, so a
   *  gauge segment would be a distinction without a difference (SPEC §21). */
  gaugeMm: number | null;
  /**
   * Load across the whole rack, or null when the vendor has not quoted one.
   *
   * Only the plated range has a figure: it is the plate's own stated load times
   * the shelf count. The open-frame and pipe ranges have no shelf to rate, and
   * the vendor has never quoted the uprights, so null here means "not quoted"
   * rather than "zero" — and a page must not print a 0 kg rack.
   */
  capacityKg: number | null;
  /**
   * The colours this rack can be powder-coated in, from its angle grade.
   *
   * **Empty for pipe**, which is white and offers no choice. A caller must
   * branch on that rather than defaulting, because an empty selector and a
   * one-option selector are different things to show a buyer.
   */
  colours: RackColour[];
  /** ₹, as published. See the note above on why it is not recomputed. */
  price: number;
  /** Packed grams per shelf, from the plate, frame or pipe size — or null
   *  until the owner has weighed one, when a courier cannot price it. */
  gramsPerShelf: number | null;
  /**
   * How it packs for the courier — SPEC §7 (the owner, 24 Sep 2026).
   *
   * - **Shelf racks** are a stack of plates: each adds the plate's
   *   `packedCm`.
   * - **Angle racks** are a bundle of slotted angle: the L-shaped pieces nest,
   *   each taking `widthCm` across and adding `stackCm`.
   * - **Pipe racks** are a bundle of pipe, which cannot nest: every piece is
   *   listed by length and laid into lines, and the lines are grouped square,
   *   each pipe a `diameterCm` each way (`rackBox`).
   *
   * Any figure null until the owner has measured it, when a courier cannot
   * price the rack.
   */
  packing:
    | { kind: "plates"; shelfCm: number | null }
    | { kind: "bundle"; pieces: number; widthCm: number | null; stackCm: number | null }
    | { kind: "pipes"; piecesFt: number[]; diameterCm: number | null };
};

/**
 * Every rack currently on sale, across all three ranges.
 *
 * `cache`d per request: a range page renders its own selector and the cart
 * hydrates several lines, and all of them want the same four table reads.
 *
 * Sorted by range then by height then by footprint, so a selector built
 * straight off this list reads smallest-first without re-sorting.
 */
export const listSellableRacks = cache(async (): Promise<SellableRack[]> => {
  const stored = await loadRateCard();
  const card = priceable(stored);
  /* No settings means the rate card cannot price anything, so there is nothing
     on sale — not an error. Same contract the admin screens use. */
  if (!card) return [];

  const [shelf, angle, pipe] = await Promise.all([
    listRackModels({ activeOnly: true }),
    listAngleRackModels({ activeOnly: true }),
    listPipeRackModels({ activeOnly: true }),
  ]);

  const gradeColours = (angleId: string): RackColour[] | null => {
    const grade = card.angles.find((a) => a.id === angleId);
    if (!grade) return null;
    /* Filtered rather than cast: a colour removed from the palette must not
       reach a `<select>` with no label to render. */
    return grade.colours.filter(isRackColour);
  };

  const out: SellableRack[] = [];

  for (const m of shelf) {
    const plate = card.plates.find((p) => p.id === m.config.plateId);
    const grade = card.angles.find((a) => a.id === m.config.angleId);
    const colours = gradeColours(m.config.angleId);
    if (!plate || !grade || !colours?.length) continue;
    out.push({
      range: "shelf",
      sku: rackSku(m.config, plate, grade),
      heightFt: m.config.heightFt,
      shelves: m.config.shelves,
      depthFt: plate.depthFt,
      lengthFt: plate.lengthFt,
      gaugeMm: grade.thicknessMm,
      capacityKg: rackCapacityKg(m.config, card),
      colours,
      price: m.price,
      gramsPerShelf: plate.gramsPerShelf ?? null,
      packing: { kind: "plates", shelfCm: plate.packedCm ?? null },
    });
  }

  for (const m of angle) {
    const frame = card.frames.find((f) => f.id === m.config.frameId);
    const grade = card.angles.find((a) => a.id === m.config.angleId);
    const colours = gradeColours(m.config.angleId);
    if (!frame || !grade || !colours?.length) continue;
    out.push({
      range: "angle",
      sku: angleRackSku(m.config, frame, grade),
      heightFt: m.config.heightFt,
      shelves: m.config.shelves,
      depthFt: frame.depthFt,
      lengthFt: frame.lengthFt,
      gaugeMm: grade.thicknessMm,
      /* No plate to rate and the uprights are unquoted — see `capacityKg`. */
      capacityKg: null,
      colours,
      price: m.price,
      gramsPerShelf: frame.gramsPerShelf ?? null,
      packing: {
        kind: "bundle",
        pieces: card.settings.legsPerRack + m.config.shelves * ANGLE_PIECES_PER_SHELF,
        widthCm: card.settings.angleWidthCm ?? null,
        stackCm: card.settings.angleStackCm ?? null,
      },
    });
  }

  for (const m of pipe) {
    const size = card.pipes.find((p) => p.id === m.config.pipeSizeId);
    if (!size) continue;
    out.push({
      range: "pipe",
      sku: pipeRackSku(m.config, size),
      heightFt: m.config.heightFt,
      shelves: m.config.shelves,
      depthFt: size.depthFt,
      lengthFt: size.lengthFt,
      gaugeMm: null,
      capacityKg: null,
      colours: [],
      price: m.price,
      gramsPerShelf: size.gramsPerShelf ?? null,
      packing: {
        kind: "pipes",
        piecesFt: pipeRackPiecesFt(m.config, size, card.settings),
        diameterCm: card.pipeSettings?.pipeDiameterCm ?? null,
      },
    });
  }

  const order: Record<RackRange, number> = { shelf: 0, angle: 1, pipe: 2 };
  return out.sort(
    (a, b) =>
      order[a.range] - order[b.range] ||
      a.heightFt - b.heightFt ||
      a.lengthFt - b.lengthFt ||
      a.depthFt - b.depthFt,
  );
});

/** One range's racks. A thin filter, so a page does not repeat the predicate. */
export async function listRacksInRange(range: RackRange): Promise<SellableRack[]> {
  return (await listSellableRacks()).filter((r) => r.range === range);
}

/**
 * The rack a cart key refers to, or null.
 *
 * **The single sellable test for the kind.** Null covers every way a line can
 * fail — a malformed key, a model that was never published, one since made
 * inactive, one whose parts were retired, and a colour its grade does not come
 * in. The caller does not get to distinguish them, because the customer-facing
 * answer is the same for all five: this is not something you can order.
 */
export async function findSellableRack(
  key: string,
): Promise<{ rack: SellableRack; colour: RackColour | null } | null> {
  const parsed = parseRackCartKey(key);
  if (!parsed) return null;

  const rack = (await listSellableRacks()).find(
    (r) => r.range === parsed.range && r.sku.toLowerCase() === parsed.sku,
  );
  if (!rack) return null;

  /* A colour the grade no longer offers fails here rather than on the order
     sheet. `colours` is empty for pipe, where `colour` is null and matches. */
  if (parsed.colour === null) {
    if (rack.colours.length > 0) return null;
  } else if (!rack.colours.includes(parsed.colour)) {
    return null;
  }

  return { rack, colour: parsed.colour };
}
