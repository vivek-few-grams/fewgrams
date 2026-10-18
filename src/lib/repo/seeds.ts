import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import type { EntityItem } from "electrodb";
import { SeedEntity, SeedSettingsEntity } from "@/lib/db/entities";
import { NO_MARGIN, retailPrice } from "@/lib/pricing/margin";
import type { ItemCost } from "@/lib/purchases/cost";
import type { Margin, Seed } from "@/lib/types";

type Row = EntityItem<typeof SeedEntity>;

/** A stored row as a `Seed`. A row saved between 25 Sep and 3 Oct 2026,
 *  while the unit was 50 g, holds only its per-50 g price — read doubled. */
function fromRow(r: Row): Seed {
  return {
    id: r.id,
    contentKey: r.contentKey,
    pricePer100g: r.pricePer100g ?? (r.pricePer50g ?? 0) * 2,
    ...(r.costPer100g !== undefined ? { costPer100g: r.costPer100g } : {}),
    ...(r.costBill ? { costBill: r.costBill } : {}),
    stockGrams: r.stockGrams,
    active: r.active,
  };
}

/**
 * Seed repository — the operational record only (SPEC §22).
 *
 * The key layout lives in src/lib/db/entities.ts; this file is only the access
 * patterns (SPEC §4). See src/lib/db/client.ts for why every read passes
 * options.
 *
 * **There is no text here**, exactly as with varieties: a seed's name and copy
 * come from `content/seeds/<contentKey>.json` via src/lib/content/seeds.ts
 * (SPEC §4.3). Anything that displays a seed reads both and joins them with
 * `attachSeedContent`.
 *
 * `stockGrams` is the one field here that changes daily rather than monthly.
 * It moves by deltas — a bill adds, an order or a sowing takes
 * (`takeFromShelf`, conditional), a cancellation returns — and is set
 * outright only by a stocktake (`setSeedStock`). Nothing writes it through
 * `putSeed` but the creation of a row.
 */

/** Every seed, ordered by content key — GSI1's sort key, so the order comes
 *  from DynamoDB rather than from a sort here. */
export async function listSeeds(opts: { activeOnly?: boolean } = {}): Promise<Seed[]> {
  const { data } = await SeedEntity.query.byCatalogue({}).go(LIST_OPTS);
  const seeds = data.map(fromRow);
  return opts.activeOnly ? seeds.filter((s) => s.active) : seeds;
}

/**
 * Look a seed up by its content key, which is also its URL segment — this is
 * what `/seeds/[key]` resolves with. A Query on GSI1 rather than a Scan,
 * because `contentKey` is the index's sort key.
 */
export async function getSeedByKey(contentKey: string): Promise<Seed | null> {
  const { data } = await SeedEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ? fromRow(data[0]) : null;
}

