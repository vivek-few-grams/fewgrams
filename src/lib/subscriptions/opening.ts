import { firstDeliveryDate } from "@/lib/delivery-date";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { listVarieties } from "@/lib/repo/varieties";
import { rotationWeek } from "./rotation";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Friday-night cutoff sits a full week before its Saturday: the sow
 *  Sunday is the day after it, and the box goes out six days later. */
const CUTOFF_DAYS = 7;

/** More Saturdays than a rotation has weeks, so a run of slow weeks cannot
 *  leave the loop without an answer. */
const LOOKAHEAD = 8;

/** The first Saturday a new subscriber can have, and the last day to join for it. */
export type Opening = {
  /** 00:00 IST on the Saturday of the first box. */
  first: Date;
  /** 00:00 IST on the last day a subscription still makes `first`. */
  joinBy: Date;
};

/**
 * The first Saturday a subscription bought at `now` can actually be grown for
 * (the owner, 31 Oct 2026).
 *
 * The Friday-night cutoff alone was not enough. A Saturday whose rotation week
 * holds a slow crop — broccoli at ten days — has to be in the trays by the
 * Wednesday before it, so somebody joining on the Thursday was promised a box
 * that was sown before they ordered it. A Saturday therefore closes at the
 * earlier of its Friday cutoff and the start of its slowest crop's sow-by day,
 * and a later sign-up starts on the next Saturday that is still open.
 *
 * `slowestDays(week)` is the longest grow time among the varieties every
 * subscribable plan puts in that rotation week (0 for an empty week). One
 * date for every plan, so `/plans` can print it before anyone picks a plan.
 */
export function openingSaturday(now: Date, slowestDays: (week: number) => number): Opening {
  const first = firstDeliveryDate(now);
  for (let i = 0; i < LOOKAHEAD; i++) {
    const saturday = new Date(first.getTime() + i * 7 * DAY_MS);
    const lead = Math.max(CUTOFF_DAYS, Math.ceil(slowestDays(rotationWeek(saturday))));
    const closes = saturday.getTime() - lead * DAY_MS;
    if (now.getTime() < closes) return { first: saturday, joinBy: new Date(closes - DAY_MS) };
  }
  /* Only reachable with a grow time longer than the lookahead covers. Fall
     back to the furthest Saturday tried rather than promise an earlier one. */
  const last = new Date(first.getTime() + (LOOKAHEAD - 1) * 7 * DAY_MS);
  return { first: last, joinBy: new Date(now.getTime()) };
}

/**
 * The longest grow time in each rotation week, across every active plan's
 * rotation — what `openingSaturday` needs from the database. A variety with
 * no row, or no grow days, adds nothing.
 */
export async function slowestByWeek(): Promise<(week: number) => number> {
  const [plans, varieties] = await Promise.all([listPlansWithWeeks({ activeOnly: true }), listVarieties()]);
  const days = new Map(varieties.map((v) => [v.contentKey, v.growDays]));
  const byWeek = new Map<number, number>();
  for (const { plan, weeks } of plans) {
    if (plan.monthlyPrice === null) continue;
    for (const w of weeks) {
      const slowest = Math.max(0, ...w.varietyKeys.map((k) => days.get(k) ?? 0));
      byWeek.set(w.week, Math.max(byWeek.get(w.week) ?? 0, slowest));
    }
  }
  return (week) => byWeek.get(week) ?? 0;
}

/** `openingSaturday` for the rotation as it stands. */
export async function subscriptionOpening(now: Date = new Date()): Promise<Opening> {
  return openingSaturday(now, await slowestByWeek());
}
