/**
 * Weekly cycle date arithmetic — SPEC §5.3.
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
