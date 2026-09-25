"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import {
  deleteGrowMedium,
  getGrowMedium,
  listGrowMedia,
  putGrowMedium,
} from "@/lib/repo/grow-media";
import { isValidContentKey } from "@/lib/content/content-key";
import { err, money, optionalPositive, zeroOrMore, type FormState } from "@/lib/forms";
import { isValidStockPacks } from "@/lib/grow-media/lead-time";
import type { GrowMedium } from "@/lib/types";

/**
 * Grow media mutations — SPEC §24.4. The tray actions (`../trays/actions.ts`)
 * with the grow-media repository and lead-time bounds swapped in; the
 * reasoning for every rule is written out there.
 *
 * Every action asserts the admin role itself (SPEC §8), and **nothing here
 * accepts text** — the only identifier taken is a content key.
 */

/** Public pages that change when this catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/grow-media", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/shop/grow-media", "page");
  /* The /shop index prints a live count per category. */
  revalidatePath("/[locale]/shop", "page");
}

/** The price and the blocks held — the only two things this screen sets,
 *  plus active. */
type Ops = Pick<GrowMedium, "price" | "stockPacks" | "active">;

function readOps(fd: FormData): { ok: true; value: Ops } | { ok: false; state: FormState } {
  const price = money(fd, "price");
  if (price === null) return { ok: false, state: err("priceInvalid", "price") };

  /* The tray rule — see `trays/actions.ts`. */
  const stockPacks = zeroOrMore(fd, "stockPacks");
  if (stockPacks === null || !isValidStockPacks(stockPacks)) {
    return { ok: false, state: err("stockInvalid", "stockPacks") };
  }

  return { ok: true, value: { price, stockPacks, active: fd.get("active") === "on" } };
}

/**
 * Create an item from a content key. The content file is not a precondition,
 * exactly as for a tray: the admin row is flagged in red until it exists, and
 * the public page skips an item it cannot name. The id is a generated UUID,
 * never derived from the key.
 */
export async function addGrowMedium(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const contentKey = String(fd.get("contentKey") ?? "")
    .trim()
    .toLowerCase();
  if (!contentKey) return err("keyRequired", "contentKey");

  /* Validated rather than sanitised: the key is a filename, so quietly
     rewriting it would break the link between this row and the file the
     operator is about to create. */
  if (!isValidContentKey(contentKey))
    return err("keyInvalid", "contentKey", { key: contentKey });

  /* One row per key — the key is the GSI1 sort key, so two rows sharing one
     would make the pair indistinguishable in every list. Checked against
     *grow media* only: this folder is its own namespace (SPEC §24.2). */
  const existing = await listGrowMedia();
  if (existing.some((t) => t.contentKey === contentKey))
    return err("keyTaken", "contentKey", { key: contentKey });

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  await putGrowMedium({ id: crypto.randomUUID(), contentKey, ...ops.value });
  refresh();
  return { status: "saved" };
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
  if (!Number.isInteger(value.packPieces)) return { ok: false, state: err("packPiecesInvalid", "packPieces") };
  return { ok: true, value };
}

/** Update the price, the lead time and the packing on an existing item. The
 *  key and id never change here — re-keying means renaming the content file
 *  and is a rename, not an edit. */
export async function updateGrowMedium(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const current = id ? await getGrowMedium(id) : null;
  if (!current) return err("notFound");

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;
  const packing = readPacking(fd);
  if (!packing.ok) return packing.state;

  /* Packing replaces rather than merges: clearing all six fields is how an
     owner says "re-measure this", and a merge would keep the old figures. */
  const rest = Object.fromEntries(
    Object.entries(current).filter(([k]) => !(PACKING as readonly string[]).includes(k)),
  ) as GrowMedium;
  await putGrowMedium({ ...rest, ...ops.value, ...packing.value });
  refresh();
  return { status: "saved" };
}

/** Hide an item without losing its price or its lead time — the only way
 *  something leaves this shelf, since nothing here is ever out of stock. */
export async function toggleGrowMediumActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getGrowMedium(String(fd.get("id")));
  if (!existing) throw new Error("Grow medium not found");
  await putGrowMedium({ ...existing, active: !existing.active });
  refresh();
}

export async function removeGrowMedium(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteGrowMedium(String(fd.get("id")));
  refresh();
}
