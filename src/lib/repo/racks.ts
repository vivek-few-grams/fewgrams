import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import {
  AngleGradeEntity,
  AngleRackModelEntity,
  FrameSizeEntity,
  PipeRackModelEntity,
  PipeSettingsEntity,
  PipeSizeEntity,
  RackModelEntity,
  RackSettingsEntity,
  ShelfPlateEntity,
} from "@/lib/db/entities";
import { VENDOR_SEED, type RateCard } from "@/lib/racks/pricing";
import type {
  AngleGrade,
  AngleRackModel,
  FrameSize,
  PipeRackModel,
  PipeSettings,
  PipeSize,
  RackModel,
  RackSettings,
  ShelfPlate,
} from "@/lib/types";

/**
 * Rack rate card repository — SPEC §19–§21. Key layout in
 * src/lib/db/entities.ts.
 *
 * Everything lives in the single `RACKSPEC` partition, so `loadRateCard` is
 * six small Queries rather than a Scan, run in parallel — settings, plates,
 * angles, the open-frame footprints, and the pipe range's rates and
 * footprints. One load serves all three rack screens, which is the point of
 * keeping them in one partition: they share `shelvesForHeight`, the markup and
 * the rounding, and every screen shows the rates it prices from.
 *
 * **Either settings row may be absent**, which is the honest state of a fresh
 * install and not an error. `loadRateCard` reports `null` for it and the admin
 * screen says it has no figures. It deliberately does not fall back to
 * `VENDOR_SEED` silently — a price computed from figures nobody entered is
 * worse than a screen that admits it cannot price.
 *
 * The two are independent: the pipe rates being absent must not stop the
 * plated range pricing, which is why `pipeSettings` is nullable on the card
 * rather than a precondition for building one.
 */

export type StoredRateCard = {
  settings: RackSettings | null;
  plates: ShelfPlate[];
  angles: AngleGrade[];
  frames: FrameSize[];
  pipes: PipeSize[];
  pipeSettings: PipeSettings | null;
};

export async function loadRateCard(): Promise<StoredRateCard> {
  const [settings, plates, angles, frames, pipes, pipeSettings] = await Promise.all([
    getRackSettings(),
    listShelfPlates(),
    listAngleGrades(),
    listFrameSizes(),
    listPipeSizes(),
    getPipeSettings(),
  ]);
  return { settings, plates, angles, frames, pipes, pipeSettings };
}

/** Narrows a stored card to the shape the pure pricing functions take, or
 *  `null` when it cannot be priced yet. Callers get one check instead of
 *  three.
 *
 *  Only `settings` gates this. `pipeSettings` does not: a card without the
 *  pipe rates still prices both steel ranges, and `pipeRackCost` reports its
 *  own racks unpriceable — the same contract it uses for a retired part. */
export function priceable(card: StoredRateCard): RateCard | null {
  return card.settings ? { ...card, settings: card.settings } : null;
}

export async function getRackSettings(): Promise<RackSettings | null> {
  const { data } = await RackSettingsEntity.get({}).go(READ_OPTS);
  return data;
}

export async function putRackSettings(s: RackSettings): Promise<void> {
  await RackSettingsEntity.put(s).go();
}

/** Sorted by footprint so the table reads smallest-first however the rows
 *  were entered — DynamoDB returns them by `PLATE#<id>`, which is an
 *  identifier and not an order anyone means. */
export async function listShelfPlates(): Promise<ShelfPlate[]> {
  const { data } = await ShelfPlateEntity.query.byId({}).go(LIST_OPTS);
  return [...data].sort(
    (a, b) => a.lengthFt - b.lengthFt || a.depthFt - b.depthFt,
  );
}

export async function putShelfPlate(p: ShelfPlate): Promise<void> {
  await ShelfPlateEntity.put(p).go();
}

export async function deleteShelfPlate(id: string): Promise<void> {
  await ShelfPlateEntity.delete({ id }).go();
}

