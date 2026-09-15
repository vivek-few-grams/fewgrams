/**
 * Delivery date arithmetic. **Two different rules, deliberately.**
 *
 * | | Sown | Delivered |
 * |---|---|---|
 * | Subscription (§5.3) | the Sunday after the Friday cutoff | the Saturday after that |
 * | One-off order (§18.6) | **the next day** | `growDays` after the sow |
 *
 * Corrected 15 Sep 2026 on the owner's instruction: *"We don't sow on Sundays
 * for individual order, it will be done next day only. Only for subscription,
 * it will be done on Sundays."* The weekly cycle exists to batch a month of
 * committed subscription demand into one sow; a single 100 g order has nothing
 * to batch with, so making it wait up to six days for a Sunday would add most
 * of a week to the promise for no operational gain.
 *
 * Everything below the `nextCutoff` / `sowSunday` / `firstDeliveryDate` group
 * is subscription-only. Ad-hoc uses `adhocSowDate` / `adhocReadyDate`.
 *
 *   Fri 23:59 IST  ─ CUTOFF (i.e. Saturday 00:00). The cycle locks.
 *   Sun AM         ─ SOW.
 *   Sat            ─ HARVEST + DELIVER (the Saturday after the sow Sunday).
 *
 * Subscribe after the cutoff and the first delivery rolls a week later.
 * Per SPEC §5.3 this is "the single most important piece of expectation-
 * setting on the site", so it is a pure function with no dependencies and
 * all reasoning done explicitly in IST.
 *
 * India has no daylight saving, so a fixed +05:30 offset is exact — not an
 * approximation. Do NOT rewrite this using the server's local timezone:
 * the app runs in ap-south-1 today but Amplify build and preview
 * environments do not guarantee TZ, and getting this wrong silently moves
 * every customer's delivery date by a day.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Day-of-week in IST. 0 = Sunday … 6 = Saturday. */
function istDayOfWeek(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCDay();
}

/** The instant of 00:00 IST on the IST calendar day containing `date`. */
function istMidnight(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const dayStart = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(dayStart - IST_OFFSET_MS);
}

/**
 * The cutoff the given moment falls before: the next Saturday 00:00 IST
 * strictly after `now`.
 *
 * Note the strictness. An order placed at Saturday 00:00 exactly has
 * missed the cutoff, so it belongs to the following week's cycle.
 */
export function nextCutoff(now: Date): Date {
  const dow = istDayOfWeek(now);
  const midnight = istMidnight(now);
  // Days until the upcoming Saturday (6). On Saturday itself, 7.
  const daysAhead = dow === 6 ? 7 : 6 - dow;
  const candidate = new Date(midnight.getTime() + daysAhead * DAY_MS);
  // On a Friday, `candidate` is tomorrow 00:00, which is still ahead. But if
  // `now` is itself exactly a Saturday 00:00, daysAhead=7 already handles it.
  return candidate;
}

/** The Sunday morning on which an order placed at `now` gets sown. */
export function sowSunday(now: Date): Date {
  // The Sunday immediately following the cutoff Saturday.
  return new Date(nextCutoff(now).getTime() + DAY_MS);
}

/**
 * First delivery date for an order placed at `now`: the Saturday after the
 * sow Sunday.
 *
 * Returns an instant at 00:00 IST on that Saturday — a date, not a
 * delivery time. Format it for display with `formatDeliveryDate`.
 */
export function firstDeliveryDate(now: Date = new Date()): Date {
  return new Date(sowSunday(now).getTime() + 6 * DAY_MS);
}

/** The four delivery Saturdays of a one-month plan starting at `now`. */
export function deliverySchedule(now: Date = new Date(), weeks = 4): Date[] {
  const first = firstDeliveryDate(now);
  return Array.from(
    { length: weeks },
    (_, i) => new Date(first.getTime() + i * 7 * DAY_MS),
  );
}

/* ── One-off orders — SPEC §18.6 ─────────────────────────────────────
   Not on the weekly cycle. Sown the next morning, cut on the grow day. */

/** Largest sensible grow window, guarding against a bad `growDays` in the
 *  table turning into a nonsense date on a customer-facing page. */
const MAX_GROW_DAYS = 60;

/**
 * The morning a one-off order is sown: 00:00 IST on the **next** IST calendar
 * day. Order at 23:55 tonight and it is sown tomorrow; order at 00:05 tonight
 * and it is still sown tomorrow, not in 24 hours.
 *
 * Deliberately day-granular rather than "24 hours from now": sowing is a
 * morning job, so the unit the customer cares about is the day.
 */
export function adhocSowDate(now: Date = new Date()): Date {
  return new Date(istMidnight(now).getTime() + DAY_MS);
}

/**
 * When a one-off order of one variety is ready: `growDays` after it is sown.
 *
 * `growDays` is sow-to-harvest (SPEC §3.1) and greens are cut the morning they
 * travel, so harvest date and delivery date are the same day.
 */
export function adhocReadyDate(growDays: number, now: Date = new Date()): Date {
  const days = Math.min(Math.max(Math.ceil(growDays), 1), MAX_GROW_DAYS);
  return new Date(adhocSowDate(now).getTime() + days * DAY_MS);
}

/**
 * When a **mixed** one-off order is ready: the latest of its varieties.
 *
 * SPEC §18.6 left this open — radish at 7 days and sunflower at 14 cannot both
 * arrive on their own day without two trips for one order. This takes the
 * spec's own recommendation: one delivery, on the later date, stated plainly in
 * the cart rather than discovered afterwards. The alternative (holding the fast
 * crop for a week) contradicts "nothing is stored".
 *
 * Returns null for an empty cart — there is no date for nothing.
 */
export function adhocOrderReadyDate(
  growDaysList: number[],
  now: Date = new Date(),
): Date | null {
  if (growDaysList.length === 0) return null;
  return new Date(
    Math.max(...growDaysList.map((d) => adhocReadyDate(d, now).getTime())),
  );
}

/**
 * The IST calendar date as `YYYY-MM-DD`. Locale-proof, so this is what to
 * use for DynamoDB keys (`DELIVERY#<date>`, SPEC §4) and for tests.
 */
export function istDateISO(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Display form, e.g. "Sat 26 Sept". Assembled from `formatToParts` rather
 * than a raw `format()` call so the comma `en-IN` inserts is dropped while
 * the locale still supplies the month name — which is what lets the `kn`
 * locale render Kannada months for free.
 *
 * Note: en-IN abbreviates September as "Sept", not "Sep". That is correct
 * Indian/British English and is not a bug — do not "fix" it with a hardcoded
 * month table, which would break Kannada.
 */
export function formatDeliveryDate(date: Date, locale = "en-IN"): string {
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).formatToParts(date);

  return parts
    .filter((p) => p.type !== "literal")
    .map((p) => p.value)
    .join(" ");
}

/** True once the current cycle has locked for the week. */
export function hoursUntilCutoff(now: Date = new Date()): number {
  return (nextCutoff(now).getTime() - now.getTime()) / (60 * 60 * 1000);
}
