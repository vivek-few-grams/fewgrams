import { GRAMS_PER_UNIT, MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { nextDay } from "@/lib/delivery-date";

/**
 * Seed stock — SPEC §22.2. Pure, and deliberately tiny.
 *
 * ## The shelf is the limit (the owner, 25 Sep 2026)
 *
 * From 17 to 25 Sep 2026 a seed could be ordered in any quantity: up to the
 * shelf went next day, beyond it was bought in from the vendor within ten
 * days. The owner reversed that:
 *
 * > *"if its beyond my inventory, it will say sold out, if its fully 0 or
 * > dont allow to enter more than allowed and minimum order qty can be 50
 * > gms."*
 *
 * So:
 *
 * | Shelf | Customer can order |
 * |---|---|
 * | under 50 g | nothing — **sold out** |
 * | 50 g or more | 50 g steps, up to what is held (and the per-line cap) |
 *
 * Every seed order goes out **next day**, off our shelf. There is no vendor
 * route and no ten-day promise any more; `SeedSourcing` survives only because
 * orders placed before the change carry it.
 *
 * ## The minimum and the cart unit are the same 50 g
 *
 * The cart counts a seed in 50 g units (`GRAMS_PER_UNIT`), so one unit is the
 * minimum and "at least one unit" already enforces it everywhere a quantity is
 * read. `stock.test.ts` asserts the two are equal: if a minimum ever differs
 * from the unit, the cart has to learn a per-line minimum first.
 *
 * The grams held are still never shown to a customer — a sold-out badge, and
 * a stepper that stops, say all a customer needs.
 */

/** The smallest quantity of one seed that can be ordered, in grams. */
export const SEED_MIN_ORDER_GRAMS = 50;

/** Where a seed line came from. Always `shelf` from 25 Sep 2026; `vendor` is
 *  on orders placed while seed could be bought in. */
export type SeedSourcing = "shelf" | "vendor";

/**
 * How many 50 g units of a seed can be ordered from this much on the shelf:
 * whole units only, never below zero, never past the per-line cap. A
 * nonsense stock figure reads as none — refusing an order we could have
 * filled costs less than selling seed we do not have.
 */
export function seedMaxUnits(stockGrams: number): number {
  if (!Number.isFinite(stockGrams) || stockGrams <= 0) return 0;
  return Math.min(Math.floor(stockGrams / GRAMS_PER_UNIT), MAX_UNITS_PER_LINE);
}

/** Under one 50 g unit on the shelf. */
export function seedSoldOut(stockGrams: number): boolean {
  return seedMaxUnits(stockGrams) === 0;
}

/**
 * The day a seed line reaches the customer: next day, off our shelf.
 * Day-granular in IST, like every other date on the site (`delivery-date.ts`).
 */
export function seedReadyDate(now: Date = new Date()): Date {
  return nextDay(now);
}

/**
 * Whole 50 g packs on the shelf — the admin table's derived column. Rounds
 * down: 120 g is two packs, and the odd 20 g cannot fill one.
 */
export function shelfPacks(stockGrams: number): number {
  if (!Number.isFinite(stockGrams) || stockGrams <= 0) return 0;
  return Math.floor(stockGrams / SEED_MIN_ORDER_GRAMS);
}
