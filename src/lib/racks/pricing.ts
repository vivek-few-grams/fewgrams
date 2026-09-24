import type {
  AngleGrade,
  AngleRackConfig,
  FrameSize,
  PipeRackConfig,
  PipeRackCost,
  PipeSettings,
  PipeSize,
  RackConfig,
  RackCost,
  RackSettings,
  ShelfPlate,
} from "@/lib/types";

/**
 * Rack pricing — the whole of it, and pure.
 *
 * Nothing here reads a database or a request. That is deliberate: this is the
 * one piece of the rack feature that has a right answer, the owner verified
 * that answer by hand, and `pricing.test.ts` pins their worked example. A
 * function that also fetched its inputs could not be pinned that way.
 *
 * The model, confirmed with the vendor on 16 Sep 2026:
 *
 * ```
 * cost = legsPerRack × heightFt × ratePerFt      four legs, angle by the foot
 *      + shelves × platePrice                    one plate per shelf
 *      + shelves × boltSetsPerShelf × boltSet    8 bolt+nut pairs per shelf
 *      + bushesPerRack × bushPrice               4 per rack, NOT per shelf
 * ```
 *
 * The plate is the brace, which is why no horizontal or diagonal members
 * appear in the bill: four legs plus the shelves is the entire frame, and it
 * is why the plate is priced by footprint rather than by the foot.
 *
 * **Three rack categories share this module and this rate card**, all added
 * within two days of each other:
 *
 * | Range | A shelf is | Priced by |
 * |---|---|---|
 * | plated steel | a bought plate | `rackCost` |
 * | open angle frame | 3 × length + 2 × depth ft of angle | `angleRackCost` |
 * | UPVC pipe | 2 × (length + depth) ft of pipe, on four-way fittings | `pipeRackCost` |
 *
 * The first two differ in exactly one line of the bill, so sharing is obvious.
 * The third shares less — its own pipe, connector and bush rates, its own
 * footprint list, no bolts at all — but it still belongs here, for the two
 * things it *does* share: `shelvesForHeight` and `retailPrice`. Those are the
 * rules that must never be allowed to differ between ranges, and a second file
 * is where they would start to.
 *
 * All three are pinned against the owner's own figures, and all three round
 * retail the same way. Every one of them is cheapest at the *plated* end,
 * which surprised the owner twice — see `angleRackCost` and `pipeRackCost`.
 */

/** The rate card, as one object, so a caller cannot pass three-quarters of it. */
export type RateCard = {
  settings: RackSettings;
  plates: ShelfPlate[];
  angles: AngleGrade[];
  /** Footprints for the open-frame range (SPEC §20). On the same card because
   *  they are priced from the same `angles` and the same `settings`; a second
   *  card would be a second bolt price waiting to disagree with the first. */
  frames: FrameSize[];
  /** Footprints for the UPVC pipe range (SPEC §21). Its own list because its
   *  sizes differ — no 1¼ ft depth, and a 2½ ft length nothing else offers. */
  pipes: PipeSize[];
  /** Pipe, connector and bush rates. **`null` is a real state**, not an
   *  error: the other two ranges price fine without them, so a fresh install
   *  reports every pipe rack unpriceable rather than refusing to load the
   *  card. Same contract as a retired part. */
  pipeSettings: PipeSettings | null;
};

/**
 * Itemised, because a single total cannot be checked against a vendor invoice
 * and these four lines can. The admin screen shows the working for exactly
 * that reason.
 *
 * Returns `null` on an unknown part rather than throwing or substituting zero.
 * A deactivated plate is the normal way this happens — the owner retires a
 * size that some published rack still references — and a rack silently
 * repricing to exclude its shelves would be far worse than one flagged as
 * unpriceable.
 */
export function rackCost(config: RackConfig, card: RateCard): RackCost | null {
  const plate = card.plates.find((p) => p.id === config.plateId);
  const angle = card.angles.find((a) => a.id === config.angleId);
  if (!plate || !angle) return null;

  const s = card.settings;
  const legs = s.legsPerRack * config.heightFt * angle.ratePerFt;
  const shelves = config.shelves * plate.price;
  const bolts = config.shelves * s.boltSetsPerShelf * s.boltSetPrice;
  const bushes = s.bushesPerRack * s.bushPrice;

  return { legs, shelves, bolts, bushes, total: legs + shelves + bolts + bushes };
}

