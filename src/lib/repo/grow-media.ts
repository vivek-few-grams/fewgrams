import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { GrowMediumEntity } from "@/lib/db/entities";
import type { GrowMedium } from "@/lib/types";

/**
 * Grow media repository — the operational record only (SPEC §24).
 *
 * The same four access patterns as `repo/trays.ts`, for the same reason: a
 * block of coir is sold exactly as a tray is. **No text** — the name, the one
 * line, the spec table and the how-to live in
 * `content/grow-media/<contentKey>.json` (src/lib/content/grow-media.ts), and
 * **no stock function**, because nothing in this category is held.
 */

/** Every grow medium, ordered by content key — GSI1's sort key. */
export async function listGrowMedia(
  opts: { activeOnly?: boolean } = {},
): Promise<GrowMedium[]> {
  const { data } = await GrowMediumEntity.query.byCatalogue({}).go(LIST_OPTS);
  return opts.activeOnly ? data.filter((m) => m.active) : data;
}

/** A Query on GSI1 rather than a Scan — `contentKey` is the index's sort key.
 *  Serves the detail page's URL. */
export async function getGrowMediumByKey(contentKey: string): Promise<GrowMedium | null> {
  const { data } = await GrowMediumEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ?? null;
}

export async function getGrowMedium(id: string): Promise<GrowMedium | null> {
  const { data } = await GrowMediumEntity.get({ id }).go(READ_OPTS);
  return data;
}

/** Write the whole row — safe, as for a tray: there is no counted figure a
 *  concurrent write could clobber. */
export async function putGrowMedium(m: GrowMedium): Promise<void> {
  await GrowMediumEntity.put(m).go();
}

export async function deleteGrowMedium(id: string): Promise<void> {
  await GrowMediumEntity.delete({ id }).go();
}
