import { setGrowMediumCost } from "@/lib/repo/grow-media";
import { listBills } from "@/lib/repo/purchases";
import { getSeedMargin, setSeedCost } from "@/lib/repo/seeds";
import { setTrayCost } from "@/lib/repo/trays";
import { repriceVarieties } from "@/lib/varieties/reprice";
import type { PurchaseBill, StockKind } from "./bill";
import { latestCosts, type ItemCost } from "./cost";

/**
 * The bill the caller has just written or deleted, to cost from in place of
 * a fresh read.
 *
 * Both callers write the bill and then cost straight away, and `listBills`
 * comes off GSI1, which DynamoDB keeps **eventually** consistent — a Query a
 * moment after a write can still return the list from before it. DynamoDB
 * Local answers from one copy and never shows it, but on AWS a new bill could
 * be missing, a deleted one still listed, or an edited one listed as it was,
 * and the cost worked out from that would stay wrong until the next save. So
 * the bill travels with the call, and the index is only asked about the
 * bills nobody touched — the pattern of `RepriceOverrides` for varieties.
 */
export type CostOverrides = {
  /** The bill just saved, whole. Replaces the listed bill of the same id, or
   *  joins the list if the index has not shown it yet (a new one). */
  written?: PurchaseBill;
  /** The bill just deleted, which the index may still list. */
  deletedId?: string;
};

/**
 * The listed bills with the override laid over them — pure, so the merge is
 * pinned by a test without a database.
 */
export function billsForCost(listed: readonly PurchaseBill[], overrides: CostOverrides = {}): PurchaseBill[] {
  const byId = new Map(listed.map((b) => [b.id, b]));
  if (overrides.written) byId.set(overrides.written.id, overrides.written);
  if (overrides.deletedId) byId.delete(overrides.deletedId);
  return [...byId.values()];
}

/**
 * Re-read the cost of each named stock item (`kind:key`) from the bills and
 * reprice its row — SPEC §26.6. Called after a bill is saved or deleted, with
 * every item on it before and after, because changing one bill's date or
 * deleting it can hand an item's cost to a different bill.
 *
 * Reads every bill rather than only the one saved: "latest" is a question
 * about all of them, and a shop's bills are a single Query. The bill the
 * caller just wrote or deleted is passed in (`CostOverrides`), since that
 * Query may not show it yet.
 */
export async function costFromBills(items: Iterable<string>, overrides: CostOverrides = {}): Promise<void> {
  const ids = [...new Set(items)];
  if (ids.length === 0) return;
  const [listed, seedMargin] = await Promise.all([listBills(), getSeedMargin()]);
  const costs = latestCosts(billsForCost(listed, overrides));
  /* The seed costs just written, so the microgreens below are priced from
     them and not from a list that may not show them yet. */
  const seedCosts = new Map<string, number | undefined>();
  /* A `Record`, so a fourth stock kind is a type error until it is priced. */
  const SET: Record<StockKind, (key: string, cost: ItemCost | null) => Promise<void>> = {
    seed: async (key, cost) => {
      const left = await setSeedCost(key, cost, seedMargin);
      if (left) seedCosts.set(key, left.costPer100g);
    },
    tray: setTrayCost,
    media: setGrowMediumCost,
  };
  const seedKeys: string[] = [];
  for (const id of ids) {
    const [kind, key] = id.split(":") as [StockKind, string];
    await SET[kind](key, costs.get(id) ?? null);
    if (kind === "seed") seedKeys.push(key);
  }
  /* A microgreen of the same key is priced from this seed's cost. */
  await repriceVarieties(seedKeys, { seedCosts });
}