/**
 * Material cost → what a customer pays.
 *
 * Rounds **up**. Rounding to the nearest multiple would put a ₹2,310 rack
 * with no markup at ₹2,300 — below cost — so the direction is not a
 * cosmetic choice. `Math.ceil` on the un-rounded value too, because a rack
 * priced at ₹2,310.40 should not invoice at ₹2,310.
 */
export function retailPrice(cost: number, settings: RackSettings): number {
  const marked = cost * (1 + settings.markupPercent / 100);
  const step = settings.roundUpToNearest;
  return step > 1 ? Math.ceil(marked / step) * step : Math.ceil(marked);
}

/**
 * How many shelves a rack of a given height has: **height in feet, minus one.**
 *
 * The vendor's rule, confirmed 17 Sep 2026 — 6 ft takes 5 shelves, 5 ft takes
 * 4, down to 2 ft taking 1. It is a *fixed* count, not a ceiling: a 6 ft rack
 * with 2 shelves is not something they build, so shelf count is not a choice
 * anyone makes. Everything that used to offer a range now derives one number.
 *
 * This replaced a `shelfPitchInches` setting ("minimum clear height per
 * tier"), which computed the same figures at 14 in but expressed a cap rather
 * than an identity, and so let a rack be published with fewer shelves than it
 * can physically have.
 *
 * `floor` before subtracting, so a height typed as 4.5 gives 3 rather than
 * 3.5, and clamped at 0 so a 1 ft height cannot produce a negative. A height
 * that yields 0 is rejected when the rates are saved, not here.
 */
export function shelvesForHeight(heightFt: number): number {
  return Math.max(0, Math.floor(heightFt) - 1);
}

/**
 * Every rack the rate card can build: each height on sale, in every active
 * shelf size and gauge.
 *
 * **One rack per height**, not one per shelf count. Shelves are `height − 1`
 * (see `shelvesForHeight`), so there is nothing to vary — an earlier version
 * enumerated 1 to the cap and produced 75 racks, 50 of which were frames the
 * vendor does not build.
 *
 * Active parts only. A retired plate should not be resurrected as a rack by a
 * bulk action, even though an already-published rack referencing one is kept
 * and flagged.
 *
 * Ordered shortest-first for the same reason `listRackModels` is, so a caller
 * inserting these gets them in display order rather than in loop order.
 */
export function allRackConfigs(card: RateCard): RackConfig[] {
  const plates = card.plates.filter((p) => p.active);
  const angles = card.angles.filter((a) => a.active);

  return [...card.settings.heightsFt]
    .sort((a, b) => a - b)
    .flatMap((heightFt) =>
      plates.flatMap((plate) =>
        angles.map((angle) => ({
          heightFt,
          shelves: shelvesForHeight(heightFt),
          plateId: plate.id,
          angleId: angle.id,
        })),
      ),
    );
}

/** Legs plus shelves is the whole frame, so total load is simply per-shelf
 *  capacity times the shelf count. Stated for the admin table; not a
 *  structural claim about the uprights, which the vendor has not quoted. */
export function rackCapacityKg(config: RackConfig, card: RateCard): number | null {
  const plate = card.plates.find((p) => p.id === config.plateId);
  return plate ? plate.capacityKg * config.shelves : null;
}

/** A stable, readable SKU so an order line means something on a packing slip.
 *  `RK-6F-5S-1.25x3-1.4` beats a UUID when the person picking it is the person
 *  who priced it.
 *
 *  No colour segment: colour is chosen at purchase, not published, so it
 *  belongs on the order line rather than in the model's identifier. */
export function rackSku(
  config: RackConfig,
  plate: ShelfPlate,
  angle: AngleGrade,
): string {
  return [
    "RK",
    `${config.heightFt}F`,
    `${config.shelves}S`,
    `${plate.depthFt}x${plate.lengthFt}`,
    `${angle.thicknessMm}`,
  ].join("-");
}

/* ──────────────── open-frame racks: pure slotted angle ──────────────── */

