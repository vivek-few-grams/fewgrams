import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import type { EntityItem } from "electrodb";
import { VarietyEntity, VarietySettingsEntity } from "@/lib/db/entities";
import { DEFAULT_COSTING } from "@/lib/varieties/pricing";
import type { Variety, VarietyCosting } from "@/lib/types";

type Row = EntityItem<typeof VarietyEntity>;

/**
 * Variety repository — the operational record only.
 *
 * The key layout lives in src/lib/db/entities.ts; this file is only the
 * access patterns (SPEC §4). See src/lib/db/client.ts for why every read
 * passes options.
 *
 * **There is no text here.** A variety's name and copy come from
 * `content/varieties/<contentKey>.json` via src/lib/content/varieties.ts
 * (SPEC §4.3). Anything that needs to display a variety reads both and joins
 * them with `attachContent`.
 *
 * **Nor is there a typed price.** `pricePer100g` and `costPer100g` are written
 * only by `repriceVarieties`, from the costing and the seed's own cost.
 */

/** A stored row as a `Variety`. A row from before 19 Oct 2026 holds a
 *  `pricePerTray` and no `pricePer100g`, and reads as unpriced. */
function fromRow(r: Row): Variety {
  return {
    id: r.id,
    contentKey: r.contentKey,
    pricePer100g: r.pricePer100g ?? 0,
    ...(r.costPer100g !== undefined ? { costPer100g: r.costPer100g } : {}),
    yieldGramsPerTrayMin: r.yieldGramsPerTrayMin,
    yieldGramsPerTrayMax: r.yieldGramsPerTrayMax,
    growDays: r.growDays,
    ...(r.seedGramsPerTray !== undefined ? { seedGramsPerTray: r.seedGramsPerTray } : {}),
    active: r.active,
  };
}

/** Switched on **and** priced. A variety the costing cannot price holds 0 and
 *  is never sold at it, whatever its switch says. */
export function onSale(v: Pick<Variety, "active" | "pricePer100g">): boolean {
  return v.active && v.pricePer100g > 0;
}

/** Every variety; `activeOnly` keeps those on sale (`onSale`). */
export async function listVarieties(opts: { activeOnly?: boolean } = {}): Promise<Variety[]> {
  const { data } = await VarietyEntity.query.byCatalogue({}).go(LIST_OPTS);
  const rows = data.map(fromRow);
  return opts.activeOnly ? rows.filter(onSale) : rows;
}

/**
 * Look a variety up by its content key, which is also its URL segment — this
 * is what `/microgreens/[key]` resolves with. A Query on GSI1 rather than a
 * Scan, because `contentKey` is the index's sort key.
 */
export async function getVarietyByKey(contentKey: string): Promise<Variety | null> {
  const { data } = await VarietyEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ? fromRow(data[0]) : null;
}

export async function getVariety(id: string): Promise<Variety | null> {
  const { data } = await VarietyEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/** The whole row — the admin screen's save. Its price is set straight after,
 *  by `repriceVarieties`. */
export async function putVariety(v: Variety): Promise<void> {
  await VarietyEntity.put(v).go();
}

/** Only the switch, so it cannot carry a stale price back over a fresh one. */
export async function setVarietyActive(id: string, active: boolean): Promise<void> {
  await VarietyEntity.patch({ id }).set({ active }).go();
}

/** A worked-out price — `repriceVarieties` only. No cost means unpriced. */
export async function setVarietyPrice(id: string, price: { pricePer100g: number; costPer100g?: number }) {
  const patch = VarietyEntity.patch({ id }).set({ pricePer100g: price.pricePer100g });
  await (
    price.costPer100g === undefined
      ? patch.remove(["costPer100g"])
      : patch.set({ costPer100g: price.costPer100g })
  ).go();
}

export async function deleteVariety(id: string): Promise<void> {
  await VarietyEntity.delete({ id }).go();
}

/** The microgreens costing — the owner's figures (`DEFAULT_COSTING`) until one
 *  is saved, with no margin, so nothing sells at a markup nobody chose. */
export async function getVarietyCosting(): Promise<VarietyCosting> {
  const { data } = await VarietySettingsEntity.get({}).go(READ_OPTS);
  if (!data) return DEFAULT_COSTING;
  return {
    cocopeatBlockCost: data.cocopeatBlockCost,
    traysPerBlock: data.traysPerBlock,
    overheadPerTray: data.overheadPerTray,
    margin: { markupPercent: data.markupPercent, roundUpToNearest: data.roundUpToNearest },
  };
}

export async function putVarietyCosting(c: VarietyCosting): Promise<void> {
  await VarietySettingsEntity.put({
    cocopeatBlockCost: c.cocopeatBlockCost,
    traysPerBlock: c.traysPerBlock,
    overheadPerTray: c.overheadPerTray,
    markupPercent: c.margin.markupPercent,
    roundUpToNearest: c.margin.roundUpToNearest,
  }).go();
}
