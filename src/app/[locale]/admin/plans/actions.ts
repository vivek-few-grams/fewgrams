"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deletePlan, listPlans, putPlan } from "@/lib/repo/plans";
import { listVarieties } from "@/lib/repo/varieties";
import { listPlanKeys } from "@/lib/content/plans";
import type { FormState } from "@/lib/forms";
import type { Plan, PlanWeek } from "@/lib/types";
import { ROTATION_WEEKS, weekField } from "./rotation";

/**
 * Plan mutations — the numbers and the rotation, nothing else.
 *
 * SPEC §8: every one of these asserts the admin role itself. Server actions
 * are addressable over HTTP independently of the page that renders the form.
 *
 * ## There is no "add a plan"
 *
 * DECISION (15 Sep 2026): **the plans are fixed at three** — Essential, Exotic
 * and Build Your Own (SPEC §5.1) — and which three exist is decided by the
 * files in `content/plans/`, not by this screen. So `addPlan` is gone and
 * `savePlan` is an **upsert keyed on `contentKey`**: it reuses the row's
 * existing `id` if there is one and mints a UUID if this is the first save.
 *
 * That also removes the whole class of mistakes the old add form allowed — a
 * mistyped key, a duplicate key, a plan with no content file — because the key
 * is no longer typed at all. It arrives as a hidden field and is checked
 * against the content folder here.
 *
 * `removePlan` survives for exactly one case: a row whose content file has
 * been deleted. Nothing about such a plan can be shown to a customer, so the
 * admin needs a way to clear it. The three real plans are not deletable.
 *
 * **Nothing here accepts text.** A plan's name, tagline, description and
 * highlights come from `content/plans/<contentKey>.json` (SPEC §5.1.1).
 */

/** Public pages that change when a plan does. */
function refresh() {
  revalidatePath("/[locale]/admin/plans", "page");
  revalidatePath("/[locale]", "page");
}

/** Everything this screen is allowed to set, minus the identifiers. */
type Ops = Omit<Plan, "id" | "contentKey">;

function readOps(fd: FormData): { ok: true; value: Ops } | { ok: false; state: FormState } {
  /* Build Your Own is spelled `monthlyPrice: null` (SPEC §5.1), so the tick
     box and the price field are one decision, not two. */
  const byo = fd.get("byo") === "on";
  const priceRaw = String(fd.get("monthlyPrice") ?? "").trim();

  if (!byo && !priceRaw) {
    return { ok: false, state: { status: "error", code: "priceRequired", field: "monthlyPrice" } };
  }
  const price = byo ? null : Number(priceRaw);
  if (price !== null && !(Number.isFinite(price) && price > 0)) {
    return { ok: false, state: { status: "error", code: "priceInvalid", field: "monthlyPrice" } };
  }

  /* A curated plan states a box weight; Build Your Own cannot, because the
     customer chooses the grams — which is what `0` means here, and what the
     card reads to print "grams you choose". */
  const grams = Number(String(fd.get("gramsPerBox") ?? "").trim() || 0);
  if (!Number.isFinite(grams) || grams < 0 || (!byo && grams < 1)) {
    return { ok: false, state: { status: "error", code: "gramsInvalid", field: "gramsPerBox" } };
  }

  const sortOrder = Number(String(fd.get("sortOrder") ?? "").trim() || 0);

  return {
    ok: true,
    value: {
      monthlyPrice: price,
      gramsPerBox: grams,
      recommended: fd.get("recommended") === "on",
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      active: fd.get("active") === "on",
    },
  };
}

/**
 * The four weeks, from the multi-select's hidden fields.
 *
 * Every key is checked against the live variety list. The picker can only
 * offer real varieties, but a form field is not a security boundary (SPEC §8) —
 * and this also catches the honest case where a variety was deleted while the
 * plan screen sat open in another tab, which would otherwise write a rotation
 * pointing at a green that no longer exists.
 *
 * A week with nothing picked is **omitted**, not stored empty: `putPlan`
 * treats the posted set as the whole rotation and deletes the rest, so
 * clearing a week removes it.
 */
async function readWeeks(
  fd: FormData,
  planId: string,
): Promise<{ ok: true; value: PlanWeek[] } | { ok: false; state: FormState }> {
  const known = new Set((await listVarieties()).map((v) => v.contentKey));
  const weeks: PlanWeek[] = [];

  for (const week of ROTATION_WEEKS) {
    const picked = fd
      .getAll(weekField(week))
      .map((v) => String(v).trim())
      .filter(Boolean);

    for (const key of picked) {
      if (!known.has(key)) {
        return {
          ok: false,
          state: { status: "error", code: "varietyUnknown", values: { key } },
        };
      }
    }
    const unique = [...new Set(picked)];
    if (unique.length > 0) weeks.push({ planId, week, varietyKeys: unique });
  }

  return { ok: true, value: weeks };
}

/**
 * Save one plan's numbers and rotation, creating the row on first save.
 *
 * Keyed on `contentKey` rather than `id` because the content file is the
 * authority on which plans exist: the screen renders a row per file, and a
 * file with no row yet is simply one that has never been priced.
 */
export async function savePlan(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const contentKey = String(fd.get("contentKey") ?? "").trim();
  const keys = await listPlanKeys();
  if (!contentKey || !keys.includes(contentKey)) {
    return { status: "error", code: "keyUnknown" };
  }

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  const existing = (await listPlans()).find((p) => p.contentKey === contentKey);
  const id = existing?.id ?? crypto.randomUUID();

  const weeks = await readWeeks(fd, id);
  if (!weeks.ok) return weeks.state;

  await putPlan({ id, contentKey, ...ops.value }, weeks.value);
  refresh();
  return { status: "saved" };
}

/**
 * Delete a plan row. Offered **only** for a row whose content file is gone —
 * the three real plans are defined by their files and cannot be removed here.
 * Re-checked server-side, because the button being hidden is not the rule.
 */
export async function removePlan(fd: FormData): Promise<void> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const plan = (await listPlans()).find((p) => p.id === id);
  if (!plan) return;

  const keys = await listPlanKeys();
  if (keys.includes(plan.contentKey)) {
    throw new Error(
      `Plan ${plan.contentKey} still has a content file and is not deletable`,
    );
  }

  await deletePlan(id);
  refresh();
}