/**
 * The angle in one open-frame shelf level, in running feet:
 * **three along the length, two across the depth.**
 *
 * The owner's own description, 17 Sep 2026: *"if a user is asking for four
 * feet length and one feet depth we will have 3 four ft slotted angles and
 * two 1 feet slotted angle — two 4 feet slotted angle will be on the either
 * ends and one 4 feet slotted angle will be in the middle to provide the
 * support and also to install the LED tube lights."*
 *
 * So it is not four pieces but five: the perimeter rectangle, plus a mid-rail
 * along the length. `pricing.test.ts` pins that example at 14 ft.
 *
 * The mid-rail runs **along the length**, not across the depth. That is the
 * axis the owner named and it is the load-bearing one — a rail across a 1 ft
 * depth would brace nothing, and the LED tube it carries has to run the long
 * way for the light to fall down the shelf.
 */
export function frameFeetPerShelf(size: Pick<FrameSize, "depthFt" | "lengthFt">): number {
  return 3 * size.lengthFt + 2 * size.depthFt;
}

/** The same five pieces as `frameFeetPerShelf`, counted rather than measured —
 *  what an open-frame rack's courier bundle holds per level (SPEC §7). */
export const ANGLE_PIECES_PER_SHELF = 5;

/** Every running foot of angle in a finished open-frame rack — the legs plus
 *  the framing. Shown in the admin table because it is the one figure that can
 *  be checked straight against a vendor invoice: the rack is angle and almost
 *  nothing else. */
export function angleRackFeet(
  config: AngleRackConfig,
  card: RateCard,
): number | null {
  const frame = card.frames.find((f) => f.id === config.frameId);
  if (!frame) return null;
  return (
    card.settings.legsPerRack * config.heightFt +
    config.shelves * frameFeetPerShelf(frame)
  );
}

/**
 * Cost of an open-frame rack.
 *
 * ```
 * cost = legsPerRack × heightFt × ratePerFt                 same four legs
 *      + shelves × (3×length + 2×depth) × ratePerFt         the framing
 *      + shelves × boltSetsPerShelf × boltSet               unchanged
 *      + bushesPerRack × bushPrice                          unchanged
 * ```
 *
 * Only the second line differs from `rackCost`: a bought plate at its own
 * price becomes five lengths of angle at the grade's rate per foot. Everything
 * else is shared deliberately — the bolt and bush counts are taken as
 * identical on the owner's instruction, since any difference is negligible.
 *
 * The `shelves` line of the returned `RackCost` therefore means *framing*
 * rather than *plates*, which is why `RackCost` documents it as "whatever the
 * shelves cost". It stays itemised for the same reason: four lines can be
 * checked against an invoice and one total cannot.
 *
 * `null` on a retired footprint or grade, never a substituted zero — see
 * `rackCost`.
 */
export function angleRackCost(
  config: AngleRackConfig,
  card: RateCard,
): RackCost | null {
  const frame = card.frames.find((f) => f.id === config.frameId);
  const angle = card.angles.find((a) => a.id === config.angleId);
  if (!frame || !angle) return null;

  const s = card.settings;
  const legs = s.legsPerRack * config.heightFt * angle.ratePerFt;
  const shelves = config.shelves * frameFeetPerShelf(frame) * angle.ratePerFt;
  const bolts = config.shelves * s.boltSetsPerShelf * s.boltSetPrice;
  const bushes = s.bushesPerRack * s.bushPrice;

  return { legs, shelves, bolts, bushes, total: legs + shelves + bolts + bushes };
}

/** Every open-frame rack the card can build: each height on sale, in every
 *  active footprint and gauge. Shelves are `height − 1`, so one rack per
 *  height — same reasoning as `allRackConfigs`. */
export function allAngleRackConfigs(card: RateCard): AngleRackConfig[] {
  const frames = card.frames.filter((f) => f.active);
  const angles = card.angles.filter((a) => a.active);

  return [...card.settings.heightsFt]
    .sort((a, b) => a - b)
    .flatMap((heightFt) =>
      frames.flatMap((frame) =>
        angles.map((angle) => ({
          heightFt,
          shelves: shelvesForHeight(heightFt),
          frameId: frame.id,
          angleId: angle.id,
        })),
      ),
    );
}

/** `AR-6F-5S-1x4-1.4`. The `AR` prefix rather than `RK` so a packing slip
 *  never confuses an open frame with a plated rack of the same footprint —
 *  they look similar on paper and cost very differently. */
