import { MAX_LEAD_DAYS, daysFromToday } from "@/lib/delivery-date";

/**
 * How long a tray or a drainage mat takes to reach a customer — SPEC §23.1.
 *
 * The owner's instruction, on adding the first three items on 17 Sep 2026:
 *
 * > *"even these are ordered based on the request this would take minimum of
 * > seven days to deliver"*
 *
 * Three consequences, and they are the whole module:
 *
 * 1. **There is no fast path.** Unlike a seed, which may be on our own shelf
 *    and go out tomorrow (§22.2), nothing in this category is ever held. Every
 *    order is a purchase order, so every promise is a lead time.
 * 2. **The figure is per item, not global.** Seven days is the minimum the
 *    owner will promise, and the three launch items all sit on it — but they
 *    come from two different suppliers already. `Tray.leadDays` therefore
 *    holds one number per row, and this module only holds the bounds.
 * 3. **"Minimum seven days" is a floor on the promise, not a target.** A
 *    figure below seven is refused rather than rounded, because an operator
 *    typing 3 means something we cannot do, and quietly correcting it to 7
 *    hides the disagreement.
 *
 * This is the one home for the rule. Do not compare against `7` at a call
 * site: the admin form, the server action and the customer-facing card all
 * read it from here, so raising the floor is one edit.
 */

/** The shortest delivery this category may promise, in days. The owner's
 *  figure, verbatim. */
export const TRAY_MIN_LEAD_DAYS = 7;

/**
 * The longest, and it is not a business rule — it is `MAX_LEAD_DAYS` from the
 * date arithmetic, imported rather than restated.
 *
 * `daysFromToday` clamps to that figure, so a row saved at 30 would print a
 * date 14 days out and disagree with its own admin screen. Refusing it at the
 * form is the only place that disagreement can be prevented rather than
 * discovered. If a supplier genuinely needs longer, both numbers move
 * together.
 */
export const TRAY_MAX_LEAD_DAYS = MAX_LEAD_DAYS;

/** What a new row starts on: the owner's minimum, because that is the promise
 *  every item launched with and the one an operator will most often want. */
export const TRAY_DEFAULT_LEAD_DAYS = TRAY_MIN_LEAD_DAYS;

/** Whether a typed figure is a lead time this category can honour. Whole days
 *  only — half a day of supplier lead time is not a thing anyone can act on. */
export function isValidLeadDays(days: number): boolean {
  return (
    Number.isInteger(days) &&
    days >= TRAY_MIN_LEAD_DAYS &&
    days <= TRAY_MAX_LEAD_DAYS
  );
}

/**
 * When an order placed now would reach the customer.
 *
 * Day-granular in IST, like every other date in the app, so the hour someone
 * orders cannot move the promise.
 *
 * Three callers, all showing the same date in a different place: the grid card,
 * the detail page's buy box, and the cart line (SPEC §23.5, §23.3, §23.7).
 * **It does not take a quantity**, and that is the difference from
 * `seedReadyDate`: five packs and one pack are the same single order to the
 * same supplier, so the promise does not move as a stepper does.
 */
export function trayReadyDate(leadDays: number, now: Date = new Date()): Date {
  return daysFromToday(isValidLeadDays(leadDays) ? leadDays : TRAY_MAX_LEAD_DAYS, now);
}