/** Sorted by gauge, which is also cheapest-first in the vendor's sheet. */
export async function listAngleGrades(): Promise<AngleGrade[]> {
  const { data } = await AngleGradeEntity.query.byId({}).go(LIST_OPTS);
  return [...data].sort((a, b) => a.thicknessMm - b.thicknessMm);
}

export async function putAngleGrade(a: AngleGrade): Promise<void> {
  await AngleGradeEntity.put(a).go();
}

export async function deleteAngleGrade(id: string): Promise<void> {
  await AngleGradeEntity.delete({ id }).go();
}

/**
 * Writes the vendor's sheet in one go, for a rate card that has none.
 *
 * **Additive, and it never overwrites.** An existing plate or angle id is left
 * exactly as it is, and settings are written only when absent. The button that
 * calls this sits next to live prices; if it clobbered an edited rate the one
 * time someone pressed it twice, it would be a worse feature than typing the
 * eight rows by hand.
 */
export async function seedRateCard(): Promise<void> {
  const current = await loadRateCard();

  const plateIds = new Set(current.plates.map((p) => p.id));
  const angleIds = new Set(current.angles.map((a) => a.id));

  const frameIds = new Set(current.frames.map((f) => f.id));
  const pipeIds = new Set(current.pipes.map((p) => p.id));

  await Promise.all([
    ...(current.settings ? [] : [putRackSettings(VENDOR_SEED.settings)]),
    ...VENDOR_SEED.plates.filter((p) => !plateIds.has(p.id)).map(putShelfPlate),
    ...VENDOR_SEED.angles.filter((a) => !angleIds.has(a.id)).map(putAngleGrade),
    ...VENDOR_SEED.frames.filter((f) => !frameIds.has(f.id)).map(putFrameSize),
    ...VENDOR_SEED.pipes.filter((p) => !pipeIds.has(p.id)).map(putPipeSize),
    ...(current.pipeSettings || !VENDOR_SEED.pipeSettings
      ? []
      : [putPipeSettings(VENDOR_SEED.pipeSettings)]),
  ]);
}

/**
 * Racks on sale, **shortest first**.
 *
 * Order is derived rather than typed (17 Sep 2026): height is what a buyer
 * compares racks by, so low-to-tall is the order without anyone deciding it.
 * The tie-breaks — shelf count, then shelf size, then gauge — exist only so
 * that two racks of the same height always come back in the same sequence; a
 * list that reshuffles between loads looks broken even when nothing changed.
 *
 * `plateId` and `angleId` are compared as strings, which is not numeric order
 * across footprints or gauges. That is deliberate: they are stable tiebreaks
 * inside one height-and-shelf-count group, not a ranking anyone reads.
 */
export async function listRackModels(
  opts: { activeOnly?: boolean } = {},
): Promise<RackModel[]> {
  const { data } = await RackModelEntity.query.byId({}).go(LIST_OPTS);
  const rows = opts.activeOnly ? data.filter((m) => m.active) : data;
  return [...rows].sort(
    (a, b) =>
      a.config.heightFt - b.config.heightFt ||
      a.config.shelves - b.config.shelves ||
      a.config.plateId.localeCompare(b.config.plateId) ||
      a.config.angleId.localeCompare(b.config.angleId),
  );
}

export async function putRackModel(m: RackModel): Promise<void> {
  await RackModelEntity.put(m).go();
}

export async function deleteRackModel(id: string): Promise<void> {
  await RackModelEntity.delete({ id }).go();
}

export async function getRackModel(id: string): Promise<RackModel | null> {
  const all = await listRackModels();
  return all.find((m) => m.id === id) ?? null;
}

/* ──────────────── open-frame racks: pure slotted angle ──────────────── */

/** Sorted by footprint, like plates — DynamoDB returns them by `FRAME#<id>`,
 *  which is an identifier and not an order anyone means. */
