import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import type { EntityItem } from "electrodb";
import { SeedEntity } from "@/lib/db/entities";
import type { Seed } from "@/lib/types";

type Row = EntityItem<typeof SeedEntity>;

/** A stored row as a `Seed`. A row saved before 25 Sep 2026 has only its
 *  per-100 g price, read as half — rounded up, so it never undersells — and
 *  flagged so admin → seeds asks for the real per-50 g figure. */
function fromRow(r: Row): Seed {
  const old = r.pricePer50g === undefined;
  return {
    id: r.id,
    contentKey: r.contentKey,
    pricePer50g: r.pricePer50g ?? Math.ceil((r.pricePer100g ?? 0) / 2),
    ...(old ? { priceFromOld100g: true } : {}),
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
 * `stockGrams` is the one field here that changes daily rather than monthly,
 * and it is written by the admin screen as an absolute figure — what the owner
 * counted — never as a delta. A paid order draws it down through
 * `takeFromShelf`, which is conditional; never through `putSeed`.
 */

/** Every seed, ordered by content key — GSI1's sort key, so the order comes
 *  from DynamoDB rather than from a sort here. */
export async function listSeeds(
  opts: { activeOnly?: boolean } = {},
): Promise<Seed[]> {
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
  /* A put replaces the row, so the retired per-100 g price goes with it. */
  await SeedEntity.put({
    id: s.id,
    contentKey: s.contentKey,
    pricePer50g: s.pricePer50g,
    stockGrams: s.stockGrams,
    active: s.active,
  }).go();
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
