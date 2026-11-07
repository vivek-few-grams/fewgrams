"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import {
  angleRackCost,
  angleRackSku,
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
import { err, money, switchTo, type FormState } from "@/lib/forms";
import { packLosingRack } from "../pack-usage";
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
 * **A footprint cannot be edited** (31 Oct 2026). Its depth and length are in
 * the SKU of every rack built on it (`angleRackSku`), and a starter pack and
 * every cart line name a rack by that SKU — so an edit quietly re-identified
 * every rack on it, and could give two models one SKU. A footprint is only
 * its size and its switch, so there is nothing left to save: a different
 * size is a new row, and adding one already listed is refused. Until then
 * `saveFrame` repriced every rack built on the edited size (17 Sep 2026);
 * adding a footprint never did, because no existing rack references it, and
 * retiring or deleting one makes racks unpriceable rather than cheaper. See
 * `src/lib/racks/reprice.ts`.
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
     deck to carry a load rating. No weight either: it is the frame's feet
     × the angle's grams per foot (`angleRackGrams`). */
  return {
    ok: true,
    value: {
      depthFt,
      lengthFt,
      active: fd.get("active") === "on",
    },
  };
}

/** Keyed by footprint — `f-1x4` — for the same reason a plate is `p-1x3`: an
 *  operator reading a rack row, a packing slip or a DynamoDB item can tell
 *  which frame it means. The `f-` prefix keeps the two size lists apart, so a
 *  frame id can never be mistaken for a plate id.
 *
 *  A footprint already listed — by id, or by size on a row saved before
 *  sizes were fixed — is refused: the put would replace it, switching it back
 *  on whatever its row said. */
export async function addFrame(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readFrame(fd);
  if (!read.ok) return read.state;
  const { depthFt, lengthFt } = read.value;
  const id = `f-${depthFt}x${lengthFt}`;
  if ((await listFrameSizes()).some((f) => f.id === id || (f.depthFt === depthFt && f.lengthFt === lengthFt)))
    return err("frameExists", "depthFt", { depth: String(depthFt), length: String(lengthFt) });
  await putFrameSize({ id, ...read.value });
  refresh();
  return { status: "saved" };
}

/** On or off, to the state the button asks for (`switchTo`). */
export async function toggleFrame(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const current = (await listFrameSizes()).find((f) => f.id === id);
  if (!current) throw new Error("Frame size not found");
  const active = switchTo(fd);
  if (active === null) throw new Error("No target state posted");
  if (active === current.active) return;
  await putFrameSize({ ...current, active });
  refresh();
}

/** Delete a footprint — refused while a starter pack's rack is built on it
 *  (SPEC §29): the rack's SKU would no longer exist, and the pack would leave
 *  the site with nothing to say why. */
export async function removeFrame(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  const pack = await packLosingRack((m) => m.config.frameId === id);
  if (pack) return err("frameInPack", undefined, { pack });
  await deleteFrameSize(id);
  refresh();
  return { status: "saved" };
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

function readConfig(fd: FormData): { ok: true; value: AngleRackConfig } | { ok: false; state: FormState } {
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

function skuOf(config: AngleRackConfig, card: RateCard): string | null {
  const frame = card.frames.find((f) => f.id === config.frameId);
  const angle = card.angles.find((a) => a.id === config.angleId);
  return frame && angle ? angleRackSku(config, frame, angle) : null;
}

function sameConfig(a: AngleRackConfig, b: AngleRackConfig): boolean {
  return (
    a.heightFt === b.heightFt && a.shelves === b.shelves && a.frameId === b.frameId && a.angleId === b.angleId
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
  if (existing.some((m) => sameConfig(m.config, read.value))) return err("duplicateRack", "frameId");
  /* One SKU, one model: a starter pack and a cart line name a rack by its
     SKU, and the catalogue takes the first model that answers to it. */
  const sku = skuOf(read.value, card);
  if (sku && existing.some((m) => skuOf(m.config, card) === sku))
    return err("duplicateSku", "frameId", { sku });

  const cost = angleRackCost(read.value, card);
  if (!cost) return err("notFound");

  await putAngleRackModel({
    id: crypto.randomUUID(),
    config: read.value,
    price: retailPrice(cost.total, card.margins.angle),
    costAtPublish: cost.total,
    publishedAt: new Date().toISOString(),
    active: fd.get("active") === "on",
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
        price: retailPrice(cost.total, card.margins.angle),
        costAtPublish: cost.total,
        publishedAt: new Date().toISOString(),
      });
    }),
  );
}

/** On or off sale, to the state the button asks for (`switchTo`). */
export async function toggleAngleRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getAngleRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  const active = switchTo(fd);
  if (active === null) throw new Error("No target state posted");
  if (active === current.active) return;
  await putAngleRackModel({ ...current, active });
  refresh();
}

/** Delete a rack — refused while it is a starter pack's rack (SPEC §29),
 *  unless another model still answers to its SKU. */
export async function removeAngleRack(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  const pack = await packLosingRack((m) => m.id === id);
  if (pack) return err("rackInPack", undefined, { pack });
  await deleteAngleRackModel(id);
  refresh();
  return { status: "saved" };
}