export function angleRackSku(
  config: AngleRackConfig,
  frame: FrameSize,
  angle: AngleGrade,
): string {
  return [
    "AR",
    `${config.heightFt}F`,
    `${config.shelves}S`,
    `${frame.depthFt}x${frame.lengthFt}`,
    `${angle.thicknessMm}`,
  ].join("-");
}

/* ────────────────────────── UPVC pipe racks ─────────────────────────── */

/**
 * The tallest pipe rack the owner builds: **6 ft**, their figure.
 *
 * A constant and not a setting, because it is not a commercial choice — a
 * 1 inch UPVC upright gets noticeably springy past about that, and the
 * `heightsFt` list is shared with two steel ranges that have no such limit.
 * If 8 ft is ever added there for steel, this stops the pipe range following
 * it into something that wobbles. Raise it here, deliberately, or not at all.
 */
export const PIPE_MAX_HEIGHT_FT = 6;

/** From this length, a shelf level gets a leg under its middle. The owner:
 *  *"if it is four feet then we will have a supporting leg in between so that
 *  the entire rack is stable."* */
export const PIPE_MID_SUPPORT_FROM_LENGTH_FT = 4;

/**
 * How many legs that middle support adds: **two, one on each long side.**
 *
 * The owner said "a supporting leg", singular, and this is the one place the
 * model reads more into the words than they strictly say. The reason: both
 * long rails span the length, so propping only one would leave the other
 * exactly as it was, and the reference photo shows the mid legs in a pair. It
 * is flagged for the owner rather than assumed silently — at 6 ft it is the
 * difference between ₹5,760 and ₹5,050 on a 2 × 4 ft rack, which is not a
 * rounding error. One number to change if they say one leg.
 */
export const PIPE_MID_SUPPORT_LEGS = 2;

/** Uprights in a finished pipe rack: the four corners, plus the middle
 *  support on anything long enough to need one. */
export function pipeRackLegs(
  size: Pick<PipeSize, "lengthFt">,
  settings: Pick<RackSettings, "legsPerRack">,
): number {
  return (
    settings.legsPerRack +
    (size.lengthFt >= PIPE_MID_SUPPORT_FROM_LENGTH_FT ? PIPE_MID_SUPPORT_LEGS : 0)
  );
}

/**
 * Pipe in one shelf level, in running feet: **the perimeter, and only the
 * perimeter** — `2 × (length + depth)`.
 *
 * Note what is *not* here, because it is the difference from the open-frame
 * angle rack: **no mid-rail.** An angle shelf gets a third length down the
 * middle to brace the span and carry an LED tube (`frameFeetPerShelf`). A
 * pipe shelf braces its span from *underneath* instead, with the middle
 * support leg, which is what the owner described. So a 4 ft level is 4 pieces
 * of pipe, not 5, and the extra material is vertical rather than horizontal.
 *
 * The middle support adds no footage to this figure either: it stands under
 * the existing long rails at their midpoint. It cuts each of them into two
 * pieces, but two halves of a 4 ft rail are still 4 ft of pipe.
 */
export function pipeFeetPerShelf(
  size: Pick<PipeSize, "depthFt" | "lengthFt">,
): number {
  return 2 * (size.lengthFt + size.depthFt);
}

/**
 * Every piece of pipe in a pipe rack, by length in feet — what its courier
 * bundle has to hold (SPEC §7). The uprights at the rack's height (corners
 * plus any middle support), then each level's rails: two across the depth,
 * and two along the length — or four halves once the middle support cuts each
 * long rail in two (see `pipeFeetPerShelf`).
 */
export function pipeRackPiecesFt(
  config: Pick<PipeRackConfig, "heightFt" | "shelves">,
  size: Pick<PipeSize, "depthFt" | "lengthFt">,
  settings: Pick<RackSettings, "legsPerRack">,
): number[] {
  const split = size.lengthFt >= PIPE_MID_SUPPORT_FROM_LENGTH_FT;
  const level = [
    size.depthFt,
    size.depthFt,
    ...(split ? Array(4).fill(size.lengthFt / 2) : [size.lengthFt, size.lengthFt]),
  ];
  return [
    ...Array(pipeRackLegs(size, settings)).fill(config.heightFt),
    ...Array.from({ length: config.shelves }, () => level).flat(),
  ];
}

