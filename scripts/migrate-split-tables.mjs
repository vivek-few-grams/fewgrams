/**
 * One-off migration, 14 Sep 2026: copy rows out of the original single
 * `fewgrams` table into the three tables created by create-tables.mjs
 * (SPEC §4.6).
 *
 *   node --env-file=.env.local scripts/migrate-split-tables.mjs
 *
 * Copies, never moves. The source table is left untouched, so this is safe to
 * re-run and trivial to abandon — drop the new tables and nothing is lost.
 * Delete the source table by hand once you are satisfied.
 *
 * Kept in the repo rather than run ad hoc because it is the only record of
 * which key prefix went where.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

const PREFIX = process.env.DYNAMODB_TABLE_PREFIX ?? "fewgrams";
const SOURCE = process.env.MIGRATE_FROM ?? "fewgrams";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000";

const ddb = DynamoDBDocument.from(
  new DynamoDBClient({
    region: process.env.DYNAMODB_REGION ?? "ap-south-1",
    endpoint: ENDPOINT,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  }),
);

/** Every PK prefix in SPEC §4, and the table it now belongs to. An unmatched
 *  prefix is a hard error rather than a silent skip — a row landing nowhere
 *  is exactly the failure this script exists to avoid. */
const ROUTES = [
  ["USER#", "users"],
  ["VT#", "users"],
  ["VARIETY#", "catalogue"],
  ["PRODUCT#", "catalogue"],
  ["PLAN#", "catalogue"],
  ["PIN#", "catalogue"],
  ["COUPON#", "catalogue"],
  ["CONFIG", "catalogue"],
  ["SUB#", "orders"],
  ["ORDER#", "orders"],
  ["PAYMENT#", "orders"],
  ["CYCLE#", "orders"],
  ["SOWPLAN#", "orders"],
];

const routeFor = (pk) => ROUTES.find(([p]) => pk.startsWith(p))?.[1];

let cursor;
const counts = {};
const unrouted = [];

do {
  const page = await ddb.scan({ TableName: SOURCE, ExclusiveStartKey: cursor });
  for (const item of page.Items ?? []) {
    const group = routeFor(item.PK);
    if (!group) {
      unrouted.push(`${item.PK} / ${item.SK}`);
      continue;
    }
    await ddb.put({ TableName: `${PREFIX}-${group}`, Item: item });
    counts[group] = (counts[group] ?? 0) + 1;
  }
  cursor = page.LastEvaluatedKey;
} while (cursor);

for (const [group, n] of Object.entries(counts)) {
  console.log(`+ ${String(n).padStart(3)} rows → ${PREFIX}-${group}`);
}

if (unrouted.length > 0) {
  console.error(`\n✗ ${unrouted.length} row(s) matched no known prefix:`);
  for (const row of unrouted) console.error(`    ${row}`);
  console.error(`\n  Add the prefix to ROUTES in this script and re-run.`);
  process.exit(1);
}

console.log(`\n✓ copied from "${SOURCE}". Source table left in place.`);
