"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import {
  angleRackCost,
  retailPrice,
  shelvesForHeight,
  type RateCard,
} from "@/lib/racks/pricing";
import {
  deleteAngleRackModel,
  deleteFrameSize,
  getAngleRackModel,
  listAngleRackModels,
  listFrameSizes,
  loadRateCard,
  priceable,
  putAngleRackModel,
  putFrameSize,
} from "@/lib/repo/racks";
import { repriceAllRacks, revalidateRackScreens } from "@/lib/racks/reprice";
import { err, money, optionalPositive, type FormState } from "@/lib/forms";
import type { AngleRackConfig, AngleRackModel, FrameSize } from "@/lib/types";

/**
 * Open-frame rack mutations — SPEC §20.
 *
 * SPEC §8: every action asserts the admin role itself. A server action is
 * addressable over HTTP independently of the page that renders its form.
 *
 * **There is no rates form here, and that is deliberate.** Bolt, bush, legs,
 * bolt pairs per shelf, bushes per rack, the heights on sale, markup and
 * rounding are all shared with the plated range and are edited on
 * `/admin/racks`. Two forms writing one DynamoDB item is two places to change
 * a bolt price and one of them to forget, which is exactly what the
 * three-layer split exists to prevent. This screen owns the two things that
 * are genuinely its own: the footprints, and which open-frame racks are on
 * sale.
 *
 * As on the plated screen, **editing a footprint reprices every rack built on
 * it immediately** (17 Sep 2026) — a depth or length change moves the running
 * feet of angle, which moves the cost. `saveFrame` therefore cascades across
 * all three ranges; adding a footprint does not, because no existing rack
 * references it, and retiring or deleting one makes racks unpriceable rather
 * than cheaper. See `src/lib/racks/reprice.ts`.
 *
 * **And there are no bulk actions.** The owner's call, 17 Sep 2026: *"do not
 * build too many UI elements to load the different combination or accept the
 * prices."* Filling out the range is a data job — `scripts/racks-fill.mjs`
 * writes every missing combination straight into DynamoDB at the current
 * markup — and with the cascade in place there is no cost left to accept.
 */

function refresh() {
  revalidatePath("/[locale]/admin/angle-racks", "page");
}

/** See `src/lib/racks/reprice.ts`. Editing a footprint's dimensions changes
 *  what every rack built on it costs, so the price follows immediately. */
async function cascade() {
  await repriceAllRacks();
  revalidateRackScreens();
}

/* ──────────────────────────── frame sizes ──────────────────────────── */

function readFrame(
  fd: FormData,
): { ok: true; value: Omit<FrameSize, "id"> } | { ok: false; state: FormState } {
  const depthFt = money(fd, "depthFt");
  if (depthFt === null) return { ok: false, state: err("dimensionInvalid", "depthFt") };
  const lengthFt = money(fd, "lengthFt");
  if (lengthFt === null) return { ok: false, state: err("dimensionInvalid", "lengthFt") };

  /* No price and no capacity to read — see `FrameSize`. A frame costs
     `3 × length + 2 × depth` feet of angle at the grade's rate, and it has no
     deck to carry a load rating. Grams per shelf is optional — see
     `ShelfPlate.gramsPerShelf`. */
  const gramsPerShelf = optionalPositive(fd, "gramsPerShelf");
  if (gramsPerShelf === "invalid") return { ok: false, state: err("gramsInvalid", "gramsPerShelf") };
  return {
    ok: true,
    value: {
      depthFt,
      lengthFt,
      active: fd.get("active") === "on",
      ...(gramsPerShelf !== undefined ? { gramsPerShelf } : {}),
    },
  };
}

/** Keyed by footprint — `f-1x4` — for the same reason a plate is `p-1x3`: an
 *  operator reading a rack row, a packing slip or a DynamoDB item can tell
 *  which frame it means. The `f-` prefix keeps the two size lists apart, so a
 *  frame id can never be mistaken for a plate id. */
export async function addFrame(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readFrame(fd);
  if (!read.ok) return read.state;
  const { depthFt, lengthFt } = read.value;
  await putFrameSize({ id: `f-${depthFt}x${lengthFt}`, ...read.value });
  refresh();
  return { status: "saved" };
}

export async function saveFrame(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "").trim();
  if (!id || !(await listFrameSizes()).some((f) => f.id === id)) return err("notFound");
  const read = readFrame(fd);
  if (!read.ok) return read.state;
  await putFrameSize({ id, ...read.value });
  await cascade();
  return { status: "saved" };
}

