import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import type { EntityItem } from "electrodb";
import { SowingEntity } from "@/lib/db/entities";
import type { Sowing, SowingLine } from "@/lib/types";

type Row = EntityItem<typeof SowingEntity>;

/**
 * Sowing log repository — `/admin/sowing`. Key layout in
 * src/lib/db/entities.ts; reading the form and the yield sums in
 * src/lib/sowing/sowing.ts.
 */

function fromRow(r: Row): Sowing {
  return {
    id: r.id,
    sowDate: r.sowDate,
    lines: r.lines.map((l): SowingLine => ({
      varietyKey: l.varietyKey,
      seedGrams: l.seedGrams,
      ...(l.trays !== undefined ? { trays: l.trays } : {}),
      ...(l.harvestGrams !== undefined ? { harvestGrams: l.harvestGrams } : {}),
      ...(l.harvestedOn !== undefined ? { harvestedOn: l.harvestedOn } : {}),
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Every sowing, newest sow date first. */
export async function listSowings(): Promise<Sowing[]> {
  const { data } = await SowingEntity.query.byDate({}).go({ ...LIST_OPTS, order: "desc" });
  return data.map(fromRow);
}

export async function getSowing(id: string): Promise<Sowing | null> {
  const { data } = await SowingEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/** Write the whole row. A changed sow date moves its GSI1 sort key with it,
 *  because a put rewrites every key. */
export async function putSowing(s: Sowing): Promise<void> {
  await SowingEntity.put(s).go();
}

export async function deleteSowing(id: string): Promise<void> {
  await SowingEntity.delete({ id }).go();
}
