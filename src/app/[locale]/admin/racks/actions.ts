"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { isRackColour } from "@/lib/racks/colours";
import {
  rackCost,
  retailPrice,
  shelvesForHeight,
  type RateCard,
} from "@/lib/racks/pricing";
import {
  deleteAngleGrade,
  deleteRackModel,
  deleteShelfPlate,
  getRackModel,
  listAngleGrades,
  listRackModels,
  listShelfPlates,
  loadRateCard,
  priceable,
  putAngleGrade,
  putRackModel,
  putRackSettings,
  putShelfPlate,
  seedRateCard,
} from "@/lib/repo/racks";
import { repriceAllRacks, revalidateRackScreens } from "@/lib/racks/reprice";
import { count, csv, err, money, optionalPositive, zeroOrMore, type FormState } from "@/lib/forms";
import type { AngleGrade, RackConfig, RackModel, RackSettings, ShelfPlate } from "@/lib/types";

/**
 * Rack rate card mutations — SPEC §19.
 *
 * SPEC §8: every action asserts the admin role itself. A server action is
 * addressable over HTTP independently of the page that renders its form.
 *
 * **Editing a rate reprices every rack that uses it, immediately.** The
 * owner's instruction, 17 Sep 2026: *"we need to add logic to update prices of
 * all variants as soon as primary raw material cost is updated, No need of
 * approval."* So `saveSettings`, `savePlate`, `saveAngle` and `seedRates` all
 * end in `repriceAllRacks`, and they reprice **all three ranges** rather than
 * just this screen's — the markup, rounding, heights and corner leg count are
 * shared, and the angle rate prices the legs of both steel ranges. Full
 * reasoning, and what it gives up, in `src/lib/racks/reprice.ts`.
 *
 * `addPlate`, `addAngle` and the toggles and deletes do **not** cascade, and
 * that is not an omission: a new part is referenced by no existing rack, and
 * retiring or deleting one makes racks *unpriceable* rather than cheaper —
 * they keep their last good price and stay flagged, which is the one case
 * where writing a new price would be wrong.
 */

function refresh() {
  revalidatePath("/[locale]/admin/racks", "page");
}

/** Write the rate, then cascade, then refresh all three screens. In that
 *  order: the cascade reads the card back from DynamoDB, so it can never
 *  price against a rate that failed to save. */
async function cascade() {
  await repriceAllRacks();
  revalidateRackScreens();
}

/* ──────────────────────────── seed ─────────────────────────────────── */

/** Writes the vendor's quoted sheet for a rate card that has none. Additive
 *  and idempotent — see `seedRateCard`. */
export async function seedRates(): Promise<void> {
  await assertRole("admin");
  await seedRateCard();
  await cascade();
}

/* ────────────────────────── rates and rules ─────────────────────────── */

