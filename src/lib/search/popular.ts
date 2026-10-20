import { parseRackCartKey } from "@/lib/racks/cart-key";
import { rankBySales } from "@/lib/seeds/best-sellers";
import { entryId, type SearchEntry } from "./entry";
import { SEARCH_KINDS, type SearchKind } from "./match";

/**
 * What the header box shows before anything is typed — SPEC §27.2.
 *
 * Pure, so the ranking can be tested without an order table: the route reads
 * the counts (`ordersPerProductSold`) and hands them in.
 */

/** Tiles in each row: two rows of three on a phone, one row of six from
 *  `md`. */
export const POPULAR_COUNT = 6;

/** Placeholder names cycled by the typewriter. */
const EXAMPLE_COUNT = 8;

/** A name longer than this is cut off in a phone's search field, so it is not
 *  offered as a placeholder ("Horti-Coir cocopeat — 5 kg block"). */
const EXAMPLE_MAX_LETTERS = 20;

/**
 * The entries one of each kind at a time, in `SEARCH_KINDS` order — a
 * microgreen, a seed, a tray, a block, a rack, then the next microgreen. The
 * order shown when nothing has sold, so an empty shop still shows its range
 * rather than six varieties.
 */
function roundRobin(entries: SearchEntry[]): SearchEntry[] {
  const byKind = SEARCH_KINDS.map((kind) => entries.filter((e) => e.kind === kind));
  const out: SearchEntry[] = [];
  for (let i = 0; byKind.some((list) => i < list.length); i++) {
    for (const list of byKind) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/**
 * The most-ordered products, best first, by the number of paid orders that
 * included them; a tie, or no sales at all, falls back to `roundRobin` order.
 * `ranked` says whether any of them has sold, so the row can be titled
 * "Most ordered" only when that is true.
 *
 * **Plans are left out**: a subscription is not an order line, so it has no
 * count, and the plans already lead the home page. **So are seeds**, which
 * have a row of their own beneath (`pickTopSeeds`) — in both, a seed would
 * show twice. A rack is counted by its
 * range, the entry search has for it — an order holding two racks of one
 * range counts twice, which is close enough for a shop's own ranking.
 */
export function pickPopular(
  entries: SearchEntry[],
  ordersPerProduct: Readonly<Record<string, number>>,
  limit = POPULAR_COUNT,
): { ids: string[]; ranked: boolean } {
  const counts = new Map<string, number>();
  for (const [line, n] of Object.entries(ordersPerProduct)) {
    const split = line.indexOf(":");
    const kind = line.slice(0, split) as SearchKind;
    const lineKey = line.slice(split + 1);
    /* A rack line is keyed by its SKU and colour; search knows it by range. */
    const key = kind === "rack" ? parseRackCartKey(lineKey)?.range : lineKey;
    if (!key) continue;
    const id = entryId({ kind, key });
    counts.set(id, (counts.get(id) ?? 0) + n);
  }

  const picked = roundRobin(entries.filter((e) => e.kind !== "plan" && e.kind !== "seed"))
    .map((entry, i) => ({ id: entryId(entry), i, n: counts.get(entryId(entry)) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, limit);
  return { ids: picked.map((p) => p.id), ranked: picked.some((p) => p.n > 0) };
}

/**
 * The box's seed row (the owner, 20 Oct 2026: "top 6 seeds under Most
 * ordered"), ranked exactly as the home page's seed strip is — grams sold,
 * then the `/seeds` grid's own order, by name in the visitor's alphabet — so
 * the two never disagree about which seeds are the best sellers.
 */
export function pickTopSeeds(
  entries: SearchEntry[],
  seedGrams: Readonly<Record<string, number>>,
  locale: string,
  limit = POPULAR_COUNT,
): { ids: string[]; ranked: boolean } {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  const shelf = entries
    .filter((e) => e.kind === "seed")
    .sort((a, b) => collator.compare(a.name, b.name))
    .map((entry) => ({ contentKey: entry.key, entry }));
  const top = rankBySales(shelf, seedGrams, limit);
  return {
    ids: top.map((s) => entryId(s.entry)),
    ranked: top.some((s) => (seedGrams[s.contentKey] ?? 0) > 0),
  };
}

/** Names for the typewriter placeholder, one kind at a time, short enough to
 *  fit a phone's field. In the visitor's language, as the entries are. */
export function pickExamples(entries: SearchEntry[]): string[] {
  return roundRobin(entries)
    .map((e) => e.name)
    .filter((name) => Array.from(name).length <= EXAMPLE_MAX_LETTERS)
    .slice(0, EXAMPLE_COUNT);
}
