import { lineId, type CartKind, type CartLine } from "./cart";

/**
 * What of a cart can go to an address — SPEC §7 (the owner, 26 Sep 2026).
 *
 * Fresh greens (`variety`) travel only on the owner's own run, inside the
 * delivery area; everything else goes by courier anywhere in India. So an
 * address outside the area does not refuse the whole cart: the greens are
 * set aside, shown greyed at checkout as not deliverable there, and the rest
 * is ordered. A cart of greens alone has nothing left, and is refused.
 *
 * The one place the split is decided. The checkout page, the courier scan
 * and `startCheckout` all call it, so what the customer sees greyed is
 * exactly what the order leaves out, and the total they were shown matches
 * the one charged.
 */
export function splitByArea<T extends { kind: CartKind }>(
  lines: readonly T[],
  inArea: boolean,
): { kept: T[]; setAside: T[] } {
  if (inArea) return { kept: [...lines], setAside: [] };
  return {
    kept: lines.filter((l) => l.kind !== "variety"),
    setAside: lines.filter((l) => l.kind === "variety"),
  };
}

/**
 * The cart once an order is paid: every line the order bought comes out, and
 * anything set aside stays for another address or another day. Before this
 * the return route emptied the cart whole, which would have thrown away the
 * greens a customer could not have delivered.
 */
export function cartAfterOrder(
  cart: readonly CartLine[],
  bought: readonly { kind: CartKind; key: string }[],
): CartLine[] {
  const gone = new Set(bought.map(lineId));
  return cart.filter((l) => !gone.has(lineId(l)));
}
