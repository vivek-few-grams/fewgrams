import { MAX_LEAD_DAYS, daysFromToday } from "@/lib/delivery-date";

/**
 * How long a rack takes to reach a customer — SPEC §19.8.
 *
 * The owner's instruction, 17 Sep 2026:
 *
 * > *"note that for racks within Bangalore location, the delivery timeline is
 * > three days"*
 *
 * **One figure for every rack, in a constant rather than on the row**, which is
 * the opposite of trays (§23.1) and worth stating because the two look alike
 * from a distance.
 *
 * A tray's `leadDays` is per row because the three launch items already come
 * from two different suppliers, and a fourth item could come from a third. A
 * rack has no supplier: it is **assembled to order from a component rate card**
 * (§19), so the three days are our own build-and-deliver time, not somebody
 * else's dispatch. Every rack of every range goes through the same bench, so
 * there is nothing for a per-model field to vary. If a range ever gets its own
 * timeline, that is the moment to move this onto the model — not before.
 *
 * ## "Within Bangalore" is the whole scope of the promise, and it is not a
 * ## condition this module checks
 *
 * Fewgrams delivers to serviceable Bengaluru PIN codes and refuses everything
 * else at checkout (SPEC §7). So "within Bangalore" is not a qualifier on the
 * three days — it is the only place an order can be delivered at all, and the
 * PIN gate is what enforces it. Repeating the condition in the customer copy
 * would imply a second, slower option that does not exist.
 *
 * The one place it does belong is the note under the rack range cards, because
 * a buyer reading "three days" about a made-to-order steel rack will reasonably
 * wonder whether that is a city figure or a national one.
 */

/**
 * Days from order to delivery, for every rack. Our own build time.
 *
 * Not bounded by a min and a max the way `TRAY_MIN_LEAD_DAYS` is: there is no
 * operator typing this in, so there is no figure to validate and nothing to
 * refuse. It changes here or not at all.
 */
export const RACK_LEAD_DAYS = 3;

/**
 * Guard rather than a rule: `daysFromToday` clamps to `MAX_LEAD_DAYS`, so a
 * constant raised past it would silently print a nearer date than it claims.
 * Three is comfortably inside fourteen; this exists so that raising the
 * constant fails loudly instead.
 */
if (RACK_LEAD_DAYS > MAX_LEAD_DAYS) {
  throw new Error(
    `RACK_LEAD_DAYS (${RACK_LEAD_DAYS}) exceeds MAX_LEAD_DAYS (${MAX_LEAD_DAYS}), ` +
      "which daysFromToday would clamp — raise both together.",
  );
}

/**
 * When a rack ordered now would arrive.
 *
 * Day-granular in IST like every other date in the app, so the hour someone
 * orders cannot move the promise.
 *
 * Takes **no quantity and no model**, unlike `seedReadyDate` and
 * `trayReadyDate` respectively: two racks are one build and one delivery, and
 * every range is built on the same bench.
 */
export function rackReadyDate(now: Date = new Date()): Date {
  return daysFromToday(RACK_LEAD_DAYS, now);
}