export async function getSeed(id: string): Promise<Seed | null> {
  const { data } = await SeedEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/**
 * Write the whole row.
 *
 * Fine for the admin screen, which is one operator setting a figure they have
 * just counted. **Not fine for checkout**, where two concurrent orders must
 * not both pass a stock check and then both write — SPEC §15 calls that out as
 * a thing to verify. Checkout uses `takeFromShelf` instead.
 */
export async function putSeed(s: Seed): Promise<void> {
  /* A put replaces the row, so the retired per-50 g price goes with it. */
  await SeedEntity.put({
    id: s.id,
    contentKey: s.contentKey,
    pricePer100g: s.pricePer100g,
    ...(s.costPer100g !== undefined ? { costPer100g: s.costPer100g } : {}),
    ...(s.costBill ? { costBill: s.costBill } : {}),
    stockGrams: s.stockGrams,
    active: s.active,
  }).go();
}

/** Change a row's price or its active flag without touching the stock a
 *  concurrent order may be taking. */
export async function patchSeed(
  id: string,
  set: Partial<Pick<Seed, "pricePer100g" | "active">>,
): Promise<void> {
  await SeedEntity.patch({ id }).set(set).go();
}

/** A stocktake: the grams counted on the shelf, written outright. */
export async function setSeedStock(id: string, grams: number): Promise<void> {
  await SeedEntity.patch({ id }).set({ stockGrams: grams }).go();
}

/**
 * Put a bill's cost on a seed and price it with the seeds margin
 * (`costFromBills`). The first bill to cost a seed keeps the cost it had
 * before, as `openingCost`, so that `null` — no bill names it any more — can
 * put it back. A seed added from a bill has no cost to go back to, so it goes
 * back to unpriced and hidden, as it was before the bill.
 */
export async function setSeedCost(contentKey: string, cost: ItemCost | null, margin: Margin): Promise<void> {
  const { data } = await SeedEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  const row = data[0];
  if (!row) return;
  if (cost) {
    const opening = !row.costBill && row.costPer100g !== undefined ? { openingCost: row.costPer100g } : {};
    await SeedEntity.patch({ id: row.id })
      .set({
        costPer100g: cost.cost,
        pricePer100g: retailPrice(cost.cost, margin),
        costBill: cost.source,
        ...opening,
      })
      .go();
  } else if (row.costBill) {
    const opening = row.openingCost;
    await (
      opening !== undefined
        ? SeedEntity.patch({ id: row.id }).set({
            costPer100g: opening,
            pricePer100g: retailPrice(opening, margin),
          })
        : SeedEntity.patch({ id: row.id }).set({ pricePer100g: 0, active: false }).remove(["costPer100g"])
    )
      .remove(["costBill", "openingCost"])
      .go();
  }
}

/**
 * Take up to `grams` off the shelf for a paid order, and return how much was
 * actually there to take.
 *
 * Never below zero. Checkout refuses more than the shelf holds (SPEC §22.2),
 * so a shortfall here means two orders for the last of a seed were paid at
 * once; the caller logs it. Conditional on
 * the figure read, so two orders paid at once cannot both take the same
 * grams; the loser re-reads and takes from what is left.
 */
export async function takeFromShelf(contentKey: string, grams: number): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const seed = await getSeedByKey(contentKey);
    if (!seed || seed.stockGrams <= 0) return 0;
    const take = Math.min(grams, seed.stockGrams);
    try {
      await SeedEntity.patch({ id: seed.id })
        .set({ stockGrams: seed.stockGrams - take })
        .where(({ stockGrams }, { eq }) => eq(stockGrams, seed.stockGrams))
        .go();
      return take;
    } catch (e) {
      if (!isConditionFailure(e)) throw e;
    }
  }
  throw new Error(`Seed stock for ${contentKey} kept changing; gave up after 5 attempts`);
}

export async function deleteSeed(id: string): Promise<void> {
  await SeedEntity.delete({ id }).go();
}

/**
 * Put `grams` back on the shelf — a paid order was cancelled before it left
 * (27 Sep 2026). An atomic `ADD`, so it cannot race `takeFromShelf`. A seed
 * whose row has since been deleted is skipped: there is no shelf to return to.
 */
export async function returnToShelf(contentKey: string, grams: number): Promise<void> {
  const seed = await getSeedByKey(contentKey);
  if (!seed) return;
  await SeedEntity.patch({ id: seed.id }).add({ stockGrams: grams }).go();
}

/** The seeds margin — `NO_MARGIN` (cost, to the rupee) until one is saved, so
 *  a cost never prices at a markup nobody chose. */
export async function getSeedMargin(): Promise<Margin> {
  const { data } = await SeedSettingsEntity.get({}).go(READ_OPTS);
  return data ? { markupPercent: data.markupPercent, roundUpToNearest: data.roundUpToNearest } : NO_MARGIN;
}

export async function putSeedMargin(m: Margin): Promise<void> {
  await SeedSettingsEntity.put(m).go();
}