/** Every running foot of pipe in a finished rack — uprights plus frames.
 *  Shown in the admin table for the same reason `angleRackFeet` is: on a rack
 *  that is pipe and fittings, this is the figure that checks straight against
 *  a vendor invoice. */
export function pipeRackFeet(
  config: PipeRackConfig,
  card: RateCard,
): number | null {
  const size = card.pipes.find((p) => p.id === config.pipeSizeId);
  if (!size) return null;
  return (
    pipeRackLegs(size, card.settings) * config.heightFt +
    config.shelves * pipeFeetPerShelf(size)
  );
}

/** Four-way connectors in a finished rack: **one per leg, per shelf level.**
 *
 *  The owner's own account of the build — *"to build and connect each and
 *  every pipe I will need four-way connector"* — so the same fitting is used
 *  at every junction, including the top corners where one of its four sockets
 *  goes unused. A corner takes two rails plus the leg above and below it; a
 *  middle-support junction takes the rail continuing each way plus the same
 *  two leg segments. Both are four ways, which is why one count covers them. */
export function pipeRackConnectors(
  config: PipeRackConfig,
  card: RateCard,
): number | null {
  const size = card.pipes.find((p) => p.id === config.pipeSizeId);
  if (!size) return null;
  return pipeRackLegs(size, card.settings) * config.shelves;
}

/**
 * Cost of a UPVC pipe rack.
 *
 * ```
 * cost = legs × heightFt × ratePerFt           uprights, pipe by the foot
 *      + shelves × 2 × (length + depth) × ratePerFt      the frames
 *      + legs × shelves × connectorPrice       one four-way per junction
 *      + legs × bushPrice                      one bottom bush per leg
 * ```
 *
 * **The connectors, not the pipe, set the price.** At ₹110 a fitting against
 * ₹25 a foot, a 6 ft rack's twenty connectors come to ₹2,200 — more than all
 * 69 ft of its pipe. Two consequences worth knowing before quoting:
 *
 * - **Height is dear.** Every extra foot of height is another shelf level, and
 *   a shelf level is four more connectors (six on a long rack) before a single
 *   foot of pipe: ₹440 of fittings against ₹175 of pipe on a 1 × 2½ ft level.
 * - **Depth is cheap.** Going from 1 ft to 2 ft deep adds pipe and nothing
 *   else — no extra junctions — so it is the one dimension that scales
 *   gently. 1 × 3 ft to 2 × 3 ft at 6 ft tall is ₹250 on a ₹3,840 rack.
 *
 * And the range as a whole is **the most expensive of the three**, not the
 * cheapest: at 6 ft on a 1½ × 3 ft footprint, plated steel is ₹2,810, the open
 * angle frame ₹3,460 and this ₹3,965. The owner did not pick it for price —
 * *"in this the stability is a bit important"* — but it is worth stating
 * plainly, since the other two ranges made the same surprise in the same
 * direction.
 *
 * `null` on a retired footprint, or before the pipe rates have been entered.
 * Never a substituted zero — see `rackCost`.
 */
export function pipeRackCost(
  config: PipeRackConfig,
  card: RateCard,
): PipeRackCost | null {
  const size = card.pipes.find((p) => p.id === config.pipeSizeId);
  const pipe = card.pipeSettings;
  if (!size || !pipe) return null;

  const legCount = pipeRackLegs(size, card.settings);
  const legs = legCount * config.heightFt * pipe.ratePerFt;
  const shelves = config.shelves * pipeFeetPerShelf(size) * pipe.ratePerFt;
  const connectors = legCount * config.shelves * pipe.connectorPrice;
  const bushes = legCount * pipe.bushPrice;

  return {
    legs,
    shelves,
    connectors,
    bushes,
    total: legs + shelves + connectors + bushes,
  };
}

/**
 * Every pipe rack the card can build: each height on sale **up to
 * `PIPE_MAX_HEIGHT_FT`**, in every active footprint.
 *
 * One rack per height and footprint — there is no grade or colour to vary, so
 * this range is a third smaller per footprint than the other two.
 *
 * Empty until the pipe rates exist, rather than enumerating racks that cannot
 * be priced.
 */
