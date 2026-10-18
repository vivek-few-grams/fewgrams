"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { err, type FormState } from "@/lib/forms";
import { listSeeds, returnToShelf, takeFromShelf } from "@/lib/repo/seeds";
import { deleteSowing, getSowing, putSowing } from "@/lib/repo/sowings";
import { listVarieties } from "@/lib/repo/varieties";
import { readSowing, seedChange } from "@/lib/sowing/sowing";
import type { SowingLine } from "@/lib/types";

/**
 * Sowing log mutations — `/admin/sowing` (10 Oct 2026). Each asserts the
 * admin role itself (SPEC §8): a server action is addressable without the
 * page that renders its form.
 *
 * **A sowing takes its seed off the shelf** (the owner, 18 Oct 2026,
 * reversing the 10 Oct split): the seed sown is the same stock the shop sells,
 * so saving a sowing takes its grams from the seed of the same key, an edit
 * takes or returns the difference, and a delete puts them back. Not an
 * order — using our own seed to grow is not a sale, so it has no invoice and
 * no place in the GST return. Each sowing keeps what it actually took
 * (`seedsTaken`), so a short shelf never gets more back than it gave. A
 * sowing logged before then took nothing and never will.
 */

function refresh() {
  revalidatePath("/[locale]/admin/sowing", "page");
  /* The shelf moved: the seeds screen and every page that sells seed. */
  revalidatePath("/[locale]", "layout");
}

/**
 * Move the seed shelf from what a sowing has `taken` to what its `lines` call
 * for (`seedChange`). Returns what it has taken now, and the keys the shelf
 * had too little of — the count is wrong there and wants a stocktake. A
 * variety with no seed row (wheatgrass) takes nothing.
 */
async function drawSeeds(
  taken: Record<string, number>,
  lines: SowingLine[],
): Promise<{ taken: Record<string, number>; short: string[] }> {
  const change = seedChange(taken, lines);
  const next = { ...taken };
  const short: string[] = [];
  if (change.size === 0) return { taken: next, short };
  const shelf = new Set((await listSeeds()).map((s) => s.contentKey));
  for (const [key, grams] of change) {
    if (grams > 0) {
      if (!shelf.has(key)) continue;
      const got = await takeFromShelf(key, grams);
      next[key] = (next[key] ?? 0) + got;
      if (got < grams) short.push(key);
    } else {
      await returnToShelf(key, -grams);
      next[key] = (next[key] ?? 0) + grams;
    }
    if (Math.abs(next[key] ?? 0) < 1e-9) delete next[key];
  }
  return { taken: next, short };
}

/** Saved — with a notice naming any seed the shelf ran short of. */
function savedWith(short: string[]): FormState {
  return short.length
    ? { status: "saved", notice: { code: "seedShort", values: { keys: short.join(",") } } }
    : { status: "saved" };
}

/** Keys a line may name: every variety on file, active or not — a variety
 *  can be trialled before it is sold. */
async function varietyKeys(extra: string[] = []): Promise<Set<string>> {
  const rows = await listVarieties();
  return new Set([...rows.map((v) => v.contentKey), ...extra]);
}

export async function addSowing(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readSowing(fd, { varietyKeys: await varietyKeys(), today: istDateISO(new Date()) });
  if (!read.ok) return read.state;

  const now = new Date().toISOString();
  const drawn = await drawSeeds({}, read.lines);
  await putSowing({
    id: crypto.randomUUID(),
    sowDate: read.sowDate,
    lines: read.lines,
    seedsTaken: drawn.taken,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return savedWith(drawn.short);
}

/** Save a whole sowing — its date, its lines and their harvests. */
export async function updateSowing(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const current = await getSowing(String(fd.get("id") ?? ""));
  if (!current) return err("notFound");

  /* A line whose variety row has since been deleted stays editable. */
  const keys = await varietyKeys(current.lines.map((l) => l.varietyKey));
  const read = readSowing(fd, { varietyKeys: keys, today: istDateISO(new Date()) });
  if (!read.ok) return read.state;

  /* A sowing from before 18 Oct 2026 took nothing, so it moves nothing. */
  const drawn = current.seedsTaken ? await drawSeeds(current.seedsTaken, read.lines) : null;
  await putSowing({
    ...current,
    sowDate: read.sowDate,
    lines: read.lines,
    ...(drawn ? { seedsTaken: drawn.taken } : {}),
    updatedAt: new Date().toISOString(),
  });
  refresh();
  return savedWith(drawn?.short ?? []);
}

export async function removeSowing(fd: FormData): Promise<void> {
  await assertRole("admin");
  const sowing = await getSowing(String(fd.get("id")));
  if (!sowing) return;
  await deleteSowing(sowing.id);
  if (sowing.seedsTaken) await drawSeeds(sowing.seedsTaken, []);
  refresh();
}
