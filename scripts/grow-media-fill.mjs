/**
 * Loads the grow media into DynamoDB from the maker's own store — SPEC §24,
 * §24.6.
 *
 *   node --env-file=.env.local scripts/grow-media-fill.mjs --dry    # preview
 *   node --env-file=.env.local scripts/grow-media-fill.mjs          # write
 *
 * `trays-fill.mjs` for the grow-media table, and a script rather than a
 * button for the same reason: transcribing a supplier's list is a data job.
 *
 * ## What we pay, from the supplier's quotation of 3 Oct 2026
 *
 * **₹300 for 5 kg and ₹70 for 1 kg** — they no longer stock the 10 kg block.
 * These are our buying costs, written to `cost`; the selling price is worked
 * out from them with **that row's own** markup and rounding, set on the admin
 * screen (one per pack size) — `retailPrice`, the racks' formula.
 * Until 3 Oct this list held IFFCO's retail offer prices (₹399 for 5 kg, ₹699
 * for 10 kg) and wrote them straight to `price`.
 *
 * ## What it does and does not overwrite
 *
 * Matched on `contentKey`. A matching row keeps its `id`, its `active` flag,
 * its stock, its margin **and its packing figures** — the tray script rewrites the
 * whole row and would clear a measured box, which this one must not. Only the
 * cost and the price are rewritten every run.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
/* The one formula, shared with the racks; `racks-fill.mjs` guards its entry
   point, so importing it runs nothing. */
import { retailPrice } from "./racks-fill.mjs";

/**
 * Both pack sizes, with what we pay for each. `key` names
 * `content/grow-media/<key>.json`; `src/lib/grow-media/script-parity.test.ts`
 * fails if one exists without the other.
 */
export const PRICE_LIST = [
  {
    key: "horti-coir",
    listed: "Horti-Coir cocopeat, low EC — 5 kg block",
    cost: 300,
    source: "supplier quotation, 3 Oct 2026",
  },
  {
    key: "horti-coir-small",
    listed: "Horti-Coir cocopeat, low EC — 1 kg block",
    cost: 70,
    source: "supplier quotation, 3 Oct 2026",
  },
];

/** The courier packing figures, carried over from a prior row untouched. */
const PACKING = [
  "packPieces",
  "pieceLengthCm",
  "pieceWidthCm",
  "pieceHeightCm",
  "pieceStackCm",
  "pieceGrams",
];

/** A row's own margin as stored, each half falling back to cost to the
 *  rupee — the admin screen's rule for a blank field. */
export function marginFrom(item) {
  return {
    markupPercent: item?.markupPercent ?? 0,
    roundUpToNearest: item?.roundUpToNearest ?? 1,
  };
}

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
      ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
    }),
  );

  /* Existing rows, by content key — a Query on GSI1, the same access pattern
     `listGrowMedia()` uses, so this script sees exactly what the site sees. */
  const existing = new Map();
  const { Items = [] } = await ddb.query({
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": "MEDIUM" },
  });
  for (const item of Items) existing.set(item.contentKey, item);

  let added = 0;
  let updated = 0;

  for (const { key, listed, cost, source } of PRICE_LIST) {
    const prior = existing.get(key);
    const margin = marginFrom(prior);
    const row = {
      id: prior?.id ?? randomUUID(),
      contentKey: key,
      cost,
      ...(prior?.markupPercent !== undefined ? { markupPercent: prior.markupPercent } : {}),
      ...(prior?.roundUpToNearest !== undefined ? { roundUpToNearest: prior.roundUpToNearest } : {}),
      price: retailPrice(cost, margin),
      /* Kept, not reset: the count is what the owner last typed on admin. */
      stockPacks: prior?.stockPacks ?? 0,
      active: prior?.active ?? true,
      ...Object.fromEntries(PACKING.filter((f) => prior?.[f] !== undefined).map((f) => [f, prior[f]])),
    };

    const change = prior
      ? `update  ₹${prior.price} → ₹${row.price}, ${row.stockPacks} held`
      : `add     ₹${row.price}, ${row.stockPacks} held`;
    console.log(
      `${key.padEnd(22)} ${change}   (${listed}, cost ₹${cost}, ` +
        `${margin.markupPercent}% rounded up to ₹${margin.roundUpToNearest})`,
    );
    console.log(`${" ".repeat(22)}         ${source}`);

    if (!dry) {
      await ddb.put({
        TableName: TABLE,
        Item: {
          PK: `MEDIUM#${row.id}`,
          SK: "META",
          GSI1PK: "MEDIUM",
          GSI1SK: row.contentKey,
          ...row,
          __edb_e__: "growMedium",
          __edb_v__: "1",
        },
      });
    }
    if (prior) updated += 1;
    else added += 1;
  }

  console.log(
    `\n${dry ? "would write" : "wrote"} ${PRICE_LIST.length} items — ` +
      `${added} new, ${updated} existing (stock, margin and packing kept)`,
  );
}

/* Entry point only, as in racks-fill.mjs. The parity test imports this file
   for its price list, and an unguarded call wrote to DynamoDB on import — or,
   in CI with no credentials, exited the test run (10 Oct 2026). */
if (process.argv[1]?.endsWith("grow-media-fill.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
