import { listSeeds } from "@/lib/repo/seeds";
import { getVarietyCosting, listVarieties, setVarietyPrice } from "@/lib/repo/varieties";
import type { Seed, Variety, VarietyCosting } from "@/lib/types";
import { varietyPrice } from "./pricing";

/**
 * What the caller has just written, to price from in place of a fresh read.
 *
 * Every caller writes and then reprices straight away, and the lists come off
 * GSI1, which DynamoDB keeps **eventually** consistent — a Query a moment
 * after a write can still return the row from before it. DynamoDB Local
 * answers from one copy and never shows it, but on AWS a new yield, a new
 * seed rate or a new seed cost could be priced from the old figure and stay
 * wrong until the next save. So whatever a caller has just written travels
 * with the call, and the index is only asked about what nobody touched.
 */
export type RepriceOverrides = {
  /** Variety rows just written, whole. Replaces the listed row of the same
   *  id, or joins the list if the index has not shown it yet (a new one). */
  varieties?: readonly Variety[];
  /** Seed cost per 100 g just written, by content key. `undefined` is "no
   *  cost": a seed deleted, or one no bill costs any more. */
  seedCosts?: ReadonlyMap<string, number | undefined>;
  /** The costing just saved. */
  costing?: VarietyCosting;
};

/**
 * The listed rows with the overrides laid over them — pure, so the merge is
 * pinned by a test without a database.
 */
export function pricingInputs(
  listed: readonly Variety[],
  seeds: readonly Pick<Seed, "contentKey" | "costPer100g">[],
  overrides: Pick<RepriceOverrides, "varieties" | "seedCosts"> = {},
): { varieties: Variety[]; seedCost: Map<string, number | undefined> } {
  const byId = new Map(listed.map((v) => [v.id, v]));
  for (const v of overrides.varieties ?? []) byId.set(v.id, v);
  const seedCost = new Map<string, number | undefined>(seeds.map((s) => [s.contentKey, s.costPer100g]));
  for (const [key, cost] of overrides.seedCosts ?? []) seedCost.set(key, cost);
  return { varieties: [...byId.values()], seedCost };
}

/**
 * Work out each variety's price again and write the ones that moved — every
 * variety, or only `keys`.
 *
 * A variety's price has three sources, and each calls this when it changes:
 * its own row (admin → varieties), the costing (the same screen), and its
 * seed's cost — a purchase bill (`costFromBills`) or a deleted seed. The
 * caller passes what it just wrote (`RepriceOverrides`); everything else is
 * read fresh, so the order of saves never matters.
 */
export async function repriceVarieties(
  keys?: Iterable<string>,
  overrides: RepriceOverrides = {},
): Promise<void> {
  const only = keys ? new Set(keys) : null;
  if (only?.size === 0) return;
  const [listed, seeds, costing] = await Promise.all([
    listVarieties(),
    listSeeds(),
    overrides.costing ?? getVarietyCosting(),
  ]);
  const { varieties, seedCost } = pricingInputs(listed, seeds, overrides);
  await Promise.all(
    varieties
      .filter((v) => !only || only.has(v.contentKey))
      .map((v) => ({ v, next: varietyPrice(v, seedCost.get(v.contentKey), costing) }))
      .filter(({ v, next }) => next.pricePer100g !== v.pricePer100g || next.costPer100g !== v.costPer100g)
      .map(({ v, next }) => setVarietyPrice(v.id, next)),
  );
}
