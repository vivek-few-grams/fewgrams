"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import {
  deleteVariety,
  getVariety,
  listVarieties,
  putVariety,
  putVarietyCosting,
  setVarietyActive,
} from "@/lib/repo/varieties";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { isValidContentKey } from "@/lib/content/varieties";
import { getPlanContent } from "@/lib/content/plans";
import { routing } from "@/i18n/routing";
import { count, err, switchTo, zeroOrMore, type FormState } from "@/lib/forms";
import { repriceVarieties } from "@/lib/varieties/reprice";
import type { Variety, VarietyCosting } from "@/lib/types";

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
 *
 * **Nor a price** (the owner, 19 Oct 2026). A green is priced per 100 g from
 * what a tray costs — its seed, cocopeat, and power and water — over its low
 * yield, with the microgreens margin. Every save here ends in
 * `repriceVarieties`, which writes it — handed the row or costing just
 * written, because the list it would otherwise read may not show the write
 * yet (`RepriceOverrides`).
 */

/** Public pages that change when the catalogue does — every one that prints
 *  a green's price. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

function positive(fd: FormData, key: string, min: number): number | null {
  const n = Number(String(fd.get(key) ?? "").trim());
  return Number.isFinite(n) && n >= min ? n : null;
}

/** The numbers plus active — everything this screen is allowed to set.
 *  `tier` was removed on 15 Sep 2026: it was written here and read nowhere,
 *  and curated plans name their varieties explicitly per rotation week
 *  (SPEC §5.1), so grouping varieties by tier earned nothing. */
type Ops = Pick<
  Variety,
  "yieldGramsPerTrayMin" | "yieldGramsPerTrayMax" | "growDays" | "seedGramsPerTray" | "active"
>;

