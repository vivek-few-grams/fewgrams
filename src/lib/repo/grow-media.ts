import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import { GrowMediumEntity } from "@/lib/db/entities";
import type { GrowMedium } from "@/lib/types";
import { marginOf, retailPrice } from "@/lib/pricing/margin";
import type { ItemCost } from "@/lib/purchases/cost";

type Row = EntityItem<typeof GrowMediumEntity>;

/** A stored row, with no stock count before 25 Sep 2026 read as none held.
 *  The retired `leadDays` is dropped here. */
function fromRow({ leadDays: _retired, stockPacks, ...r }: Row): GrowMedium {
  void _retired;
  return { ...r, stockPacks: stockPacks ?? 0 };
}

/**
 * Grow media repository — the operational record only (SPEC §24).
 *
 * The same four access patterns as `repo/trays.ts`, for the same reason: a
 * block of coir is sold exactly as a tray is. **No text** — the name, the one
 * line, the spec table and the how-to live in
 * `content/grow-media/<contentKey>.json` (src/lib/content/grow-media.ts).
 * Stock moves as a tray's does — bills add, orders take, a stocktake sets.
 */

/** Every grow medium, ordered by content key — GSI1's sort key. */
export async function listGrowMedia(opts: { activeOnly?: boolean } = {}): Promise<GrowMedium[]> {
  const { data } = await GrowMediumEntity.query.byCatalogue({}).go(LIST_OPTS);
  const rows = data.map(fromRow);
  return opts.activeOnly ? rows.filter((m) => m.active) : rows;
}

/** A Query on GSI1 rather than a Scan — `contentKey` is the index's sort key.
 *  Serves the detail page's URL. */
export async function getGrowMediumByKey(contentKey: string): Promise<GrowMedium | null> {
  const { data } = await GrowMediumEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ? fromRow(data[0]) : null;
}

export async function getGrowMedium(id: string): Promise<GrowMedium | null> {
  const { data } = await GrowMediumEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/** Write the whole row — safe, as for a tray: there is no counted figure a
 *  concurrent write could clobber. */
export async function putGrowMedium(m: GrowMedium): Promise<void> {
  await GrowMediumEntity.put(m).go();
}

export async function deleteGrowMedium(id: string): Promise<void> {
  await GrowMediumEntity.delete({ id }).go();
}

/**
 * Take up to `units` packs off the count for a paid order, and return how
 * many were there to take. Never below zero, never a refusal: more than is
 * held still sells, a day later (`heldReadyDate`). Conditional on the figure
 * read, so two orders paid at once cannot both take the same packs.
 */
export async function takeFromStock(contentKey: string, units: number): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await GrowMediumEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
    const row = data[0];
    const held = row?.stockPacks ?? 0;
    if (!row || held <= 0) return 0;
    const take = Math.min(units, held);
    try {
      await GrowMediumEntity.patch({ id: row.id })
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

/**
 * Put `units` packs back — a paid order was cancelled before it left (27 Sep
 * 2026). An atomic `ADD`, so it cannot race `takeFromStock`.
 */
export async function returnToStock(contentKey: string, units: number): Promise<void> {
  const { data } = await GrowMediumEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  const row = data[0];
  if (!row) return;
  await GrowMediumEntity.patch({ id: row.id }).add({ stockPacks: units }).go();
}

/** The fields the row form and the toggle write. */
type Settable = Omit<GrowMedium, "id" | "contentKey" | "stockPacks" | "cost" | "costBill">;

/** Change a row's price, margin, packing or active flag — and clear any of
 *  them named in `remove` — without touching the stock a concurrent order
 *  may be taking, or the cost a bill set. */
export async function patchGrowMedium(
  id: string,
  set: Partial<Settable>,
  remove: ReadonlyArray<keyof Settable> = [],
): Promise<void> {
  const update = GrowMediumEntity.patch({ id }).set(set);
  await (remove.length ? update.remove([...remove]) : update).go();
}

/** A stocktake: the packs counted, written outright. */
export async function setGrowMediumStock(id: string, packs: number): Promise<void> {
  await GrowMediumEntity.patch({ id }).set({ stockPacks: packs }).go();
}

/**
 * Put a bill's cost on a row and price it with **the row's own** margin
 * (`costFromBills`). The first bill keeps the cost from before as
 * `openingCost`, so `null` — no bill names it any more — puts it back; a row
 * added from a bill goes back to unpriced and hidden. `setSeedCost`'s rule.
 */
export async function setGrowMediumCost(contentKey: string, cost: ItemCost | null): Promise<void> {
  const { data } = await GrowMediumEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  const row = data[0];
  if (!row) return;
  if (cost) {
    const opening = !row.costBill && row.cost !== undefined ? { openingCost: row.cost } : {};
    await GrowMediumEntity.patch({ id: row.id })
      .set({
        cost: cost.cost,
        price: retailPrice(cost.cost, marginOf(row)),
        costBill: cost.source,
        ...opening,
      })
      .go();
  } else if (row.costBill) {
    const opening = row.openingCost;
    await (
      opening !== undefined
        ? GrowMediumEntity.patch({ id: row.id }).set({
            cost: opening,
            price: retailPrice(opening, marginOf(row)),
          })
        : GrowMediumEntity.patch({ id: row.id }).set({ price: 0, active: false }).remove(["cost"])
    )
      .remove(["costBill", "openingCost"])
      .go();
  }
}
