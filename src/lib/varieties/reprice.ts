import { listSeeds } from "@/lib/repo/seeds";
import { getVarietyCosting, listVarieties, setVarietyPrice } from "@/lib/repo/varieties";
import { varietyPrice } from "./pricing";

/**
 * Work out each variety's price again and write the ones that moved — every
 * variety, or only `keys`.
 *
 * A variety's price has three sources, and each calls this when it changes:
 * its own row (admin → varieties), the costing (the same screen), and its
 * seed's cost — a purchase bill (`costFromBills`) or a deleted seed. Reads
 * all three fresh, so the order of saves never matters.
 */
export async function repriceVarieties(keys?: Iterable<string>): Promise<void> {
  const only = keys ? new Set(keys) : null;
  if (only?.size === 0) return;
  const [varieties, seeds, costing] = await Promise.all([listVarieties(), listSeeds(), getVarietyCosting()]);
  const seedCost = new Map(seeds.map((s) => [s.contentKey, s.costPer100g]));
  await Promise.all(
    varieties
      .filter((v) => !only || only.has(v.contentKey))
      .map((v) => ({ v, next: varietyPrice(v, seedCost.get(v.contentKey), costing) }))
      .filter(({ v, next }) => next.pricePer100g !== v.pricePer100g || next.costPer100g !== v.costPer100g)
      .map(({ v, next }) => setVarietyPrice(v.id, next)),
  );
}