export async function saveSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const boltSetPrice = money(fd, "boltSetPrice");
  if (boltSetPrice === null) return err("priceInvalid", "boltSetPrice");
  const bushPrice = money(fd, "bushPrice");
  if (bushPrice === null) return err("priceInvalid", "bushPrice");

  const legsPerRack = count(fd, "legsPerRack");
  if (legsPerRack === null) return err("countInvalid", "legsPerRack");
  const boltSetsPerShelf = count(fd, "boltSetsPerShelf");
  if (boltSetsPerShelf === null) return err("countInvalid", "boltSetsPerShelf");
  const bushesPerRack = count(fd, "bushesPerRack");
  if (bushesPerRack === null) return err("countInvalid", "bushesPerRack");

  /* Deduplicated and sorted, so "6, 3, 6, 4" becomes a sane range rather
     than a repeated dropdown option.
     At least 2 ft: shelves are `height − 1`, so a 1 ft rack would have none
     and a 0.5 ft one a negative count. Rejecting the height here is better
     than clamping later, because the clamp would silently sell a frame with
     no shelves in it. */
  const heightsFt = [...new Set(csv(fd, "heightsFt").map(Number))]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (heightsFt.length === 0) return err("heightsInvalid", "heightsFt");
  if (heightsFt.some((h) => shelvesForHeight(h) < 1))
    return err("heightTooShort", "heightsFt");

  const markupPercent = zeroOrMore(fd, "markupPercent");
  if (markupPercent === null) return err("zeroOrMore", "markupPercent");
  const roundUpToNearest = count(fd, "roundUpToNearest");
  if (roundUpToNearest === null) return err("countInvalid", "roundUpToNearest");

  /* Optional, like a plate's grams: flagged while blank, and an angle rack
     cannot go by courier until both are set (SPEC §7). */
  const angleWidthCm = optionalPositive(fd, "angleWidthCm");
  if (angleWidthCm === "invalid") return err("packedInvalid", "angleWidthCm");
  const angleStackCm = optionalPositive(fd, "angleStackCm");
  if (angleStackCm === "invalid") return err("packedInvalid", "angleStackCm");

  const settings: RackSettings = {
    boltSetPrice,
    bushPrice,
    legsPerRack,
    boltSetsPerShelf,
    bushesPerRack,
    heightsFt,
    markupPercent,
    roundUpToNearest,
    ...(angleWidthCm !== undefined ? { angleWidthCm } : {}),
    ...(angleStackCm !== undefined ? { angleStackCm } : {}),
  };
  await putRackSettings(settings);
  /* Markup and rounding live on this row, so this save can move every price
     in all three ranges without a single material rate changing. */
  await cascade();
  return { status: "saved" };
}

/* ──────────────────────────── shelf plates ─────────────────────────── */

function readPlate(fd: FormData): { ok: true; value: Omit<ShelfPlate, "id"> } | { ok: false; state: FormState } {
  const depthFt = money(fd, "depthFt");
  if (depthFt === null) return { ok: false, state: err("dimensionInvalid", "depthFt") };
  const lengthFt = money(fd, "lengthFt");
  if (lengthFt === null) return { ok: false, state: err("dimensionInvalid", "lengthFt") };
  const thicknessMm = money(fd, "thicknessMm");
  if (thicknessMm === null) return { ok: false, state: err("dimensionInvalid", "thicknessMm") };
  const capacityKg = money(fd, "capacityKg");
  if (capacityKg === null) return { ok: false, state: err("dimensionInvalid", "capacityKg") };
  const price = money(fd, "price");
  if (price === null) return { ok: false, state: err("priceInvalid", "price") };
  /* Optional: a plate can be priced before it has been weighed. A blank is
     flagged on the row and refused at courier checkout (SPEC §7). */
  const gramsPerShelf = optionalPositive(fd, "gramsPerShelf");
  if (gramsPerShelf === "invalid") return { ok: false, state: err("gramsInvalid", "gramsPerShelf") };
  /* Same rule: optional, flagged while blank, refused at courier checkout. */
  const packedCm = optionalPositive(fd, "packedCm");
  if (packedCm === "invalid") return { ok: false, state: err("packedInvalid", "packedCm") };

  return {
    ok: true,
    value: {
      depthFt,
      lengthFt,
      thicknessMm,
      capacityKg,
      price,
      active: fd.get("active") === "on",
      ...(gramsPerShelf !== undefined ? { gramsPerShelf } : {}),
      ...(packedCm !== undefined ? { packedCm } : {}),
    },
  };
}

/**
 * The id is derived from the footprint — `p-1.25x3` — not a UUID.
 *
 * A rack model stores `plateId`, and an operator reading a model row, a
 * packing slip or a DynamoDB item should be able to tell which shelf it means.
 * Re-adding a size the owner deleted also lands on the same id, which silently
 * re-prices the racks that referenced it — the forgiving behaviour, and the
 * reason a plate id is not random.
 */
export async function addPlate(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readPlate(fd);
  if (!read.ok) return read.state;
  const { depthFt, lengthFt } = read.value;
  await putShelfPlate({ id: `p-${depthFt}x${lengthFt}`, ...read.value });
  refresh();
  return { status: "saved" };
}

export async function savePlate(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "").trim();
  if (!id || !(await listShelfPlates()).some((p) => p.id === id)) return err("notFound");
  const read = readPlate(fd);
  if (!read.ok) return read.state;
  await putShelfPlate({ id, ...read.value });
  await cascade();
  return { status: "saved" };
}

