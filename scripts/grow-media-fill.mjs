/**
 * Loads the grow media into DynamoDB from the maker's own store — SPEC §24,
 * §24.6.
 *
 *   node --env-file=.env.local scripts/grow-media-fill.mjs --dry           # preview
 *   node --env-file=.env.local scripts/grow-media-fill.mjs                 # write
 *   node --env-file=.env.local scripts/grow-media-fill.mjs --markup=20     # +20% on the list
 *
 * `trays-fill.mjs` for the grow-media table, and a script rather than a
 * button for the same reason: transcribing a supplier's list is a data job.
 *
 * ## The prices are IFFCO Urban Gardens' own, as listed on 24 Sep 2026
 *
 * Their store showed Horti-Coir at **₹399 for 5 kg and ₹699 for 10 kg**,
 * marked down from an MRP of ₹750 and ₹1,500 as a "limited period offer". The
 * offer price is what a buyer can get from them today, so it is what is
 * loaded — a card priced above the maker's own shop would not sell. **Whether
 * we buy at that price or at a trade price is not settled** (SPEC §24.6); if
 * it is a cost, re-run with `--markup=<percent>`.
 *
 * ## What it does and does not overwrite
 *
 * Matched on `contentKey`. A matching row keeps its `id`, its `active` flag,
 * its lead days **and its packing figures** — the tray script rewrites the
 * whole row and would clear a measured box, which this one must not. Only the
 * price is rewritten every run.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

/**
 * Both pack sizes, with the page each price was read from. `key` names
 * `content/grow-media/<key>.json`; `src/lib/grow-media/script-parity.test.ts`
 * fails if one exists without the other.
 */
export const PRICE_LIST = [
  {
    key: "horti-coir",
    listed: "Horti Coir - Coco Peat Grow Media (Low EC) — 5 kg (SKU COIR05)",
    price: 399,
    leadDays: 7,
    source: "iffcourbangardens.com/products/horti-coir?variant=46830464074016",
  },
  {
    key: "horti-coir-bulk",
    listed: "Horti Coir - Coco Peat Grow Media (Low EC) — 10 kg (SKU COIR010)",
    price: 699,
    leadDays: 7,
    source: "iffcourbangardens.com/products/horti-coir?variant=46922775757088",
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

/** List price → shelf price; a markup rounds up to the rupee. */
export function shelfPrice(listed, markupPercent = 0) {
  return Math.ceil(listed * (1 + markupPercent / 100));
}

function flag(name, fallback = null) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value ?? true;
}

async function main() {
  const dry = flag("dry") !== null;
  const markup = Number(flag("markup", 0));
  if (!Number.isFinite(markup) || markup < 0) {
    throw new Error(`--markup must be a non-negative number, got ${flag("markup")}`);
  }

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

  for (const { key, listed, price, leadDays, source } of PRICE_LIST) {
    const prior = existing.get(key);
    const row = {
      id: prior?.id ?? randomUUID(),
      contentKey: key,
      price: shelfPrice(price, markup),
      /* Kept, not reset: a lead time the owner has corrected on the admin
         screen is better information than the figure this file launched with. */
      leadDays: prior?.leadDays ?? leadDays,
      active: prior?.active ?? true,
      ...Object.fromEntries(
        PACKING.filter((f) => prior?.[f] !== undefined).map((f) => [f, prior[f]]),
      ),
    };

    const change = prior
      ? `update  ₹${prior.price} → ₹${row.price}, ${row.leadDays} days`
      : `add     ₹${row.price}, ${row.leadDays} days`;
    console.log(`${key.padEnd(22)} ${change}   (list: ${listed} @ ₹${price})`);
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

  const note = markup ? ` at +${markup}% markup` : " at the maker's listed prices";
  console.log(
    `\n${dry ? "would write" : "wrote"} ${PRICE_LIST.length} items${note} — ` +
      `${added} new, ${updated} existing (lead days and packing kept)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
