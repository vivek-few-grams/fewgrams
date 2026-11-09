import type { OrderStatus } from "@/lib/types";
import { canCancel, type Order } from "./order";
import { restock, stockMoves } from "./stock-moves";

/**
 * Stock that paid orders have already taken off the count but that is still
 * on our premises — paid, being picked, or packed and waiting — keyed
 * `kind:key` (`seed:radish` in grams, `tray:tray-pair` in packs).
 *
 * **Why a stocktake needs it** (8 Nov 2026). Payment takes stock off the count
 * at once, long before the goods leave. Counting the shelf in that gap counts
 * those goods too, and writing the count outright put them back on sale: hold
 * 1 tray pack, sell 3, the count reads −2 ("2 owed"); the owner counts the one
 * pack still packed for that order, saves 1, and the two owed are forgotten
 * while the packed one shows as free. So the pencil asks for everything on
 * the shelf, packed or not, and the stocktake takes this back off
 * (`countedToStored`).
 *
 * An order holds what it recorded taking (`restock`, the same figure a cancel
 * puts back), except the lines in a parcel that already has a tracking number:
 * a booked parcel can be collected while the order still reads "ready for
 * delivery", and by then it is not on the shelf to count.
 */
export function heldForOrders(orders: readonly Order[]): Map<string, number> {
  const held = new Map<string, number>();
  for (const order of orders) {
    if (!canCancel(order.status)) continue;
    const taken = restock(order);
    /* `stockMoves` unpacks lines in order, and `stockTaken` records one entry
       per move in that order, so the i-th entry came from the i-th move's
       line. */
    const from = order.lines.flatMap((line) => stockMoves([line]).map(() => `${line.kind}:${line.key}`));
    taken.forEach((t, i) => {
      const line = from[i];
      const parcel = line ? order.shipments.find((s) => s.lines.includes(line)) : undefined;
      if (parcel?.trackingNumber) return;
      if (t.amount <= 0) return;
      const k = `${t.kind}:${t.key}`;
      held.set(k, (held.get(k) ?? 0) + t.amount);
    });
  }
  return held;
}

/** The statuses whose orders can hold stock on the premises — the ones a
 *  cancel is still allowed from, because the goods have not left. */
export const HOLDING_STATUSES: readonly OrderStatus[] = ["paid", "picked", "ready_for_delivery"];

/**
 * What to store for a stocktake: the count on the shelf less what paid orders
 * there are holding. Packs may go below zero (owed, SPEC §23.1); seed grams
 * never do — a shelf short of its own orders reads zero, as a payment short
 * of the shelf does.
 */
export function countedToStored(counted: number, held: number, unit: "grams" | "packs"): number {
  const stored = counted - held;
  if (unit === "packs") return stored;
  return Math.max(0, Math.round(stored * 100) / 100);
}