export async function toggleFrame(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const current = (await listFrameSizes()).find((f) => f.id === id);
  if (!current) throw new Error("Frame size not found");
  await putFrameSize({ ...current, active: !current.active });
  refresh();
}

export async function removeFrame(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteFrameSize(String(fd.get("id")));
  refresh();
}

/* ──────────────────── open-frame racks on sale ─────────────────────── */

/** The server-side half of rules the form already expresses — checked here
 *  because a server action is addressable over HTTP without its form. */
function validateConfig(
  config: AngleRackConfig,
  card: RateCard,
): { ok: true } | { ok: false; state: FormState } {
  if (!card.frames.some((f) => f.id === config.frameId))
    return { ok: false, state: err("frameUnknown", "frameId") };
  if (!card.angles.some((a) => a.id === config.angleId))
    return { ok: false, state: err("angleUnknown", "angleId") };
  if (!card.settings.heightsFt.includes(config.heightFt))
    return { ok: false, state: err("heightUnknown", "heightFt") };
  return { ok: true };
}

function readConfig(
  fd: FormData,
): { ok: true; value: AngleRackConfig } | { ok: false; state: FormState } {
  const heightFt = money(fd, "heightFt");
  if (heightFt === null) return { ok: false, state: err("dimensionInvalid", "heightFt") };

  return {
    ok: true,
    value: {
      heightFt,
      /* Derived, never posted — shelves are `height − 1` and the form has no
         field for them, so there is nothing here to trust. */
      shelves: shelvesForHeight(heightFt),
      frameId: String(fd.get("frameId") ?? "").trim(),
      angleId: String(fd.get("angleId") ?? "").trim(),
    },
  };
}

function sameConfig(a: AngleRackConfig, b: AngleRackConfig): boolean {
  return (
    a.heightFt === b.heightFt &&
    a.shelves === b.shelves &&
    a.frameId === b.frameId &&
    a.angleId === b.angleId
  );
}

/** Publishes an open-frame rack: cost from the current rate card, price from
 *  the markup, and `costAtPublish` as the staleness baseline. */
export async function addAngleRack(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const card = priceable(await loadRateCard());
  if (!card) return err("notFound");

  const read = readConfig(fd);
  if (!read.ok) return read.state;
  const valid = validateConfig(read.value, card);
  if (!valid.ok) return valid.state;

  const existing = await listAngleRackModels();
  if (existing.some((m) => sameConfig(m.config, read.value)))
    return err("duplicateRack", "frameId");

  const cost = angleRackCost(read.value, card);
  if (!cost) return err("notFound");

  await putAngleRackModel({
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

/** The owner's own price, overriding the markup. Re-baselines
 *  `costAtPublish` so a hand-set price clears the stale flag rather than
 *  leaving a warning that never clears. */
export async function saveAngleRack(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const current = await getAngleRackModel(String(fd.get("id") ?? "").trim());
  if (!current) return err("notFound");

  const price = money(fd, "price");
  if (price === null) return err("priceInvalid", "price");

  const card = priceable(await loadRateCard());
  const cost = card ? angleRackCost(current.config, card) : null;

  await putAngleRackModel({
    ...current,
    price,
    ...(cost ? { costAtPublish: cost.total, publishedAt: new Date().toISOString() } : {}),
  });
  refresh();
  return { status: "saved" };
}

export async function republishAngleRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getAngleRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  await republish([current]);
  refresh();
}

async function republish(models: AngleRackModel[]): Promise<void> {
  const card = priceable(await loadRateCard());
  if (!card) return;

  await Promise.all(
    models.map(async (m) => {
      const cost = angleRackCost(m.config, card);
      /* Unpriceable racks are skipped rather than zeroed: the footprint or
         grade has been retired, and the row stays flagged until the owner
         points it at one that exists. */
      if (!cost || cost.total === m.costAtPublish) return;
      await putAngleRackModel({
        ...m,
        price: retailPrice(cost.total, card.settings),
        costAtPublish: cost.total,
        publishedAt: new Date().toISOString(),
      });
    }),
  );
}

export async function toggleAngleRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getAngleRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  await putAngleRackModel({ ...current, active: !current.active });
  refresh();
}

export async function removeAngleRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteAngleRackModel(String(fd.get("id")));
  refresh();
}
