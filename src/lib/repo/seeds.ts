import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { SeedEntity } from "@/lib/db/entities";
import type { Seed } from "@/lib/types";

/**
 * Seed repository — the operational record only (SPEC §22).
 *
 * The key layout lives in src/lib/db/entities.ts; this file is only the access
 * patterns (SPEC §4). See src/lib/db/client.ts for why every read passes
 * options.
 *
 * **There is no text here**, exactly as with varieties: a seed's name and copy
 * come from `content/seeds/<contentKey>.json` via src/lib/content/seeds.ts
 * (SPEC §4.3). Anything that displays a seed reads both and joins them with
 * `attachSeedContent`.
 *
 * `stockGrams` is the one field here that changes daily rather than monthly,
 * and it is written by the admin screen as an absolute figure — what the owner
 * counted — never as a delta. Decrementing it against a paid order belongs to
 * checkout (SPEC §9), and will need a conditional write rather than a `put`;
 * see `putSeed`.
 */

/** Every seed, ordered by content key — GSI1's sort key, so the order comes
 *  from DynamoDB rather than from a sort here. */
export async function listSeeds(
  opts: { activeOnly?: boolean } = {},
): Promise<Seed[]> {
  const { data } = await SeedEntity.query.byCatalogue({}).go(LIST_OPTS);
  return opts.activeOnly ? data.filter((s) => s.active) : data;
}

/**
 * Look a seed up by its content key, which is also its URL segment — this is
 * what `/seeds/[key]` resolves with. A Query on GSI1 rather than a Scan,
 * because `contentKey` is the index's sort key.
 */
export async function getSeedByKey(contentKey: string): Promise<Seed | null> {
  const { data } = await SeedEntity.query.byCatalogue({ contentKey }).go(LIST_OPTS);
  return data[0] ?? null;
}

export async function getSeed(id: string): Promise<Seed | null> {
  const { data } = await SeedEntity.get({ id }).go(READ_OPTS);
  return data;
}

/**
 * Write the whole row.
 *
 * Fine for the admin screen, which is one operator setting a figure they have
 * just counted. **Not fine for checkout**, where two concurrent orders must
 * not both pass a stock check and then both write — SPEC §15 calls that out as
 * a thing to verify. That path needs an `update` with a
 * `ConditionExpression` on `stockGrams`, and it belongs here as its own
 * function when checkout is built rather than as a flag on this one.
 */
export async function putSeed(s: Seed): Promise<void> {
  await SeedEntity.put(s).go();
}

export async function deleteSeed(id: string): Promise<void> {
  await SeedEntity.delete({ id }).go();
}
