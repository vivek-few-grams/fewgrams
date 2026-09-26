import { deliverySchedule, fromIstDateISO, istDateISO } from "@/lib/delivery-date";
import { ROTATION_WEEKS } from "@/lib/subscriptions/weeks";

/**
 * The rotation runs on **one calendar for everybody** — SPEC §5.2.1 (the
 * owner, 26 Sep 2026).
 *
 * A plan's four weeks are not "your first box, your second box". They are
 * four slots in a cycle that every subscriber shares: on any given Saturday
 * every Everyday Essentials box holds the same greens, whoever it goes to and
 * whenever they signed up. That is what makes the tray plan possible — the
 * owner sows broccoli for one Saturday, not for twenty different "week 2"s —
 * and it is why somebody subscribing mid-month starts on whichever week is
 * next, not on week 1.
 *
 * Counted from a fixed Saturday, not from the month. A month has four or five
 * Saturdays, so "the first Saturday of the month is week 1" would put week 1
 * twice in a row every few months; a fixed anchor and `mod 4` never repeats a
 * week and never skips one.
 *
 * **Do not move the anchor casually.** Every paid subscription stored which
 * rotation week each of its Saturdays is, but the tray plan and the rotation
 * panel read this function, so moving it re-labels every future Saturday for
 * everyone at once.
 */
export const ROTATION_ANCHOR = "2026-10-10";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Which rotation week (1–4) a delivery Saturday falls on. Works for dates
 *  before the anchor too. */
export function rotationWeek(date: Date): number {
  const weeks = Math.round(
    (fromIstDateISO(istDateISO(date)).getTime() - fromIstDateISO(ROTATION_ANCHOR).getTime()) / WEEK_MS,
  );
  const n = ROTATION_WEEKS.length;
  return (((weeks % n) + n) % n) + 1;
}

/** One Saturday of a subscription: when, and which rotation week it is. */
export type ScheduledBox = { date: Date; week: number };

/**
 * The Saturdays a subscription bought at `now` delivers on, each with its
 * rotation week — first box first. Starts on the §5.3 first-delivery date,
 * so whatever week that happens to be is the customer's first box.
 */
export function subscriptionSchedule(now: Date = new Date(), boxes = ROTATION_WEEKS.length): ScheduledBox[] {
  return deliverySchedule(now, boxes).map((date) => ({ date, week: rotationWeek(date) }));
}

/**
 * The next `count` Saturdays, starting today if today is one — the admin
 * tray plan's columns. `YYYY-MM-DD` IST.
 */
export function upcomingSaturdays(now: Date = new Date(), count = 4): string[] {
  const today = istDateISO(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const first = fromIstDateISO(today).getTime() + ((6 - dow + 7) % 7) * 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => istDateISO(new Date(first + i * WEEK_MS)));
}
