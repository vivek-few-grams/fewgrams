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
    ...(r.seedsTaken ? { seedsTaken: Object.fromEntries(r.seedsTaken.map((t) => [t.key, t.grams])) } : {}),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Every sowing, newest sow date first, and the latest entered first within
 *  a day — the sort key breaks a tie on the random id, which put a sowing
 *  just saved below an older one from the same day. */
export async function listSowings(): Promise<Sowing[]> {
  const { data } = await SowingEntity.query.byDate({}).go({ ...LIST_OPTS, order: "desc" });
  return data
    .map(fromRow)
    .sort((a, b) => b.sowDate.localeCompare(a.sowDate) || b.createdAt.localeCompare(a.createdAt));
}

export async function getSowing(id: string): Promise<Sowing | null> {
  const { data } = await SowingEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/** Write the whole row. A changed sow date moves its GSI1 sort key with it,
 *  because a put rewrites every key. */
export async function putSowing({ seedsTaken, ...s }: Sowing): Promise<void> {
  await SowingEntity.put({
    ...s,
    ...(seedsTaken ? { seedsTaken: Object.entries(seedsTaken).map(([key, grams]) => ({ key, grams })) } : {}),
  }).go();
}

export async function deleteSowing(id: string): Promise<void> {
  await SowingEntity.delete({ id }).go();
}
