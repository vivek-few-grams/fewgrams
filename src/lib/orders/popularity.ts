/**
 * How many paid orders included each product — the search box's "Most
 * ordered" row (SPEC §27.2).
 *
 * **Orders, not units or grams.** A seed is counted in grams, a tray in packs
 * and a rack singly, and the three do not compare; "how many people bought
 * it" is the same question for every kind. An order with two lines of one
 * product (it cannot happen through the cart, which merges them) counts once.
 *
 * Keyed `kind:key`, never by the key alone — `radish` is a microgreen and a
 * seed, and their sales are not each other's.
 */
export function ordersPerProduct(
  orders: readonly { lines: readonly { kind: string; key: string }[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const order of orders) {
    for (const line of new Set(order.lines.map((l) => `${l.kind}:${l.key}`))) {
      out[line] = (out[line] ?? 0) + 1;
    }
  }
  return out;
}
