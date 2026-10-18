import { setGrowMediumCost } from "@/lib/repo/grow-media";
import { listBills } from "@/lib/repo/purchases";
import { getSeedMargin, setSeedCost } from "@/lib/repo/seeds";
import { setTrayCost } from "@/lib/repo/trays";
import type { StockKind } from "./bill";
import { latestCosts, type ItemCost } from "./cost";

/**
 * Re-read the cost of each named stock item (`kind:key`) from the bills and
 * reprice its row — SPEC §26.6. Called after a bill is saved or deleted, with
 * every item on it before and after, because changing one bill's date or
 * deleting it can hand an item's cost to a different bill.
 *
 * Reads every bill rather than only the one saved: "latest" is a question
 * about all of them, and a shop's bills are a single Query.
 */
export async function costFromBills(items: Iterable<string>): Promise<void> {
  const ids = [...new Set(items)];
  if (ids.length === 0) return;
  const [bills, seedMargin] = await Promise.all([listBills(), getSeedMargin()]);
  const costs = latestCosts(bills);
  /* A `Record`, so a fourth stock kind is a type error until it is priced. */
  const SET: Record<StockKind, (key: string, cost: ItemCost | null) => Promise<void>> = {
    seed: (key, cost) => setSeedCost(key, cost, seedMargin),
    tray: setTrayCost,
    media: setGrowMediumCost,
  };
  for (const id of ids) {
    const [kind, key] = id.split(":") as [StockKind, string];
    await SET[kind](key, costs.get(id) ?? null);
  }
}
