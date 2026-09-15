import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { PlanEntity, PlanWeekEntity } from "@/lib/db/entities";
import type { Plan, PlanWeek } from "@/lib/types";

/**
 * Plan repository — plan definitions and their rotation weeks (SPEC §4 /
 * §5.2). The key layout, including the documented GSI1 deviation and the
 * `sortOrder` padding, lives in src/lib/db/entities.ts.
 *
 * The one translation this layer performs: SPEC §5.1 spells "Build Your Own"
 * as `monthlyPrice: null`, because a domain type wants an explicit "priced by
 * weight, not by the month" value. DynamoDB stores its absence instead —
 * a stored `null` would have to be special-cased in every filter expression.
 * The mapping is confined to these two functions.
 */

const toDomain = (p: Omit<Plan, "monthlyPrice"> & { monthlyPrice?: number }): Plan => ({
  ...p,
  monthlyPrice: p.monthlyPrice ?? null,
});

export async function listPlans(
  opts: { activeOnly?: boolean } = {},
): Promise<Plan[]> {
  const { data } = await PlanEntity.query.byCatalogue({}).go(LIST_OPTS);
  const all = data.map(toDomain);
  return opts.activeOnly ? all.filter((p) => p.active) : all;
}

export async function getPlan(id: string): Promise<Plan | null> {
  const { data } = await PlanEntity.get({ id }).go(READ_OPTS);
  return data ? toDomain(data) : null;
}

export async function getPlanWeeks(planId: string): Promise<PlanWeek[]> {
  const { data } = await PlanWeekEntity.query.byPlan({ planId }).go(LIST_OPTS);
  return [...data].sort((a, b) => a.week - b.week);
}

/** Every plan with its rotation attached. One Query for the plans, then one
 *  per plan for its weeks — fine at three or four plans, and the home page is
 *  statically rendered anyway. A collection would fold this into a single
 *  Query; see the note in src/lib/db/entities.ts for why we do not use one. */
export async function listPlansWithWeeks(opts: { activeOnly?: boolean } = {}) {
  const plans = await listPlans(opts);
  return Promise.all(
    plans.map(async (plan) => ({ plan, weeks: await getPlanWeeks(plan.id) })),
  );
}

/**
 * Write a plan and **replace** its rotation.
 *
 * Replace, not merge. The admin form posts the whole rotation every time, so
 * unticking every variety in week 3 means week 3 is gone — and a `put` of
 * only the remaining weeks would leave the old row behind, with the card still
 * counting a week the operator had just emptied. Any week not in `weeks` is
 * therefore deleted.
 */
export async function putPlan(plan: Plan, weeks: PlanWeek[]): Promise<void> {
  const { monthlyPrice, ...rest } = plan;
  await PlanEntity.put({
    ...rest,
    ...(monthlyPrice !== null && { monthlyPrice }),
  }).go();

  const existing = await getPlanWeeks(plan.id);
  const kept = new Set(weeks.map((w) => w.week));
  const stale = existing.filter((w) => !kept.has(w.week));

  if (weeks.length > 0) {
    await PlanWeekEntity.put(weeks.map((w) => ({ ...w, planId: plan.id }))).go();
  }
  if (stale.length > 0) {
    await PlanWeekEntity.delete(
      stale.map((w) => ({ planId: plan.id, week: w.week })),
    ).go();
  }
}

export async function deletePlan(id: string): Promise<void> {
  const weeks = await getPlanWeeks(id);
  await PlanEntity.delete({ id }).go();
  if (weeks.length === 0) return;
  await PlanWeekEntity.delete(
    weeks.map((w) => ({ planId: id, week: w.week })),
  ).go();
}
