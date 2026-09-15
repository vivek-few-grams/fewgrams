"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deleteVariety, getVariety, listVarieties, putVariety } from "@/lib/repo/varieties";
import { isValidContentKey } from "@/lib/content/varieties";
import type { FormState } from "@/lib/forms";
import type { Variety } from "@/lib/types";

/**
 * Variety mutations — the operational record only.
 *
 * SPEC §8: every one of these asserts the admin role itself. Server actions
 * are addressable over HTTP independently of the page that renders the form.
 *
 * **Nothing here accepts text.** A variety's name and copy come from
 * `content/varieties/<contentKey>.json` (SPEC §4.3), so the only identifier
 * these actions take is a content key, and a key with no file on disk is
 * refused. That is what makes "a variety with no copy" unrepresentable rather
 * than merely discouraged.
 */

/** Public pages that change when the catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/varieties", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/microgreens", "page");
}

function positive(fd: FormData, key: string, min: number): number | null {
  const n = Number(String(fd.get(key) ?? "").trim());
  return Number.isFinite(n) && n >= min ? n : null;
}

/** The four numbers plus active — everything this screen is allowed to set.
 *  `tier` was removed on 15 Sep 2026: it was written here and read nowhere,
 *  and curated plans name their varieties explicitly per rotation week
 *  (SPEC §5.1), so grouping varieties by tier earned nothing. */
type Ops = Pick<
  Variety,
  "pricePer100g" | "yieldGramsPerTray" | "growDays" | "seedGramsPerTray" | "active"
>;

function readOps(fd: FormData): { ok: true; value: Ops } | { ok: false; state: FormState } {
  const growDays = positive(fd, "growDays", 1);
  if (growDays === null)
    return { ok: false, state: { status: "error", code: "growDaysInvalid", field: "growDays" } };

  const yieldGramsPerTray = positive(fd, "yieldGramsPerTray", 1);
  if (yieldGramsPerTray === null)
    return { ok: false, state: { status: "error", code: "yieldInvalid", field: "yieldGramsPerTray" } };

  const pricePer100g = positive(fd, "pricePer100g", 1);
  if (pricePer100g === null)
    return { ok: false, state: { status: "error", code: "priceInvalid", field: "pricePer100g" } };

  const seedRaw = String(fd.get("seedGramsPerTray") ?? "").trim();
  const seed = seedRaw ? Number(seedRaw) : null;

  return {
    ok: true,
    value: {
      growDays,
      yieldGramsPerTray,
      pricePer100g,
      ...(seed !== null && Number.isFinite(seed) && seed > 0
        ? { seedGramsPerTray: seed }
        : {}),
      active: fd.get("active") === "on",
    },
  };
}

/**
 * Create a variety from a content key.
 *
 * **The content file is deliberately NOT a precondition** (changed 15 Sep
 * 2026). Requiring it first meant you could not add a variety without opening
 * a code editor, which is the wrong order for the person who grows the
 * greens. Declare it here, write the copy after.
 *
 * What stops a nameless variety reaching a customer is downstream, not here:
 * the admin row shows a red "content file missing" warning naming the exact
 * path, and every public page skips a variety it cannot name. So a mistyped
 * key is visible immediately and harmless.
 *
 * The id is a generated UUID and is never derived from the key, so re-keying
 * content later cannot collide with an existing row or orphan an order line.
 */
export async function addVariety(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const contentKey = String(fd.get("contentKey") ?? "")
    .trim()
    .toLowerCase();
  if (!contentKey) return { status: "error", code: "keyRequired", field: "contentKey" };

  // Format still matters: the key is both a filename and a URL segment, so it
  // is validated rather than sanitised — quietly rewriting it would break the
  // link between the row and the file the operator is about to create.
  if (!isValidContentKey(contentKey))
    return { status: "error", code: "keyInvalid", field: "contentKey", values: { key: contentKey } };

  // One row per key — the key is the GSI1 sort key and the public URL, so two
  // rows sharing one would make /microgreens/<key> ambiguous.
  const existing = await listVarieties();
  if (existing.some((v) => v.contentKey === contentKey))
    return { status: "error", code: "keyTaken", field: "contentKey", values: { key: contentKey } };

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  await putVariety({ id: crypto.randomUUID(), contentKey, ...ops.value });
  refresh();
  return { status: "saved" };
}

/** Update the numbers on an existing variety. The key and id never change
 *  here — re-keying means renaming the content file and is a rename, not an
 *  edit. */
export async function updateVariety(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const current = id ? await getVariety(id) : null;
  if (!current) return { status: "error", code: "notFound" };

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  await putVariety({ ...current, ...ops.value });
  refresh();
  return { status: "saved" };
}

export async function toggleVarietyActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getVariety(String(fd.get("id")));
  if (!existing) throw new Error("Variety not found");
  await putVariety({ ...existing, active: !existing.active });
  refresh();
}

export async function removeVariety(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteVariety(String(fd.get("id")));
  refresh();
}