function readOps(fd: FormData): { ok: true; value: Ops } | { ok: false; state: FormState } {
  const growDays = positive(fd, "growDays", 1);
  if (growDays === null)
    return { ok: false, state: { status: "error", code: "growDaysInvalid", field: "growDays" } };

  const yieldGramsPerTrayMin = positive(fd, "yieldGramsPerTrayMin", 1);
  if (yieldGramsPerTrayMin === null)
    return {
      ok: false,
      state: { status: "error", code: "yieldInvalid", field: "yieldGramsPerTrayMin" },
    };

  const yieldGramsPerTrayMax = positive(fd, "yieldGramsPerTrayMax", 1);
  if (yieldGramsPerTrayMax === null)
    return {
      ok: false,
      state: { status: "error", code: "yieldInvalid", field: "yieldGramsPerTrayMax" },
    };

  // The range has to be the right way round — a max below the min is not a
  // typo the site can silently swap, since either figure could be the mistake.
  if (yieldGramsPerTrayMax < yieldGramsPerTrayMin)
    return {
      ok: false,
      state: { status: "error", code: "yieldRangeInvalid", field: "yieldGramsPerTrayMax" },
    };

  const seedRaw = String(fd.get("seedGramsPerTray") ?? "").trim();
  const seed = seedRaw ? Number(seedRaw) : null;
  /* Blank is allowed — the variety just cannot be priced yet — but a typed
     figure has to be one. */
  if (seed !== null && !(Number.isFinite(seed) && seed > 0))
    return { ok: false, state: { status: "error", code: "seedInvalid", field: "seedGramsPerTray" } };

  return {
    ok: true,
    value: {
      growDays,
      yieldGramsPerTrayMin,
      yieldGramsPerTrayMax,
      ...(seed !== null ? { seedGramsPerTray: seed } : {}),
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

  const row: Variety = { id: crypto.randomUUID(), contentKey, pricePer100g: 0, ...ops.value };
  await putVariety(row);
  await repriceVarieties([contentKey], { varieties: [row] });
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

  /* Clearing the seed rate has to clear it, not keep the old one under the
     spread. The price is the old one until the reprice straight after. */
  const next: Variety = { ...current, ...ops.value };
  if (ops.value.seedGramsPerTray === undefined) delete next.seedGramsPerTray;
  await putVariety(next);
  await repriceVarieties([current.contentKey], { varieties: [next] });
  refresh();
  return { status: "saved" };
}

/** On and off sale, to the state the button asks for (`switchTo`). **Not
 *  switched on while it cannot be priced** — it would stay off sale at 0
 *  anyway, and the switch would say otherwise. */
export async function toggleVarietyActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getVariety(String(fd.get("id")));
  if (!existing) throw new Error("Variety not found");
  const active = switchTo(fd);
  if (active === null) throw new Error("No target state posted");
  if (active === existing.active) return;
  if (active && existing.pricePer100g <= 0) return;
  await setVarietyActive(existing.id, active);
  refresh();
}

/**
 * Delete a variety — **refused while a plan's rotation names it**. Its key
 * would stay in that week, and `savePlan` refuses any rotation naming a
 * variety that no longer exists, so the plan could not be saved again until
 * someone found the key by hand. The error names the plan and the week to
 * take it out of.
 */
export async function removeVariety(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const current = await getVariety(String(fd.get("id") ?? ""));
  if (!current) return err("notFound");

  const uses = (await listPlansWithWeeks()).flatMap(({ plan, weeks }) =>
    weeks.filter((w) => w.varietyKeys.includes(current.contentKey)).map((w) => ({ plan, week: w.week })),
  );
  if (uses.length > 0) {
    const [first] = uses;
    const name =
      (await getPlanContent(first.plan.contentKey, routing.defaultLocale))?.text.name ??
      first.plan.contentKey;
    return err(uses.length > 1 ? "inRotationMore" : "inRotation", undefined, {
      plan: name,
      week: String(first.week),
      more: String(uses.length - 1),
    });
  }

  await deleteVariety(current.id);
  refresh();
  return { status: "saved" };
}

/**
 * The microgreens costing — cocopeat block and trays it fills, power and
 * water per tray, markup and rounding. Saving reprices **every** variety
 * straight away.
 */
export async function saveVarietyCosting(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const cocopeatBlockCost = zeroOrMore(fd, "cocopeatBlockCost");
  if (cocopeatBlockCost === null) return err("zeroOrMore", "cocopeatBlockCost");
  const traysPerBlock = count(fd, "traysPerBlock");
  if (traysPerBlock === null) return err("countInvalid", "traysPerBlock");
  const overheadPerTray = zeroOrMore(fd, "overheadPerTray");
  if (overheadPerTray === null) return err("zeroOrMore", "overheadPerTray");
  const cleaningPerTray = zeroOrMore(fd, "cleaningPerTray");
  if (cleaningPerTray === null) return err("zeroOrMore", "cleaningPerTray");
  const packingPer100g = zeroOrMore(fd, "packingPer100g");
  if (packingPer100g === null) return err("zeroOrMore", "packingPer100g");
  const packingPerBox = zeroOrMore(fd, "packingPerBox");
  if (packingPerBox === null) return err("zeroOrMore", "packingPerBox");
  const minProfitPerBox = zeroOrMore(fd, "minProfitPerBox");
  if (minProfitPerBox === null) return err("zeroOrMore", "minProfitPerBox");
  const minYieldPerTray = zeroOrMore(fd, "minYieldPerTray");
  if (minYieldPerTray === null) return err("zeroOrMore", "minYieldPerTray");
  const markupPercent = zeroOrMore(fd, "markupPercent");
  if (markupPercent === null) return err("zeroOrMore", "markupPercent");
  const roundUpToNearest = count(fd, "roundUpToNearest");
  if (roundUpToNearest === null) return err("countInvalid", "roundUpToNearest");

  const costing: VarietyCosting = {
    cocopeatBlockCost,
    traysPerBlock,
    overheadPerTray,
    cleaningPerTray,
    packingPer100g,
    packingPerBox,
    minProfitPerBox,
    minYieldPerTray,
    margin: { markupPercent, roundUpToNearest },
  };
  await putVarietyCosting(costing);
  await repriceVarieties(undefined, { costing });
  refresh();
  return { status: "saved" };
}