export async function listFrameSizes(): Promise<FrameSize[]> {
  const { data } = await FrameSizeEntity.query.byId({}).go(LIST_OPTS);
  return [...data].sort(
    (a, b) => a.lengthFt - b.lengthFt || a.depthFt - b.depthFt,
  );
}

export async function putFrameSize(f: FrameSize): Promise<void> {
  await FrameSizeEntity.put(f).go();
}

export async function deleteFrameSize(id: string): Promise<void> {
  await FrameSizeEntity.delete({ id }).go();
}

/** Open-frame racks, **shortest first** — same derived order as
 *  `listRackModels`, and the same reason for the tie-breaks: two racks of one
 *  height must come back in the same sequence every load. */
export async function listAngleRackModels(
  opts: { activeOnly?: boolean } = {},
): Promise<AngleRackModel[]> {
  const { data } = await AngleRackModelEntity.query.byId({}).go(LIST_OPTS);
  const rows = opts.activeOnly ? data.filter((m) => m.active) : data;
  return [...rows].sort(
    (a, b) =>
      a.config.heightFt - b.config.heightFt ||
      a.config.shelves - b.config.shelves ||
      a.config.frameId.localeCompare(b.config.frameId) ||
      a.config.angleId.localeCompare(b.config.angleId),
  );
}

export async function putAngleRackModel(m: AngleRackModel): Promise<void> {
  await AngleRackModelEntity.put(m).go();
}

export async function deleteAngleRackModel(id: string): Promise<void> {
  await AngleRackModelEntity.delete({ id }).go();
}

export async function getAngleRackModel(id: string): Promise<AngleRackModel | null> {
  const all = await listAngleRackModels();
  return all.find((m) => m.id === id) ?? null;
}

/* ────────────────────────── UPVC pipe racks ─────────────────────────── */

/** The pipe range's own material rates — SPEC §21. `null` before they are
 *  entered, which is a real state: the other two ranges price without them. */
export async function getPipeSettings(): Promise<PipeSettings | null> {
  const { data } = await PipeSettingsEntity.get({}).go(READ_OPTS);
  return data;
}

export async function putPipeSettings(s: PipeSettings): Promise<void> {
  await PipeSettingsEntity.put(s).go();
}

/** Sorted by footprint, like plates and frames — DynamoDB returns them by
 *  `PIPESIZE#<id>`, which is an identifier and not an order anyone means. */
export async function listPipeSizes(): Promise<PipeSize[]> {
  const { data } = await PipeSizeEntity.query.byId({}).go(LIST_OPTS);
  return [...data].sort(
    (a, b) => a.lengthFt - b.lengthFt || a.depthFt - b.depthFt,
  );
}

export async function putPipeSize(p: PipeSize): Promise<void> {
  await PipeSizeEntity.put(p).go();
}

export async function deletePipeSize(id: string): Promise<void> {
  await PipeSizeEntity.delete({ id }).go();
}

/** Pipe racks, **shortest first** — same derived order as the other two
 *  ranges. One tiebreak fewer, because there is no gauge to vary. */
export async function listPipeRackModels(
  opts: { activeOnly?: boolean } = {},
): Promise<PipeRackModel[]> {
  const { data } = await PipeRackModelEntity.query.byId({}).go(LIST_OPTS);
  const rows = opts.activeOnly ? data.filter((m) => m.active) : data;
  return [...rows].sort(
    (a, b) =>
      a.config.heightFt - b.config.heightFt ||
      a.config.shelves - b.config.shelves ||
      a.config.pipeSizeId.localeCompare(b.config.pipeSizeId),
  );
}

export async function putPipeRackModel(m: PipeRackModel): Promise<void> {
  await PipeRackModelEntity.put(m).go();
}

export async function deletePipeRackModel(id: string): Promise<void> {
  await PipeRackModelEntity.delete({ id }).go();
}

export async function getPipeRackModel(id: string): Promise<PipeRackModel | null> {
  const all = await listPipeRackModels();
  return all.find((m) => m.id === id) ?? null;
}
