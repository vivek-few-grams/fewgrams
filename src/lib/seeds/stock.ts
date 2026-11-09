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
 * | under 100 g | nothing — **sold out** |
 * | 100 g or more | 100 g steps, up to what is held (and the per-line cap) |
 *
 * The step was 50 g from 25 Sep to 3 Oct 2026; the owner moved it back to
 * 100 g: *"seeds should be always purchasable in 100 gm qty"*.
 *
 * Every seed order goes out **next day**, off our shelf. There is no vendor
 * route and no ten-day promise any more; `SeedSourcing` survives only because
 * orders placed before the change carry it.
 *
 * ## The minimum and the cart unit are the same 100 g
 *
 * The cart counts a seed in 100 g units (`GRAMS_PER_UNIT`), so one unit is the
 * minimum and "at least one unit" already enforces it everywhere a quantity is
 * read. `stock.test.ts` asserts the two are equal: if a minimum ever differs
 * from the unit, the cart has to learn a per-line minimum first.
 *
 * The grams held are still never shown to a customer — a sold-out badge, and
 * a stepper that stops, say all a customer needs.
 */

/** The smallest quantity of one seed that can be ordered, in grams. */
export const SEED_MIN_ORDER_GRAMS = 100;

/** Where a seed line came from. Always `shelf` from 25 Sep 2026; `vendor` is
 *  on orders placed while seed could be bought in. */
export type SeedSourcing = "shelf" | "vendor";

/**
 * How many 100 g units of a seed can be ordered from this much on the shelf:
 * whole units only, never below zero, never past the per-line cap. A
 * nonsense stock figure reads as none — refusing an order we could have
 * filled costs less than selling seed we do not have.
 */
export function seedMaxUnits(stockGrams: number): number {
  if (!Number.isFinite(stockGrams) || stockGrams <= 0) return 0;
  return Math.min(Math.floor(roundGrams(stockGrams) / GRAMS_PER_UNIT), MAX_UNITS_PER_LINE);
}

/**
 * A gram figure to the hundredth. Sowings are typed in decimals (12.5 g), and
 * subtracting them in floating point drifts: 200 − 0.3 − 99.7 is
 * 99.99999999999999, which floored to no 100 g pack and showed a seed sold
 * out with "100 g" on the admin screen beside it (found 8 Nov 2026). Every
 * figure computed from the shelf is rounded here before it is stored or
 * compared, and figures already stored with the drift read correctly.
 */
export function roundGrams(grams: number): number {
  return Math.round(grams * 100) / 100;
}

/** Under one 100 g unit on the shelf. */
export function seedSoldOut(stockGrams: number): boolean {
  return seedMaxUnits(stockGrams) === 0;
}

/**
 * The day a seed line is ready to ship: next day, off our shelf. Not the day
 * it arrives — the courier's days are added at checkout (31 Oct 2026).
 * Day-granular in IST, like every other date on the site (`delivery-date.ts`).
 */
export function seedReadyDate(now: Date = new Date()): Date {
  return nextDay(now);
}

/**
 * Whole 100 g packs on the shelf — the admin table's derived column. Rounds
 * down: 250 g is two packs, and the odd 50 g cannot fill one.
 */
export function shelfPacks(stockGrams: number): number {
  if (!Number.isFinite(stockGrams) || stockGrams <= 0) return 0;
  return Math.floor(roundGrams(stockGrams) / SEED_MIN_ORDER_GRAMS);
}
