import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { VarietyEntity } from "@/lib/db/entities";
import type { Variety } from "@/lib/types";

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
 */

export async function listVarieties(
  opts: { activeOnly?: boolean } = {},
): Promise<Variety[]> {
  const { data } = await VarietyEntity.query.byCatalogue({}).go(LIST_OPTS);
  return opts.activeOnly ? data.filter((v) => v.active) : data;
}

/**
 * Look a variety up by its content key, which is also its URL segment — this
 * is what `/microgreens/[key]` resolves with. A Query on GSI1 rather than a
 * Scan, because `contentKey` is the index's sort key.
 */
export async function getVarietyByKey(contentKey: string): Promise<Variety | null> {
  const { data } = await VarietyEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ?? null;
}

export async function getVariety(id: string): Promise<Variety | null> {
  const { data } = await VarietyEntity.get({ id }).go(READ_OPTS);
  return data;
}

export async function putVariety(v: Variety): Promise<void> {
  await VarietyEntity.put(v).go();
}

export async function deleteVariety(id: string): Promise<void> {
  await VarietyEntity.delete({ id }).go();
}
