import type { CartKind } from "@/lib/cart/cart";
import { rackRangeOfKey } from "@/lib/racks/cart-key";

/**
 * Where each thing in an order ships from — SPEC §7 (the owner, 25 Sep 2026).
 *
 * **Everything from our Bengaluru pickup, except shelf racks, which always
 * ship from their vendor.** A live test that day settled it: once the stock is
 * held here, one box from our pickup beats a vendor parcel for trays, grow
 * media and the other racks, while the shelf-rack maker hands its racks
 * straight to the courier. The vendor's address is set on admin → racks.
 */

/** The owner's own pickup. */
export const HOME_ORIGIN = "home";

/** The one item with a vendor pickup — shelf racks, as a range. The key the
 *  vendor is stored under on the settings row. */
export const SHELF_RACK_ITEM = "rack:shelf";

/**
 * The pickup id this line ships from: the shelf-rack vendor for a shelf rack,
 * our pickup for everything else. A shelf rack whose vendor has not been set
 * ships from ours, so an unset vendor never blocks an order.
 */
export function lineOrigin(line: { kind: CartKind; key: string }, vendorOf: Readonly<Record<string, string>>): string {
  if (line.kind === "rack" && rackRangeOfKey(line.key) === "shelf") return vendorOf[SHELF_RACK_ITEM] ?? HOME_ORIGIN;
  return HOME_ORIGIN;
}

/**
 * The order split into shipments, one per pickup. With greens in the order,
 * the `home` shipment is the own run and carries the greens and everything
 * else from home; every other pickup is a courier parcel. Without greens,
 * every shipment — `home` included — is a courier parcel.
 *
 * Own run first, then `home`, then the others in the order their lines first
 * appear, so a cart always lists its parcels the same way.
 */
export function splitShipments<L extends { kind: CartKind; key: string }>(
  lines: readonly L[],
  originOf: (line: L) => string,
): { origin: string; ownRun: boolean; lines: L[] }[] {
  const greens = lines.some((l) => l.kind === "variety");
  const byOrigin = new Map<string, L[]>();
  for (const l of lines) {
    const origin = originOf(l);
    byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), l]);
  }
  return [...byOrigin]
    .map(([origin, ls]) => ({ origin, ownRun: greens && origin === HOME_ORIGIN, lines: ls }))
    .sort((a, b) => Number(b.origin === HOME_ORIGIN) - Number(a.origin === HOME_ORIGIN));
}