export function allPipeRackConfigs(card: RateCard): PipeRackConfig[] {
  if (!card.pipeSettings) return [];
  const pipes = card.pipes.filter((p) => p.active);

  return [...card.settings.heightsFt]
    .filter((h) => h <= PIPE_MAX_HEIGHT_FT)
    .sort((a, b) => a - b)
    .flatMap((heightFt) =>
      pipes.map((size) => ({
        heightFt,
        shelves: shelvesForHeight(heightFt),
        pipeSizeId: size.id,
      })),
    );
}

/** `PR-6F-5S-1.5x3`. No gauge segment, because there is one pipe spec — which
 *  also means a pipe rack's SKU is shorter than the other two ranges' and
 *  cannot be confused with either. */
export function pipeRackSku(config: PipeRackConfig, size: PipeSize): string {
  return [
    "PR",
    `${config.heightFt}F`,
    `${config.shelves}S`,
    `${size.depthFt}x${size.lengthFt}`,
  ].join("-");
}

/* ─────────────────── repricing: rates cascade to prices ────────────── */

/** One row to write: the model, and the price and cost baseline it should
 *  carry now. */
export type Repriced<M> = {
  model: M;
  price: number;
  costAtPublish: number;
};

/**
 * Which published racks a rate change has moved, and to what.
 *
 * **This replaced the frozen-price-plus-approval model on 17 Sep 2026**, on the
 * owner's instruction: *"we need to add logic to update prices of all variants
 * as soon as primary raw material cost is updated, No need of approval."*
 *
 * Before, a rate edit moved a rack's *cost*, flagged the row with the old and
 * new figure, and left the selling price alone until someone pressed
 * Republish. That guarded against a rate edit moving a price under a customer
 * mid-checkout. It also meant every rate change left a queue of rows to accept
 * one at a time — which, across three ranges and a hundred racks, is the
 * recalculation by hand that this whole feature exists to remove. The owner
 * has weighed those and chosen the cascade. See SPEC §19.3.1 for what that
 * gives up and what still protects a live cart.
 *
 * Pure, and generic over all three ranges, so the plated, angle and pipe
 * cascades cannot drift apart — the caller passes its own cost function and
 * everything else is shared.
 *
 * Two kinds of row are deliberately **not** returned:
 *
 * - **Unpriceable ones.** A retired plate or an absent pipe rate means the
 *   cost is unknown, not zero. Repricing to ₹0 would put a free rack on sale;
 *   the row keeps its last good price and stays flagged.
 * - **Unchanged ones.** Both `price` and `costAtPublish` are compared, not
 *   just cost, because a markup edit moves the price while the cost stands
 *   still — and rounding means a small cost move often leaves the price where
 *   it was. Skipping these is what stops a bolt price of ₹2 → ₹2.01 rewriting
 *   a hundred rows and stamping a new `publishedAt` on every one of them.
 */
export function repricedRows<
  C,
  M extends { config: C; price: number; costAtPublish: number },
>(
  models: M[],
  cost: (config: C) => { total: number } | null,
  settings: RackSettings,
): Repriced<M>[] {
  const out: Repriced<M>[] = [];

  for (const model of models) {
    const now = cost(model.config);
    if (!now) continue;

    const price = retailPrice(now.total, settings);
    if (price === model.price && now.total === model.costAtPublish) continue;

    out.push({ model, price, costAtPublish: now.total });
  }

  return out;
}

/**
 * The vendor's own sheet, as handed over on 16 Sep 2026.
 *
 * Here so the owner can populate the screen with one click instead of typing
 * eight rows, and so the test has something real to run against. It is a
 * **seed, not a default**: nothing reads it at request time, the stored rate
 * card is always authoritative, and re-seeding is an explicit action.
 */
