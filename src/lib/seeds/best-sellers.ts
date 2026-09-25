import type { OrderStatus } from "@/lib/types";

/**
 * Which seeds lead the home page's seed strip (the owner, 25 Sep 2026: "top 5
 * seeds", ranked by what sells).
 *
 * Ranked by **grams sold**, not by order count: one customer buying 500 g of
 * sunflower is more seed than five buying a 50 g packet of basil each, and
 * grams are what the shelf actually loses.
 *
 * Only orders that were paid count. `pending_payment` is an abandoned
 * checkout, `failed` never took money and `refunded` gave it back.
 */
export const SOLD_STATUSES: readonly OrderStatus[] = [
  "paid",
  "picked",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
];

/**
 * The first `limit` of `seeds`, best-selling first. A seed with no sales, and
 * any tie, keeps its place in `seeds` — so the caller passes the list in the
 * order `/seeds` shows it, and a shop with no sales yet shows the first five
 * of the grid rather than an arbitrary five. A sale of a seed not in `seeds`
 * (switched off since, or its content file gone) is ignored.
 */
export function rankBySales<T extends { contentKey: string }>(
  seeds: readonly T[],
  gramsSold: Readonly<Record<string, number>>,
  limit: number,
): T[] {
  return seeds
    .map((seed, i) => ({ seed, i, grams: gramsSold[seed.contentKey] ?? 0 }))
    .sort((a, b) => b.grams - a.grams || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.seed);
}

/** Grams of each seed across the given orders' lines, keyed by content key.
 *  Seed lines only — `content/varieties/radish.json` and
 *  `content/seeds/radish.json` share a key and are different products. */
export function seedGramsByKey(
  orders: readonly { lines: readonly { kind: string; key: string; grams: number | null }[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.kind !== "seed" || l.grams === null) continue;
      out[l.key] = (out[l.key] ?? 0) + l.grams;
    }
  }
  return out;
}
