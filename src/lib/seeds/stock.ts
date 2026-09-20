import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import { daysFromToday, nextDay } from "@/lib/delivery-date";

/**
 * Seed sourcing and dispatch — SPEC §22.2. Pure, and deliberately tiny.
 *
 * ## What changed on 17 Sep 2026, and why the whole module turned inside out
 *
 * This file used to be a **cap**. Stock was the ceiling on what could be
 * ordered, anything under 100 g read as sold out, and the shelf figure was
 * printed on every seed card. The owner replaced that rule:
 *
 * > *"for seeds we don't have to show how much we hold in our inventory in the
 * > customer facing UI we should let them allow to order how much ever they
 * > want but the delivery logic changes if the ordered amount is less than the
 * > amount that we are holding we will deliver on the next day if they are
 * > ordering beyond our capacity then we will order it in the vendor website
 * > and deliver to the customer within 10 days."*
 *
 * So stock stopped being a limit and became a **speed**. Seed is a shelf-stable
 * commodity the business can re-order, which is exactly what makes this
 * possible — you cannot re-order a tray of greens that takes fourteen days to
 * grow, but you can buy another kilo of mustard seed. Nothing is refused; what
 * changes is the date the customer is promised.
 *
 * | Ordered | Source | Promise |
 * |---|---|---|
 * | ≤ grams held | our shelf | **next day** |
 * | > grams held | the vendor | **within {@link SEED_VENDOR_LEAD_DAYS} days** |
 *
 * ## Three consequences worth naming
 *
 * 1. **`stockGrams` is now an internal figure.** It decides a date; it is not
 *    shown, and nothing rounds it to whole packs for display any more. The
 *    admin screen still prints it, because the owner counts it.
 * 2. **"Sold out" no longer exists for a seed.** Zero on the shelf means every
 *    order is a vendor order, not that the seed cannot be bought. Reintroducing
 *    a sold-out state anywhere would contradict the rule above.
 * 3. **The whole line takes the slower date.** Order 500 g of something we
 *    hold 200 g of and all 500 g arrive together from the vendor run. Splitting
 *    it would mean two trips for one line — the same reasoning SPEC §18.6 uses
 *    for a mixed grow-day cart.
 *
 * The 100 g minimum survived the change untouched, and it is still the cart's
 * unit — see the note below.
 *
 * ## The minimum and the cart unit are the same 100 g, and that is load-bearing
 *
 * The cart counts **100 g units** (`GRAMS_PER_UNIT`) because greens are sold
 * by the 100 g. A seed's minimum order is also 100 g, so one unit *is* the
 * minimum and the cart needs no separate concept: "at least one unit" is
 * already enforced everywhere a quantity is read.
 *
 * That is a coincidence of two independent decisions, not an identity, so
 * `stock.test.ts` asserts the two constants are equal. If the owner ever sets
 * a 250 g seed minimum, that test fails and points at the real work —
 * teaching the cart a per-line minimum — rather than letting a 100 g seed
 * order through a control that says 250 g.
 */

/** The smallest quantity of one seed that can be ordered, in grams. */
export const SEED_MIN_ORDER_GRAMS = 100;

/**
 * Days to allow when a seed has to be bought in before it can be sent on.
 *
 * The owner's figure, and it is a **worst case stated as a promise**, not an
 * estimate — "within 10 days". Quoting the vendor's own typical turnaround
 * would leave no room for a slow dispatch, and a seed order that arrives early
 * costs nobody anything.
 */
export const SEED_VENDOR_LEAD_DAYS = 10;

/** Where a given quantity of one seed has to come from. */
export type SeedSourcing = "shelf" | "vendor";

/**
 * Can this much of this seed go out of our own stock, or does it have to be
 * ordered in?
 *
 * **Equal amounts count as the shelf.** Ordering exactly the 200 g we hold is
 * a next-day order: the seed is there, and holding it back a week because the
 * shelf ends up empty would be a promise made worse for no reason.
 *
 * Both arguments are treated defensively, and in opposite directions, because
 * the two mistakes are not symmetrical: a nonsense stock figure resolves to
 * `"vendor"` — a slower promise we can always beat — while `"shelf"` on a
 * seed we do not have is a next-day delivery that cannot happen.
 */
export function seedSourcing(orderedGrams: number, stockGrams: number): SeedSourcing {
  const held = Number.isFinite(stockGrams) && stockGrams > 0 ? Math.floor(stockGrams) : 0;
  const wanted = Number.isFinite(orderedGrams) ? Math.max(Math.ceil(orderedGrams), 0) : Infinity;
  return wanted <= held ? "shelf" : "vendor";
}

/**
 * The day a seed line reaches the customer.
 *
 * Day-granular in IST, like every other date on the site: dispatch is a
 * morning job, so the unit the customer cares about is the day, not the hour
 * they happened to click (see `delivery-date.ts`).
 */
export function seedReadyDate(sourcing: SeedSourcing, now: Date = new Date()): Date {
  return sourcing === "shelf" ? nextDay(now) : daysFromToday(SEED_VENDOR_LEAD_DAYS, now);
}

/**
 * Whole 100 g packs that could go out next day from what is on the shelf.
 *
 * **Operator-facing only** — the admin table's derived column. A customer is
 * never shown this and is never capped by it; it answers "how much of an order
 * can I fill this morning", which is the question the owner has standing at
 * the shelf.
 *
 * Rounds down, so 250 g reads as two packs: the odd 50 g is real seed but it
 * cannot fill a pack on its own.
 */
export function shelfPacks(stockGrams: number): number {
  if (!Number.isFinite(stockGrams) || stockGrams <= 0) return 0;
  return Math.floor(stockGrams / SEED_MIN_ORDER_GRAMS);
}

/** The same figure in grams — `shelfPacks` × 100. Operator-facing. */
export function shelfGrams(stockGrams: number): number {
  return shelfPacks(stockGrams) * GRAMS_PER_UNIT;
}