export async function togglePlate(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const current = (await listShelfPlates()).find((p) => p.id === id);
  if (!current) throw new Error("Shelf plate not found");
  await putShelfPlate({ ...current, active: !current.active });
  refresh();
}

export async function removePlate(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteShelfPlate(String(fd.get("id")));
  refresh();
}

/* ──────────────────────────── angle grades ─────────────────────────── */

function readAngle(fd: FormData): { ok: true; value: Omit<AngleGrade, "id"> } | { ok: false; state: FormState } {
  const thicknessMm = money(fd, "thicknessMm");
  if (thicknessMm === null) return { ok: false, state: err("dimensionInvalid", "thicknessMm") };
  const ratePerFt = money(fd, "ratePerFt");
  if (ratePerFt === null) return { ok: false, state: err("priceInvalid", "ratePerFt") };
  /* `ColourSelect` posts one hidden input per picked slug, so the value
     arrives as repeated fields rather than a joined string. Deduplicated
     because the form should never send a slug twice and a grade listing
     "orange, orange" would render two identical swatches. */
  const colours = [...new Set(fd.getAll("colours").map(String))];
  if (colours.length === 0) return { ok: false, state: err("coloursRequired", "colours") };
  /* The palette is enforced here as well as in the picker: a server action is
     addressable over HTTP without the form that renders it, and a colour off
     the palette has no swatch, so a rack built on it would show a blank dot. */
  if (!colours.every(isRackColour))
    return { ok: false, state: err("colourInvalid", "colours") };

  /* No `finish`: every rack is powder-coated (17 Sep 2026), so the field was
     removed rather than left as a select with one right answer. */
  return { ok: true, value: { thicknessMm, colours, ratePerFt, active: fd.get("active") === "on" } };
}

/** Keyed by gauge, for the same reason plates are keyed by footprint: `a-1.4`
 *  is readable where a UUID is not. One row per gauge is also the vendor's own
 *  structure — they quote 1, 1.2 and 1.4 mm, and finish follows from it. */
export async function addAngle(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readAngle(fd);
  if (!read.ok) return read.state;
  await putAngleGrade({ id: `a-${read.value.thicknessMm}`, ...read.value });
  refresh();
  return { status: "saved" };
}

export async function saveAngle(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "").trim();
  if (!id || !(await listAngleGrades()).some((a) => a.id === id)) return err("notFound");
  const read = readAngle(fd);
  if (!read.ok) return read.state;
  await putAngleGrade({ id, ...read.value });
  /* The angle rate prices the legs of both steel ranges, so this cascades
     beyond this screen. */
  await cascade();
  return { status: "saved" };
}

export async function toggleAngle(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const current = (await listAngleGrades()).find((a) => a.id === id);
  if (!current) throw new Error("Angle grade not found");
  await putAngleGrade({ ...current, active: !current.active });
  refresh();
}

export async function removeAngle(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteAngleGrade(String(fd.get("id")));
  refresh();
}

/* ───────────────────────── racks on sale ───────────────────────────── */

/**
 * Validates a config against the rate card.
 *
 * The server-side half of rules the form already expresses — checked here
 * because a server action is addressable over HTTP without its form.
 *
 * No colour check: colour left the config on 17 Sep 2026, because the angle
 * grade already lists what it comes in and that list applies to every rack
 * built on it.
 */
function validateConfig(
  config: RackConfig,
  card: RateCard,
): { ok: true } | { ok: false; state: FormState } {
  const plate = card.plates.find((p) => p.id === config.plateId);
  if (!plate) return { ok: false, state: err("plateUnknown", "plateId") };
  if (!card.angles.some((a) => a.id === config.angleId))
    return { ok: false, state: err("angleUnknown", "angleId") };
  if (!card.settings.heightsFt.includes(config.heightFt))
    return { ok: false, state: err("heightUnknown", "heightFt") };

  /* No shelf-count check: `readConfig` derives it from the height, so there is
     no value a caller could get wrong. */
  return { ok: true };
}

