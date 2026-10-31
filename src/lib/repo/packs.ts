import { LIST_OPTS } from "@/lib/db/client";
import { PackEntity } from "@/lib/db/entities";
import type { Pack } from "@/lib/types";

/**
 * Starter-pack repository — SPEC §29. Key layout in src/lib/db/entities.ts.
 *
 * The one translation here: a pack with no rack or no grow medium is
 * `rackSku: null` / `mediumKey: null` in the domain type and an absent
 * attribute in DynamoDB, as a plan's Build Your Own price is.
 */

type Row = Omit<Pack, "rackSku" | "mediumKey"> & { rackSku?: string; mediumKey?: string };

const toDomain = (p: Row): Pack => ({ ...p, rackSku: p.rackSku ?? null, mediumKey: p.mediumKey ?? null });

/** Every pack, in column order. */
export async function listPacks(opts: { activeOnly?: boolean } = {}): Promise<Pack[]> {
  const { data } = await PackEntity.query.byCatalogue({}).go(LIST_OPTS);
  const all = data.map(toDomain);
  return opts.activeOnly ? all.filter((p) => p.active) : all;
}

export async function putPack(pack: Pack): Promise<void> {
  const { rackSku, mediumKey, ...rest } = pack;
  await PackEntity.put({
    ...rest,
    ...(rackSku !== null && { rackSku }),
    ...(mediumKey !== null && { mediumKey }),
  }).go();
}

export async function deletePack(id: string): Promise<void> {
  await PackEntity.delete({ id }).go();
}
