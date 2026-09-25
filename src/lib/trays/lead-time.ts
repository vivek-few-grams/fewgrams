import { daysFromToday, nextDay } from "@/lib/delivery-date";

/**
 * When a tray or grow-media line is ready — SPEC §23.1, §24 (the owner,
 * 25 Sep 2026). Pure, and shared by both kinds.
 *
 * Until then nothing in either category was held: every order was placed with
 * the supplier and promised on a per-row lead time of at least seven days.
 * The owner now keeps stock in Bengaluru and records how many packs are held:
 *
 * > *"stock first then if its more add 1 day extra so that I can order from
 * > vendor get delivery in next day"*
 *
 * | Ordered | Ready |
 * |---|---|
 * | ≤ packs held | **next day**, off our shelf |
 * | > packs held | next day **+ {@link RESTOCK_EXTRA_DAYS}** — the vendor delivers to us overnight |
 *
 * Unlike a seed, more than is held can still be ordered; the whole line
 * takes the later date, as one line is one thing to pack. The count is never
 * shown to a customer.
 */

/** Days added when an order is bigger than what is held. */
export const RESTOCK_EXTRA_DAYS = 1;

/** Whether this many packs can go out of what is held. A nonsense count
 *  reads as none held — a later promise is one we can always beat. */
export function fromShelf(units: number, stockPacks: number): boolean {
  const held = Number.isFinite(stockPacks) && stockPacks > 0 ? Math.floor(stockPacks) : 0;
  return Number.isFinite(units) && units <= held;
}

export function heldReadyDate(units: number, stockPacks: number, now: Date = new Date()): Date {
  return fromShelf(units, stockPacks) ? nextDay(now) : daysFromToday(1 + RESTOCK_EXTRA_DAYS, now);
}

/** The count admin accepts: a whole number of packs, zero or more. */
export function isValidStockPacks(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
