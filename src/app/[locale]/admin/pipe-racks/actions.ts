"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import {
  PIPE_MAX_HEIGHT_FT,
  pipeRackCost,
  retailPrice,
  shelvesForHeight,
  type RateCard,
} from "@/lib/racks/pricing";
import {
  deletePipeRackModel,
  deletePipeSize,
  getPipeRackModel,
  listPipeRackModels,
  listPipeSizes,
  loadRateCard,
  priceable,
  putPipeRackModel,
  putPipeSettings,
  putPipeSize,
} from "@/lib/repo/racks";
import { repriceAllRacks, revalidateRackScreens } from "@/lib/racks/reprice";
import { err, money, optionalPositive, type FormState } from "@/lib/forms";
import type { PipeRackConfig, PipeRackModel, PipeSize } from "@/lib/types";

/**
 * Pipe rack mutations — SPEC §21.
 *
 * SPEC §8: every action asserts the admin role itself. A server action is
 * addressable over HTTP independently of the page that renders its form.
 *
 * **This screen has a rates form and the angle screen does not**, which is the
 * one place the three rack screens are not the same shape. The reason is that
 * the angle range shares every material rate with the plated range — so a
 * second form there would be a second place to change a bolt price — whereas
 * nothing else in the catalogue buys UPVC pipe, four-way connectors or pipe
 * bushes. Those three rates have no other home, so this is it. What *is*
 * shared — the corner leg count, the heights on sale, markup and rounding —
 * is still edited only on `/admin/racks` and shown here read-only.
 *
 * As on the other two screens, **editing a rate or a footprint reprices every
 * rack that uses it immediately**, with no approval step (17 Sep 2026) — see
 * `src/lib/racks/reprice.ts`. Adding a footprint does not cascade, because no
 * existing rack references it. And there are no bulk actions — filling out the
 * range is `scripts/racks-fill.mjs`.
 */

function refresh() {
  revalidatePath("/[locale]/admin/pipe-racks", "page");
}

/** See `src/lib/racks/reprice.ts`. The pipe rates are this range's own, so in
 *  practice this moves pipe rack prices only — but it runs the whole cascade
 *  anyway rather than guessing which ranges an edit can reach. */
async function cascade() {
  await repriceAllRacks();
  revalidateRackScreens();
}

/* ─────────────────────────── the pipe rates ─────────────────────────── */

/** Three numbers, and all three must be real. No partial save: a rack priced
 *  from two of the three rates would be wrong rather than incomplete. */
export async function savePipeRates(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await assertRole("admin");

  const ratePerFt = money(fd, "ratePerFt");
  if (ratePerFt === null) return err("rateInvalid", "ratePerFt");
  const connectorPrice = money(fd, "connectorPrice");
  if (connectorPrice === null) return err("rateInvalid", "connectorPrice");
  const bushPrice = money(fd, "bushPrice");
  if (bushPrice === null) return err("rateInvalid", "bushPrice");

  await putPipeSettings({ ratePerFt, connectorPrice, bushPrice });
  await cascade();
  return { status: "saved" };
}

/* ───────────────────────────── footprints ──────────────────────────── */

function readSize(
  fd: FormData,
): { ok: true; value: Omit<PipeSize, "id"> } | { ok: false; state: FormState } {
  const depthFt = money(fd, "depthFt");
  if (depthFt === null) return { ok: false, state: err("dimensionInvalid", "depthFt") };
  const lengthFt = money(fd, "lengthFt");
  if (lengthFt === null) return { ok: false, state: err("dimensionInvalid", "lengthFt") };

  /* No price and no capacity to read — see `PipeSize`. And no leg count: it is
     derived from the length, because whether a shelf needs a middle support is
     a fact about its span and not a choice. Grams per shelf is optional — see
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

/** Keyed by footprint — `pp-1.5x3` — so an operator reading a rack row or a
 *  DynamoDB item can tell which size it means. The `pp-` prefix rather than
 *  `p-`, which is already the shelf plate's: one character of difference
 *  between two id spaces is not enough. */
export async function addPipeSize(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readSize(fd);
  if (!read.ok) return read.state;
  const { depthFt, lengthFt } = read.value;
  await putPipeSize({ id: `pp-${depthFt}x${lengthFt}`, ...read.value });
  refresh();
  return { status: "saved" };
}

export async function savePipeSize(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "").trim();
  if (!id || !(await listPipeSizes()).some((p) => p.id === id)) return err("notFound");
  const read = readSize(fd);
  if (!read.ok) return read.state;
  await putPipeSize({ id, ...read.value });
  await cascade();
  return { status: "saved" };
}