export const VENDOR_SEED: RateCard = {
  settings: {
    boltSetPrice: 2,
    bushPrice: 5,
    legsPerRack: 4,
    boltSetsPerShelf: 8,
    bushesPerRack: 4,
    heightsFt: [3, 4, 5, 6],
    markupPercent: 0,
    roundUpToNearest: 50,
  },
  plates: [
    { id: "p-1x3", depthFt: 1, lengthFt: 3, thicknessMm: 0.4, capacityKg: 10, price: 200, active: true },
    { id: "p-1.25x3", depthFt: 1.25, lengthFt: 3, thicknessMm: 0.6, capacityKg: 20, price: 250, active: true },
    { id: "p-1.5x3", depthFt: 1.5, lengthFt: 3, thicknessMm: 0.6, capacityKg: 30, price: 350, active: true },
    { id: "p-2x3", depthFt: 2, lengthFt: 3, thicknessMm: 1, capacityKg: 40, price: 550, active: true },
    { id: "p-1x2", depthFt: 1, lengthFt: 2, thicknessMm: 0.4, capacityKg: 20, price: 180, active: true },
  ],
  /**
   * **One grade, and only one: 1.4 mm powder-coated, at ₹40 a foot.**
   *
   * The vendor also quoted 1 mm at ₹25 and 1.2 mm at ₹30, both painted grey,
   * and those two were seeded inactive for a day on the reasoning that what
   * the vendor quoted and what Fewgrams sells are different things worth
   * keeping apart. The owner corrected it on 17 Sep 2026: *"we dont have 1 and
   * 1.2 mm painted slotted angles, its only 1.4 mm different colored
   * combination."* They are not stock that was retired — they were never
   * available. So they are gone, not switched off: an inactive row invites the
   * click that puts an unbuildable rack on sale.
   *
   * The consequence, and it is not small: **every rack's legs are ₹40 a foot**,
   * with no cheaper gauge to fall back on. On a 6 ft rack that is ₹960 of leg
   * before a single shelf.
   *
   * Colours are palette slugs, never display words — see
   * src/lib/racks/colours.ts for why the database holds `orange` and the label
   * is resolved in the UI. The colour is the only thing that varies within the
   * grade, and it changes nothing about the cost.
   */
  angles: [
    { id: "a-1.4", thicknessMm: 1.4, colours: ["orange", "green", "purple"], ratePerFt: 40, active: true },
  ],
  /**
   * Open-frame footprints (SPEC §20). **Not from the vendor's sheet** — there
   * is nothing to quote, because a frame is angle by the foot and any size is
   * buildable. This is a starting range, and it is two things deliberately:
   *
   * - the five plated footprints, so the two categories are comparable and a
   *   buyer can see what dropping the steel deck saves on the same size;
   * - plus 1 × 4 ft, the size the owner used to describe the rule.
   *
   * No price and no capacity on any of them — see `FrameSize`.
   */
  frames: [
    { id: "f-1x3", depthFt: 1, lengthFt: 3, active: true },
    { id: "f-1.25x3", depthFt: 1.25, lengthFt: 3, active: true },
    { id: "f-1.5x3", depthFt: 1.5, lengthFt: 3, active: true },
    { id: "f-2x3", depthFt: 2, lengthFt: 3, active: true },
    { id: "f-1x2", depthFt: 1, lengthFt: 2, active: true },
    { id: "f-1x4", depthFt: 1, lengthFt: 4, active: true },
  ],
  /** The owner's quote, 17 Sep 2026: 1 inch UPVC pipe at ₹25 a foot, the
   *  four-way connector at ₹110 a piece, the bottom bush at ₹10 a leg. */
  pipeSettings: { ratePerFt: 25, connectorPrice: 110, bushPrice: 10 },
  /**
   * The owner's own grid, and **a different one from the other two ranges**
   * (SPEC §21): three depths — 1, 1½ and 2 ft — by three lengths — 2½, 3 and
   * 4 ft.
   *
   * Two differences from the plated footprints, both deliberate on their part:
   * **1¼ ft depth is gone**, and **2½ ft length is new**. The 4 ft lengths are
   * the ones that carry the middle support leg.
   *
   * Nine sizes, and no price or capacity on any of them — see `PipeSize`.
   */
  pipes: [
    { id: "pp-1x2.5", depthFt: 1, lengthFt: 2.5, active: true },
    { id: "pp-1.5x2.5", depthFt: 1.5, lengthFt: 2.5, active: true },
    { id: "pp-2x2.5", depthFt: 2, lengthFt: 2.5, active: true },
    { id: "pp-1x3", depthFt: 1, lengthFt: 3, active: true },
    { id: "pp-1.5x3", depthFt: 1.5, lengthFt: 3, active: true },
    { id: "pp-2x3", depthFt: 2, lengthFt: 3, active: true },
    { id: "pp-1x4", depthFt: 1, lengthFt: 4, active: true },
    { id: "pp-1.5x4", depthFt: 1.5, lengthFt: 4, active: true },
    { id: "pp-2x4", depthFt: 2, lengthFt: 4, active: true },
  ],
};
