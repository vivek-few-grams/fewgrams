import { MAX_LEAD_DAYS, daysFromToday } from "@/lib/delivery-date";
import { TRAY_MIN_LEAD_DAYS } from "@/lib/trays/lead-time";

/**
 * How long a grow medium takes to reach a customer — SPEC §24.1.
 *
 * Nothing in this category is held: every block is ordered from IFFCO Urban
 * Gardens when a customer orders it, so every promise is a lead time and there
 * is no next-day path — the same position a tray is in (§23.1).
 *
 * **The floor is the tray floor, imported, until the owner sets one of its
 * own.** Seven days is the owner's minimum for anything bought in per order;
 * nobody has said coir is faster, and promising a shorter week on a guess is
 * the one direction a lead time must not err. It is a separate constant rather
 * than a direct use of `TRAY_MIN_LEAD_DAYS` at the call sites, so that when a
 * figure for coir is given it is one edit here and trays do not move with it.
 *
 * Do not compare against `7` at a call site; read it from here.
 */

/** The shortest delivery this category may promise, in days. */
export const MEDIUM_MIN_LEAD_DAYS = TRAY_MIN_LEAD_DAYS;

/** The longest — `MAX_LEAD_DAYS` from the date arithmetic, imported rather
 *  than restated, because `daysFromToday` clamps to it and a row saved beyond
 *  it would print a date that disagreed with its own admin screen. */
export const MEDIUM_MAX_LEAD_DAYS = MAX_LEAD_DAYS;

/** What a new row starts on. */
export const MEDIUM_DEFAULT_LEAD_DAYS = MEDIUM_MIN_LEAD_DAYS;

/** Whole days inside the bounds — refused, never rounded, at the form. */
export function isValidMediumLeadDays(days: number): boolean {
  return (
    Number.isInteger(days) &&
    days >= MEDIUM_MIN_LEAD_DAYS &&
    days <= MEDIUM_MAX_LEAD_DAYS
  );
}

/**
 * When an order placed now would reach the customer. Takes no quantity: two
 * blocks and one block are one order to one supplier, so the date does not
 * move with the stepper — the same as `trayReadyDate`.
 */
export function mediumReadyDate(leadDays: number, now: Date = new Date()): Date {
  return daysFromToday(
    isValidMediumLeadDays(leadDays) ? leadDays : MEDIUM_MAX_LEAD_DAYS,
    now,
  );
}
