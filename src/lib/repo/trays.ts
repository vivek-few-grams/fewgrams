import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import { TrayEntity } from "@/lib/db/entities";
import type { Tray } from "@/lib/types";

type Row = EntityItem<typeof TrayEntity>;

/** A stored row, with no stock count before 25 Sep 2026 read as none held.
 *  The retired `leadDays` is dropped here. */
function fromRow({ leadDays: _retired, stockPacks, ...r }: Row): Tray {
  void _retired;
  return { ...r, stockPacks: stockPacks ?? 0 };
}

/**
 * Tray and drainage repository — the operational record only (SPEC §23).
 *
 * The key layout lives in src/lib/db/entities.ts; this file is only the access
 * patterns (SPEC §4). See src/lib/db/client.ts for why every read passes
 * options.
 *
 * **There is no text here**, exactly as with varieties and seeds: a tray's
 * name, its one-line description and its spec table come from
 * `content/trays/<contentKey>.json` via src/lib/content/trays.ts (SPEC §4.3).
 * Anything that displays a tray reads both and joins them with
 * `attachTrayContent`.
 *
 * **No stock function, and there will not be one.** Nothing in this category
 * is held — every order is placed with the supplier when it comes in (SPEC
 * §23.1) — so there is no figure to decrement and no conditional write to get
 * right at checkout. That is the one way this is simpler than seeds.
 */

/** Every tray, ordered by content key — GSI1's sort key, so the order comes
 *  from DynamoDB rather than from a sort here. */
export async function listTrays(
  opts: { activeOnly?: boolean } = {},
): Promise<Tray[]> {
  const { data } = await TrayEntity.query.byCatalogue({}).go(LIST_OPTS);
  const rows = data.map(fromRow);
  return opts.activeOnly ? rows.filter((t) => t.active) : rows;
}

/** A Query on GSI1 rather than a Scan, because `contentKey` is the index's
 *  sort key. There is no `/shop/trays/[key]` page yet, so nothing calls this
 *  for a URL — it exists for the uniqueness check in `addTray`. */
export async function getTrayByKey(contentKey: string): Promise<Tray | null> {
  const { data } = await TrayEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ? fromRow(data[0]) : null;
}

export async function getTray(id: string): Promise<Tray | null> {
  const { data } = await TrayEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/** Write the whole row. Safe here in a way `putSeed` is not: there is no
 *  counted figure on a tray that a concurrent write could clobber. */
export async function putTray(t: Tray): Promise<void> {
  await TrayEntity.put(t).go();
}

export async function deleteTray(id: string): Promise<void> {
  await TrayEntity.delete({ id }).go();
}

/**
 * Take up to `units` packs off the count for a paid order, and return how
 * many were there to take. Never below zero, never a refusal: more than is
 * held still sells, a day later (`heldReadyDate`). Conditional on the figure
 * read, so two orders paid at once cannot both take the same packs.
 */
export async function takeFromStock(contentKey: string, units: number): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await TrayEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
    const row = data[0];
    const held = row?.stockPacks ?? 0;
    if (!row || held <= 0) return 0;
    const take = Math.min(units, held);
    try {
      await TrayEntity.patch({ id: row.id })
        .set({ stockPacks: held - take })
        .where(({ stockPacks }, { eq }) => eq(stockPacks, held))
        .go();
      return take;
    } catch (e) {
      if (!isConditionFailure(e)) throw e;
    }
  }
  throw new Error(`Stock for ${contentKey} kept changing; gave up after 5 attempts`);
}