function readConfig(fd: FormData): { ok: true; value: RackConfig } | { ok: false; state: FormState } {
  const heightFt = money(fd, "heightFt");
  if (heightFt === null) return { ok: false, state: err("dimensionInvalid", "heightFt") };

  return {
    ok: true,
    value: {
      heightFt,
      /* Derived, never posted. Shelves are `height − 1` and the form has no
         field for them, so there is nothing here to validate or to trust. */
      shelves: shelvesForHeight(heightFt),
      plateId: String(fd.get("plateId") ?? "").trim(),
      angleId: String(fd.get("angleId") ?? "").trim(),
    },
  };
}

/**
 * Publishes a rack: computes cost from the current rate card, sets the selling
 * price from the markup, and records the cost it was priced against.
 *
 * `costAtPublish` is the whole reason this screen can promise the owner they
 * never recalculate. It is the baseline the table compares the live cost to,
 * which turns "a rate changed somewhere" into "this rack was ₹2,310 and is now
 * ₹2,390".
 */
export async function addModel(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const card = priceable(await loadRateCard());
  if (!card) return err("notFound");

  const read = readConfig(fd);
  if (!read.ok) return read.state;
  const valid = validateConfig(read.value, card);
  if (!valid.ok) return valid.state;

  const existing = await listRackModels();
  if (existing.some((m) => sameConfig(m.config, read.value)))
    return err("duplicateRack", "plateId");

  const cost = rackCost(read.value, card);
  if (!cost) return err("notFound");

  /* No sort order to set: the list is ordered shortest-rack-first, derived
     from the config (see `listRackModels`). */
  await putRackModel({
    id: crypto.randomUUID(),
    config: read.value,
    price: retailPrice(cost.total, card.settings),
    costAtPublish: cost.total,
    publishedAt: new Date().toISOString(),
    active: fd.get("active") === "on",
  });
  refresh();
  return { status: "saved" };
}

function sameConfig(a: RackConfig, b: RackConfig): boolean {
  return (
    a.heightFt === b.heightFt &&
    a.shelves === b.shelves &&
    a.plateId === b.plateId &&
    a.angleId === b.angleId
  );
}

/**
 * The owner's own price, overriding what the markup suggests. The only field
 * a published rack has left to edit.
 *
 * Deliberately separate from `republishModel`: a round number the owner wants
 * on the shop shelf is not the same decision as accepting a recomputed one,
 * and this also re-baselines `costAtPublish` so setting a price by hand clears
 * the stale flag rather than leaving it nagging.
 */
export async function saveModel(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const current = await getRackModel(String(fd.get("id") ?? "").trim());
  if (!current) return err("notFound");

  const price = money(fd, "price");
  if (price === null) return err("priceInvalid", "price");

  const card = priceable(await loadRateCard());
  const cost = card ? rackCost(current.config, card) : null;

  await putRackModel({
    ...current,
    price,
    /* Accepting a hand-set price re-baselines the comparison. Leaving the old
       baseline would flag the rack as stale forever, and a warning that never
       clears is a warning nobody reads. An unpriceable rack keeps its old
       baseline, because there is no current cost to adopt. */
    ...(cost ? { costAtPublish: cost.total, publishedAt: new Date().toISOString() } : {}),
  });
  refresh();
  return { status: "saved" };
}

/** Recompute from the current rate card and accept the result. */
export async function republishModel(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  await republish([current]);
  refresh();
}

async function republish(models: RackModel[]): Promise<void> {
  const card = priceable(await loadRateCard());
  if (!card) return;

  await Promise.all(
    models.map(async (m) => {
      const cost = rackCost(m.config, card);
      /* Unpriceable racks are skipped rather than zeroed. Its plate or grade
         has been retired; the row stays flagged until the owner points it at
         one that exists. */
      if (!cost || cost.total === m.costAtPublish) return;
      await putRackModel({
        ...m,
        price: retailPrice(cost.total, card.settings),
        costAtPublish: cost.total,
        publishedAt: new Date().toISOString(),
      });
    }),
  );
}

export async function toggleModel(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  await putRackModel({ ...current, active: !current.active });
  refresh();
}

export async function removeModel(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteRackModel(String(fd.get("id")));
  refresh();
}
