import { getPlanContent, type PlanText } from "@/lib/content/plans";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import type { Plan, PlanWeek } from "@/lib/types";

export type SubscribablePlan = { plan: Plan; weeks: PlanWeek[]; text: PlanText };

/**
 * The plans a customer can subscribe to right now: active, priced by the
 * month, named by a content file, and with at least one rotation week set.
 *
 * `monthlyPrice === null` is Pick Your Own, which is **not** subscribable
 * (the owner, 26 Sep 2026) — excluded here, which is what both the page and
 * the action read, so the rule cannot be honoured on one and not the other.
 */
export async function subscribablePlans(locale: string): Promise<SubscribablePlan[]> {
  const rows = await listPlansWithWeeks({ activeOnly: true });
  const all = await Promise.all(
    rows.map(async ({ plan, weeks }) => {
      if (plan.monthlyPrice === null || weeks.length === 0) return null;
      const content = await getPlanContent(plan.contentKey, locale);
      return content ? { plan, weeks, text: content.text } : null;
    }),
  );
  return all.filter((p): p is SubscribablePlan => p !== null);
}
