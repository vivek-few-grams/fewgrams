import { listSeeds } from "@/lib/repo/seeds";
import { listSowings } from "@/lib/repo/sowings";
import { getVarietyCosting, listVarieties, setVarietyPrice } from "@/lib/repo/varieties";
import { loggedGrowth } from "@/lib/sowing/sowing";
import type { Seed, Sowing, Variety, VarietyCosting } from "@/lib/types";
import { varietyPrice } from "./pricing";

/**
 * What the caller has just written, to price from in place of a fresh read.
 *
 * Every caller writes and then reprices straight away, and the lists come off
 * GSI1, which DynamoDB keeps **eventually** consistent — a Query a moment
 * after a write can still return the row from before it. DynamoDB Local
 * answers from one copy and never shows it, but on AWS a new harvest, a new
 * seed cost or a new variety could be priced from the old figure and stay
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
  /** Sowings just written, whole — a harvest recorded, or its tick taken off.
   *  Replaces the listed sowing of the same id, or joins the list. */
  sowings?: readonly Sowing[];
  /** Sowings just deleted, which the index may still list. */
  removedSowingIds?: readonly string[];
};

/**
 * The listed rows with the overrides laid over them — pure, so the merge is
 * pinned by a test without a database.
 */
export function pricingInputs(
  listed: readonly Variety[],
  seeds: readonly Pick<Seed, "contentKey" | "costPer100g">[],
  overrides: Pick<RepriceOverrides, "varieties" | "seedCosts" | "sowings" | "removedSowingIds"> = {},
  listedSowings: readonly Sowing[] = [],
): { varieties: Variety[]; seedCost: Map<string, number | undefined>; sowings: Sowing[] } {
  const byId = new Map(listed.map((v) => [v.id, v]));
  for (const v of overrides.varieties ?? []) byId.set(v.id, v);
  const seedCost = new Map<string, number | undefined>(seeds.map((s) => [s.contentKey, s.costPer100g]));
  for (const [key, cost] of overrides.seedCosts ?? []) seedCost.set(key, cost);
  const sowings = new Map(listedSowings.map((s) => [s.id, s]));
  for (const s of overrides.sowings ?? []) sowings.set(s.id, s);
  for (const id of overrides.removedSowingIds ?? []) sowings.delete(id);
  return { varieties: [...byId.values()], seedCost, sowings: [...sowings.values()] };
}

/**
 * Work out each variety's price again and write the ones that moved — every
 * variety, or only `keys`.
 *
 * A variety's price has four sources, and each calls this when it changes:
 * the sowing log (a harvest, its tick, a sowing deleted — admin → sowing),
 * the costing (admin → varieties), its seed's cost (a purchase bill through
 * `costFromBills`, or a deleted seed), and its own row. The caller passes
 * what it just wrote (`RepriceOverrides`); everything else is read fresh, so
 * the order of saves never matters.
 */
export async function repriceVarieties(
  keys?: Iterable<string>,
  overrides: RepriceOverrides = {},
): Promise<void> {
  const only = keys ? new Set(keys) : null;
  if (only?.size === 0) return;
  const [listed, seeds, costing, listedSowings] = await Promise.all([
    listVarieties(),
    listSeeds(),
    overrides.costing ?? getVarietyCosting(),
    listSowings(),
  ]);
  const { varieties, seedCost, sowings } = pricingInputs(listed, seeds, overrides, listedSowings);
  const growth = loggedGrowth(sowings);
  await Promise.all(
    varieties
      .filter((v) => !only || only.has(v.contentKey))
      .map((v) => ({ v, next: varietyPrice(growth.get(v.contentKey), seedCost.get(v.contentKey), costing) }))
      .filter(({ v, next }) => next.pricePer100g !== v.pricePer100g || next.costPer100g !== v.costPer100g)
      .map(({ v, next }) => setVarietyPrice(v.id, next)),
  );
}
