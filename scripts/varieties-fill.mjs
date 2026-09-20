/**
 * Adds a placeholder DynamoDB row for every variety that has a content file
 * but no catalogue row yet — SPEC §4.3, §3.1.
 *
 *   node --env-file=.env.local scripts/varieties-fill.mjs         # write
 *   node --env-file=.env.local scripts/varieties-fill.mjs --dry    # preview only
 *
 * **This is a script and not a button**, same reasoning as `racks-fill.mjs`
 * and `seeds-fill.mjs`: adding one variety by hand is the three-field form on
 * /admin/varieties; loading a dozen at once is a data job.
 *
 * **The numbers are dummy on purpose.** The owner's instruction (19 Sep 2026)
 * was *"add dummy prices for now, i will update later"* — real
 * `pricePerTray` / `yieldGramsPerTrayMin` / `yieldGramsPerTrayMax` /
 * `growDays` are business numbers this script cannot know, unlike
 * `seeds-fill.mjs` which has a real supplier price list to work from. The
 * placeholder values below are exactly `AddVarietyForm`'s own default
 * values, so a row this script writes looks identical to what typing nothing
 * into that form and clicking save would produce.
 *
 * **Additive, and it never overwrites — like `racks-fill.mjs`, unlike
 * `seeds-fill.mjs`.** A variety already on sale (real numbers or a dummy row
 * from a prior run) is matched on `contentKey` and skipped outright, so a
 * hand-set price the owner has already corrected in admin can never be
 * silently replaced by a placeholder on a re-run.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Every content key this script can add a row for — read from the folder
 *  rather than hand-listed, so a new content file becomes fillable for free. */
async function contentKeys() {
  const dir = path.join(process.cwd(), "content", "varieties");
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/** `AddVarietyForm`'s own defaults — see src/app/[locale]/admin/varieties/AddVarietyForm.tsx. */
const PLACEHOLDER = {
  growDays: 7,
  yieldGramsPerTrayMin: 250,
  yieldGramsPerTrayMax: 350,
  pricePerTray: 200,
};

function flag(name, fallback = null) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value ?? true;
}

async function main() {
  const dry = flag("dry") !== null;

  const TABLE = `${process.env.DYNAMODB_TABLE_PREFIX ?? "fewgrams"}-catalogue`;
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const ddb = DynamoDBDocument.from(
    new DynamoDBClient({
      region: process.env.DYNAMODB_REGION ?? "ap-south-1",
      ...(endpoint
        ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
        : {}),
    }),
  );

  /* Existing rows, by content key — a Query on GSI1, the same access pattern
     listVarieties() uses, so this script sees exactly what the site sees. */
  const existing = new Set();
  const { Items = [] } = await ddb.query({
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": "VARIETY" },
  });
  for (const item of Items) existing.add(item.contentKey);

  const keys = await contentKeys();
  let added = 0;
  let skipped = 0;

  for (const key of keys) {
    if (existing.has(key)) {
      console.log(`${key.padEnd(16)} skip    already on sale`);
      skipped += 1;
      continue;
    }

    const row = {
      id: randomUUID(),
      contentKey: key,
      ...PLACEHOLDER,
      active: true,
    };

    console.log(
      `${key.padEnd(16)} add     ₹${row.pricePerTray}/tray, ` +
        `${row.yieldGramsPerTrayMin}-${row.yieldGramsPerTrayMax} g/tray, ` +
        `${row.growDays} days — DUMMY, correct in /admin/varieties`,
    );

    if (!dry) {
      await ddb.put({
        TableName: TABLE,
        Item: {
          PK: `VARIETY#${row.id}`,
          SK: "META",
          GSI1PK: "VARIETY",
          GSI1SK: row.contentKey,
          ...row,
          __edb_e__: "variety",
          __edb_v__: "1",
        },
      });
    }
    added += 1;
  }

  console.log(
    `\n${dry ? "would write" : "wrote"} ${added} placeholder variet${added === 1 ? "y" : "ies"}, ` +
      `${skipped} already on sale left untouched.` +
      (added > 0 ? " Every new row needs its real numbers set in /admin/varieties." : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
