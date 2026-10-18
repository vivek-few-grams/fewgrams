"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { isOnABill } from "@/lib/repo/purchases";
import { forgetSupply } from "@/lib/repo/vendors";
import { deleteGrowMedium, getGrowMedium, patchGrowMedium, setGrowMediumStock } from "@/lib/repo/grow-media";
import { marginOf, retailPrice } from "@/lib/pricing/margin";
import { count, err, optionalPositive, zeroOrMore, type FormState } from "@/lib/forms";
import { isValidStockPacks } from "@/lib/grow-media/lead-time";
import type { GrowMedium } from "@/lib/types";

/**
 * Grow media mutations — SPEC §24.4. The tray actions (`../trays/actions.ts`)
 * with the grow-media repository and stock bounds swapped in; the reasoning
 * for every rule is written out there — including why a block is added and
 * costed from a purchase bill, not here (18 Oct 2026).
 *
 * Every action asserts the admin role itself (SPEC §8), and **nothing here
 * accepts text**.
 */

/** Public pages that change when this catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/grow-media", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/shop/grow-media", "page");
  /* The /shop index prints a live count per category. */
  revalidatePath("/[locale]/shop", "page");
}

/** The row's own markup and rounding (the owner, 4 Oct 2026). Blank prices
 *  at cost to the rupee (`NO_MARGIN`). */
function readMargin(
  fd: FormData,
):
  | { ok: true; value: Pick<GrowMedium, "markupPercent" | "roundUpToNearest"> }
  | { ok: false; state: FormState } {
  const markupRaw = String(fd.get("markupPercent") ?? "").trim();
  const markupPercent = markupRaw === "" ? undefined : zeroOrMore(fd, "markupPercent");
  if (markupPercent === null) return { ok: false, state: err("zeroOrMore", "markupPercent") };
  const roundRaw = String(fd.get("roundUpToNearest") ?? "").trim();
  const roundUpToNearest = roundRaw === "" ? undefined : count(fd, "roundUpToNearest");
  if (roundUpToNearest === null) return { ok: false, state: err("countInvalid", "roundUpToNearest") };
  return { ok: true, value: { markupPercent, roundUpToNearest } };
}

const PACKING = [
  "packPieces",
  "pieceLengthCm",
  "pieceWidthCm",
  "pieceHeightCm",
  "pieceStackCm",
  "pieceGrams",
] as const satisfies readonly (keyof GrowMedium)[];

type Packing = Pick<GrowMedium, (typeof PACKING)[number]>;

/**
 * The courier packing figures (SPEC §7) — **all six or none**. Blank
 * everywhere is "not measured yet": the row saves and is flagged. Some but
 * not all is refused, because a box with a length and no height is not a
 * size, and quoting it would under-charge.
 */
function readPacking(fd: FormData): { ok: true; value: Partial<Packing> } | { ok: false; state: FormState } {
  const read = PACKING.map((k) => [k, optionalPositive(fd, k)] as const);
  const bad = read.find(([, v]) => v === "invalid");
  if (bad) return { ok: false, state: err("packingInvalid", bad[0]) };
  const given = read.filter(([, v]) => v !== undefined);
  if (given.length === 0) return { ok: true, value: {} };
  const missing = read.find(([, v]) => v === undefined);
  if (missing) return { ok: false, state: err("packingIncomplete", missing[0]) };
  const value = Object.fromEntries(read) as Packing;
  if (!Number.isInteger(value.packPieces))
    return { ok: false, state: err("packPiecesInvalid", "packPieces") };
  return { ok: true, value };
}

/** Save the margin and the packing, and reprice from the cost the bills set.
 *  The key and id never change here — re-keying means renaming the content
 *  file and is a rename, not an edit. */
export async function updateGrowMedium(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const current = id ? await getGrowMedium(id) : null;
  if (!current) return err("notFound");

  const margin = readMargin(fd);
  if (!margin.ok) return margin.state;
  const packing = readPacking(fd);
  if (!packing.ok) return packing.state;

  /* Packing and margin replace rather than merge: a blank field clears its
     figure, which is how an owner says "re-measure this" — so a field left
     blank is removed, not kept. */
  const set = { ...margin.value, ...packing.value };
  const blank = ([...PACKING, "markupPercent", "roundUpToNearest"] as const).filter(
    (k) => set[k] === undefined,
  );
  const filled = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
  /* No cost yet — added from a bill not saved — keeps its price of 0. */
  const price =
    current.cost === undefined ? current.price : retailPrice(current.cost, marginOf(margin.value));
  await patchGrowMedium(current.id, { ...filled, price }, blank);
  refresh();
  return { status: "saved" };
}

/** A stocktake — the blocks counted. Zero is a real count; an empty field is
 *  not. */
export async function correctGrowMediumStock(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const medium = await getGrowMedium(String(fd.get("id") ?? ""));
  if (!medium) return err("notFound");
  const packs = zeroOrMore(fd, "count");
  if (packs === null || !isValidStockPacks(packs)) return err("packsInvalid", "count");
  await setGrowMediumStock(medium.id, packs);
  refresh();
  return { status: "saved" };
}

/** Hide an item without losing its price — the only way something leaves
 *  this shelf. **Not switched on before a bill has costed it**: a row added
 *  from a bill is priced at 0 until that bill is saved. */
export async function toggleGrowMediumActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getGrowMedium(String(fd.get("id")));
  if (!existing) throw new Error("Grow medium not found");
  if (!existing.active && existing.cost === undefined) return;
  await patchGrowMedium(existing.id, { active: !existing.active });
  refresh();
}

export async function removeGrowMedium(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const row = await getGrowMedium(id);
  /* Its screen offers no Delete while a bill names it; this is for a
     request made without the screen. */
  if (row && (await isOnABill(`media:${row.contentKey}`)))
    throw new Error("This grow medium is on a purchase bill");
  await deleteGrowMedium(id);
  if (row) await forgetSupply(`media:${row.contentKey}`);
  refresh();
}