export async function togglePipeSize(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const current = (await listPipeSizes()).find((p) => p.id === id);
  if (!current) throw new Error("Pipe size not found");
  await putPipeSize({ ...current, active: !current.active });
  refresh();
}

export async function removePipeSize(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deletePipeSize(String(fd.get("id")));
  refresh();
}

/* ─────────────────────── pipe racks on sale ─────────────────────────── */

/** The server-side half of rules the form already expresses — checked here
 *  because a server action is addressable over HTTP without its form. */
function validateConfig(
  config: PipeRackConfig,
  card: RateCard,
): { ok: true } | { ok: false; state: FormState } {
  if (!card.pipes.some((p) => p.id === config.pipeSizeId))
    return { ok: false, state: err("sizeUnknown", "pipeSizeId") };
  if (!card.settings.heightsFt.includes(config.heightFt))
    return { ok: false, state: err("heightUnknown", "heightFt") };
  /* The height cap is this range's own, and it is checked here rather than
     left to the select: the heights list is shared with two steel ranges that
     have no such limit, so a height can be legitimate there and too tall
     here. See `PIPE_MAX_HEIGHT_FT`. */
  if (config.heightFt > PIPE_MAX_HEIGHT_FT)
    return {
      ok: false,
      state: err("heightTooTall", "heightFt", { max: String(PIPE_MAX_HEIGHT_FT) }),
    };
  return { ok: true };
}

function readConfig(
  fd: FormData,
): { ok: true; value: PipeRackConfig } | { ok: false; state: FormState } {
  const heightFt = money(fd, "heightFt");
  if (heightFt === null) return { ok: false, state: err("dimensionInvalid", "heightFt") };

  return {
    ok: true,
    value: {
      heightFt,
      /* Derived, never posted — shelves are `height − 1` and the form has no
         field for them, so there is nothing here to trust. */
      shelves: shelvesForHeight(heightFt),
      pipeSizeId: String(fd.get("pipeSizeId") ?? "").trim(),
    },
  };
}

function sameConfig(a: PipeRackConfig, b: PipeRackConfig): boolean {
  return (
    a.heightFt === b.heightFt &&
    a.shelves === b.shelves &&
    a.pipeSizeId === b.pipeSizeId
  );
}

/** Publishes a pipe rack: cost from the current rates, price from the markup,
 *  and `costAtPublish` as the staleness baseline. */
export async function addPipeRack(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const card = priceable(await loadRateCard());
  if (!card) return err("notFound");

  const read = readConfig(fd);
  if (!read.ok) return read.state;
  const valid = validateConfig(read.value, card);
  if (!valid.ok) return valid.state;

  const existing = await listPipeRackModels();
  if (existing.some((m) => sameConfig(m.config, read.value)))
    return err("duplicateRack", "pipeSizeId");

  /* Null here means the pipe rates are still absent, which the form already
     blocks — but the action is reachable without the form. */
  const cost = pipeRackCost(read.value, card);
  if (!cost) return err("notFound");

  await putPipeRackModel({
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
export async function savePipeRack(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const current = await getPipeRackModel(String(fd.get("id") ?? "").trim());
  if (!current) return err("notFound");

  const price = money(fd, "price");
  if (price === null) return err("priceInvalid", "price");

  const card = priceable(await loadRateCard());
  const cost = card ? pipeRackCost(current.config, card) : null;

  await putPipeRackModel({
    ...current,
    price,
    ...(cost ? { costAtPublish: cost.total, publishedAt: new Date().toISOString() } : {}),
  });
  refresh();
  return { status: "saved" };
}

export async function republishPipeRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getPipeRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  await republish([current]);
  refresh();
}

async function republish(models: PipeRackModel[]): Promise<void> {
  const card = priceable(await loadRateCard());
  if (!card) return;

  await Promise.all(
    models.map(async (m) => {
      const cost = pipeRackCost(m.config, card);
      /* Unpriceable racks are skipped rather than zeroed: the footprint has
         been retired or the rates are gone, and the row stays flagged until
         the owner fixes whichever it is. */
      if (!cost || cost.total === m.costAtPublish) return;
      await putPipeRackModel({
        ...m,
        price: retailPrice(cost.total, card.settings),
        costAtPublish: cost.total,
        publishedAt: new Date().toISOString(),
      });
    }),
  );
}

export async function togglePipeRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  const current = await getPipeRackModel(String(fd.get("id")));
  if (!current) throw new Error("Rack not found");
  await putPipeRackModel({ ...current, active: !current.active });
  refresh();
}

export async function removePipeRack(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deletePipeRackModel(String(fd.get("id")));
  refresh();
}
