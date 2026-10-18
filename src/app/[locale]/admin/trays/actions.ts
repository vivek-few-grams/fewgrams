"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { isOnABill } from "@/lib/repo/purchases";
import { forgetSupply } from "@/lib/repo/vendors";
import { deleteTray, getTray, patchTray, setTrayStock } from "@/lib/repo/trays";
import { marginOf, retailPrice } from "@/lib/pricing/margin";
import { count, err, optionalPositive, zeroOrMore, type FormState } from "@/lib/forms";
import { isValidStockPacks } from "@/lib/trays/lead-time";
import type { Tray } from "@/lib/types";

/**
 * Tray and drainage mutations — SPEC §23.4.
 *
 * SPEC §8: every one of these asserts the admin role itself. A server action
 * is addressable over HTTP independently of the page that renders its form.
 *
 * **Nothing here accepts text.** An item's name, its one line and its spec
 * table come from `content/trays/<contentKey>.json` (SPEC §4.3). Same rule as
 * varieties and seeds, for the same reason: copy wants git history and a
 * diff, a price does not.
 *
 * ## No cost and no adding here (18 Oct 2026)
 *
 * A tray is added from a purchase bill ("+ New product", `addStockItem`) and
 * costed by the latest bill it is on (`costFromBills`) — the owner: every
 * purchase is entered with what was paid, so the product screen should not
 * ask again. What is left here is the row's own margin, its packing, the
 * switch, the delete, and a stocktake.
 *
 * Every write is a `patch` of the fields it owns, so none of them can put
 * back a stock count a paid order has just taken from.
 */

/** Public pages that change when this catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/trays", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/shop/trays", "page");
  /* The /shop index prints a live count per category. */
  revalidatePath("/[locale]/shop", "page");
}

/** The row's own markup and rounding (the owner, 4 Oct 2026). Blank prices
 *  at cost to the rupee (`NO_MARGIN`). */
function readMargin(
  fd: FormData,
): { ok: true; value: Pick<Tray, "markupPercent" | "roundUpToNearest"> } | { ok: false; state: FormState } {
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
] as const satisfies readonly (keyof Tray)[];

type Packing = Pick<Tray, (typeof PACKING)[number]>;

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
export async function updateTray(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const current = id ? await getTray(id) : null;
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
  await patchTray(current.id, { ...filled, price }, blank);
  refresh();
  return { status: "saved" };
}

/** A stocktake — the packs counted. Zero is a real count; an empty field is
 *  not. */
export async function correctTrayStock(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const tray = await getTray(String(fd.get("id") ?? ""));
  if (!tray) return err("notFound");
  const packs = zeroOrMore(fd, "count");
  if (packs === null || !isValidStockPacks(packs)) return err("packsInvalid", "count");
  await setTrayStock(tray.id, packs);
  refresh();
  return { status: "saved" };
}

/** Hide an item without losing its price — the only way something leaves
 *  this shelf. **Not switched on before a bill has costed it**: a row added
 *  from a bill is priced at 0 until that bill is saved. */
export async function toggleTrayActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getTray(String(fd.get("id")));
  if (!existing) throw new Error("Tray not found");
  if (!existing.active && existing.cost === undefined) return;
  await patchTray(existing.id, { active: !existing.active });
  refresh();
}

export async function removeTray(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const row = await getTray(id);
  /* Its screen offers no Delete while a bill names it; this is for a
     request made without the screen. */
  if (row && (await isOnABill(`tray:${row.contentKey}`))) throw new Error("This tray is on a purchase bill");
  await deleteTray(id);
  if (row) await forgetSupply(`tray:${row.contentKey}`);
  refresh();
}
