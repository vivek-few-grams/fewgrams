"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deleteTray, getTray, listTrays, putTray } from "@/lib/repo/trays";
import { isValidContentKey } from "@/lib/content/content-key";
import { err, money, optionalPositive, zeroOrMore, type FormState } from "@/lib/forms";
import { isValidLeadDays } from "@/lib/trays/lead-time";
import type { Tray } from "@/lib/types";

/**
 * Tray and drainage mutations — SPEC §23.4.
 *
 * SPEC §8: every one of these asserts the admin role itself. A server action
 * is addressable over HTTP independently of the page that renders its form.
 *
 * **Nothing here accepts text.** An item's name, its one line and its spec
 * table come from `content/trays/<contentKey>.json` (SPEC §4.3), so the only
 * identifier these actions take is a content key. Same rule as varieties and
 * seeds, for the same reason: copy wants git history and a diff, a price does
 * not.
 *
 * ## No stock, and therefore no concurrency problem
 *
 * The thing that makes `putSeed` unsafe for checkout — two orders racing the
 * same counted figure — does not exist here. Nothing in this category is held
 * (SPEC §23.1), so a whole-row `put` is correct for every path, now and after
 * checkout is built. What *will* arrive with checkout is the operational half:
 * a paid line means somebody has to place the order with the supplier.
 */

/** Public pages that change when this catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/trays", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/shop/trays", "page");
  /* The /shop index prints a live count per category. */
  revalidatePath("/[locale]/shop", "page");
}

/** The price and the lead time — the only two things this screen sets, plus
 *  active. */
type Ops = Pick<Tray, "price" | "leadDays" | "active">;

function readOps(fd: FormData): { ok: true; value: Ops } | { ok: false; state: FormState } {
  const price = money(fd, "price");
  if (price === null) return { ok: false, state: err("priceInvalid", "price") };

  /* `zeroOrMore` and then a range check, rather than `count`: the message has
     to name the bounds, and it is the *bounds* that are the business rule here
     (SPEC §23.1). `count` would reject 3 with the same wording it rejects 0,
     when the useful thing to say is that seven days is the floor.

     Refused rather than clamped. `daysFromToday` clamps as a last defence
     against a bad constant printing a nonsense date; doing it silently here
     would mean an operator typing 30 saw 30 on their screen and a customer
     saw a date 14 days out. */
  const leadDays = zeroOrMore(fd, "leadDays");
  if (leadDays === null || !isValidLeadDays(leadDays)) {
    return { ok: false, state: err("leadDaysInvalid", "leadDays") };
  }

  return { ok: true, value: { price, leadDays, active: fd.get("active") === "on" } };
}

/**
 * Create an item from a content key.
 *
 * **The content file is deliberately not a precondition**, exactly as for a
 * seed: requiring it first would mean you could not price a supplier's tray
 * without opening a code editor. What stops a nameless item reaching a
 * customer is downstream — the admin row is flagged in red with the exact
 * path, and the public page skips an item it cannot name.
 *
 * The id is a generated UUID and is never derived from the key, so re-keying
 * content later cannot collide with an existing row or orphan an order line.
 */
export async function addTray(_prev: FormState, fd: FormData): Promise<FormState> {
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
     *trays* only: this folder is its own namespace (SPEC §23.2). */
  const existing = await listTrays();
  if (existing.some((t) => t.contentKey === contentKey))
    return err("keyTaken", "contentKey", { key: contentKey });

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  await putTray({ id: crypto.randomUUID(), contentKey, ...ops.value });
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
  if (!Number.isInteger(value.packPieces)) return { ok: false, state: err("packPiecesInvalid", "packPieces") };
  return { ok: true, value };
}

/** Update the price, the lead time and the packing on an existing item. The
 *  key and id never change here — re-keying means renaming the content file
 *  and is a rename, not an edit. */
export async function updateTray(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const current = id ? await getTray(id) : null;
  if (!current) return err("notFound");

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;
  const packing = readPacking(fd);
  if (!packing.ok) return packing.state;

  /* Packing replaces rather than merges: clearing all six fields is how an
     owner says "re-measure this", and a merge would keep the old figures. */
  const rest = Object.fromEntries(
    Object.entries(current).filter(([k]) => !(PACKING as readonly string[]).includes(k)),
  ) as Tray;
  await putTray({ ...rest, ...ops.value, ...packing.value });
  refresh();
  return { status: "saved" };
}

/** Hide an item without losing its price or its lead time. This is the only
 *  way something leaves this category's shelf: there is no out-of-stock state
 *  to fall into, because nothing is ever in stock (SPEC §23.1). */
export async function toggleTrayActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getTray(String(fd.get("id")));
  if (!existing) throw new Error("Tray not found");
  await putTray({ ...existing, active: !existing.active });
  refresh();
}

export async function removeTray(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteTray(String(fd.get("id")));
  refresh();
}
