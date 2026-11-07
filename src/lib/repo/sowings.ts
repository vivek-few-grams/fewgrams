import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
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

/**
 * Write the whole row. A changed sow date moves its GSI1 sort key with it,
 * because a put rewrites every key.
 *
 * **Conditional on the version read**: `read` is the `updatedAt` the sowing
 * was read at, and the write is refused (false) if it has changed or gone
 * since — or null for a new sowing, refused if the id is taken. A save moves
 * the seed shelf from what it read, so two saves from one read must not both
 * land.
 */
export async function putSowing({ seedsTaken, ...s }: Sowing, read: string | null): Promise<boolean> {
  const row = {
    ...s,
    ...(seedsTaken ? { seedsTaken: Object.entries(seedsTaken).map(([key, grams]) => ({ key, grams })) } : {}),
  };
  try {
    if (read === null) await SowingEntity.create(row).go();
    else
      await SowingEntity.put(row)
        .where(({ updatedAt }, { eq }) => eq(updatedAt, read))
        .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

/** Delete a sowing, conditional on the `updatedAt` it was read at — false
 *  when it has changed or gone since, so its seed goes back once. */
export async function deleteSowing(id: string, read: string): Promise<boolean> {
  try {
    await SowingEntity.delete({ id })
      .where(({ updatedAt }, { eq }) => eq(updatedAt, read))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}
