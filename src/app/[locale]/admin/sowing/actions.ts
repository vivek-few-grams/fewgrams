"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { err, type FormState } from "@/lib/forms";
import { applyStockChange, undoStockChange } from "@/lib/purchases/stock";
import { listSeeds } from "@/lib/repo/seeds";
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
 * takes or returns the change in grams sown, and a delete puts them back. Not
 * an order — using our own seed to grow is not a sale, so it has no invoice
 * and no place in the GST return. Each sowing keeps what it actually took
 * (`seedsTaken`), so a short shelf never gets more back than it gave. A
 * sowing logged before then took nothing and never will.
 *
 * **Each write is conditional on the sowing as read** (`putSowing`,
 * `deleteSowing`), so two saves from one read cannot both move the shelf: the
 * second is refused and puts back what it moved. The shelf moves first for a
 * save, because the row records what it actually took; a delete is written
 * first, so a second press is refused before anything goes back. Either way a
 * failure leaves the row as it was and the shelf as it was
 * (`applyStockChange` is all or nothing), and saving again starts from there.
 * The gap left open is a process killed between the two writes — logged
 * nowhere, so a stocktake finds it.
 */

function refresh() {
  revalidatePath("/[locale]/admin/sowing", "page");
  /* The shelf moved: the seeds screen and every page that sells seed. */
  revalidatePath("/[locale]", "layout");
}

type Drawn = {
  /** What the sowing has taken now. */
  taken: Record<string, number>;
  /** Keys the shelf had too little of — the count is wrong there and wants
   *  a stocktake. */
  short: string[];
  /** What moved, to undo if the row's own write is refused. */
  moved: Map<string, number>;
};

/**
 * Move the seed shelf as a sowing's lines go from `before` to `after`
 * (`seedChange`), from what it had `taken`. A variety with no seed row
 * (wheatgrass) takes nothing. All or nothing: on a throw the shelf is as it
 * was.
 */
async function drawSeeds(
  taken: Record<string, number>,
  before: SowingLine[],
  after: SowingLine[],
): Promise<Drawn> {
  const change = seedChange(taken, before, after);
  const next = { ...taken };
  if (change.size === 0) return { taken: next, short: [], moved: new Map() };
  const shelf = new Set((await listSeeds()).map((s) => s.contentKey));
  /* The shelf's sign is the other way round: taking seed is a negative move. */
  const stock = new Map<string, number>();
  for (const [key, grams] of change) if (grams < 0 || shelf.has(key)) stock.set(`seed:${key}`, -grams);
  const { moved, short } = await applyStockChange(stock);
  for (const [id, grams] of moved) {
    const key = id.slice("seed:".length);
    next[key] = (next[key] ?? 0) - grams;
    if (Math.abs(next[key]) < 1e-9) delete next[key];
  }
  return { taken: next, short: short.map((s) => s.key), moved };
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
  const drawn = await drawSeeds({}, [], read.lines);
  const sowing = {
    id: crypto.randomUUID(),
    sowDate: read.sowDate,
    lines: read.lines,
    seedsTaken: drawn.taken,
    createdAt: now,
    updatedAt: now,
  };
  await written(putSowing(sowing, null), drawn, `[sowing] new sowing ${sowing.id} was refused`);
  refresh();
  return savedWith(drawn.short);
}

/**
 * Await a sowing's write, and put the shelf back as it was if the write is
 * refused or throws. A refusal returns false; a throw is passed on, as is a
 * refused write the caller cannot explain (`refusal`, for a new id).
 */
async function written(write: Promise<boolean>, drawn: Drawn | null, refusal?: string): Promise<boolean> {
  let ok: boolean;
  try {
    ok = await write;
  } catch (e) {
    if (drawn) await undoStockChange(drawn.moved);
    throw e;
  }
  if (!ok && drawn) await undoStockChange(drawn.moved);
  if (!ok && refusal) throw new Error(refusal);
  return ok;
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
  const drawn = current.seedsTaken ? await drawSeeds(current.seedsTaken, current.lines, read.lines) : null;
  const saved = await written(
    putSowing(
      {
        ...current,
        sowDate: read.sowDate,
        lines: read.lines,
        ...(drawn ? { seedsTaken: drawn.taken } : {}),
        updatedAt: new Date().toISOString(),
      },
      current.updatedAt,
    ),
    drawn,
  );
  if (!saved) return err("conflict");
  refresh();
  return savedWith(drawn?.short ?? []);
}

export async function removeSowing(fd: FormData): Promise<void> {
  await assertRole("admin");
  const sowing = await getSowing(String(fd.get("id")));
  if (!sowing) return;
  /* Refused when it changed or went since it was read — a second press, or
     a save at the same moment. The refreshed page shows where it stands. */
  if (!(await deleteSowing(sowing.id, sowing.updatedAt))) {
    refresh();
    return;
  }
  if (sowing.seedsTaken) {
    try {
      await drawSeeds(sowing.seedsTaken, sowing.lines, []);
    } catch (e) {
      /* The shelf is as it was, so the sowing goes back as it was too. */
      await putSowing(sowing, null);
      throw e;
    }
  }
  refresh();
}
