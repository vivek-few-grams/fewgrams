/**
 * Which products a page suggests — SPEC §28.8.
 *
 * Pure, so it is tested without a catalogue. The lists come from
 * `searchCatalogue`, which already holds exactly what the grids show.
 */

/**
 * The `count` items after the one keyed `key`, wrapping round to the start.
 *
 * Each page suggests its own neighbours rather than the same first few, so
 * every product is linked from some other product's page — which is how a
 * crawler reaches it, and how a visitor comes across it. With fewer items
 * than `count` + 1 it is simply all the others.
 */
export function after<T extends { key: string }>(items: T[], key: string, count: number): T[] {
  const at = items.findIndex((item) => item.key === key);
  const rest = at === -1 ? items : [...items.slice(at + 1), ...items.slice(0, at)];
  return rest.slice(0, count);
}

/** The most sold first, by `sold[key]`, keeping the list's own order between
 *  equals — so before anything has sold it is the grid's order. */
export function bestSelling<T extends { key: string }>(
  items: T[],
  sold: Record<string, number>,
  count: number,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (sold[b.item.key] ?? 0) - (sold[a.item.key] ?? 0) || a.index - b.index)
    .slice(0, count)
    .map(({ item }) => item);
}
