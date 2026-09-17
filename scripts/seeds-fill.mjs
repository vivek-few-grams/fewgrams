/**
 * Loads the seed shelf into DynamoDB from the owner's supplier price list —
 * SPEC §22.1, §22.2.
 *
 *   node --env-file=.env.local scripts/seeds-fill.mjs --dry           # preview
 *   node --env-file=.env.local scripts/seeds-fill.mjs                 # write
 *   node --env-file=.env.local scripts/seeds-fill.mjs --markup=40     # +40% on the list
 *   node --env-file=.env.local scripts/seeds-fill.mjs --reset-stock   # also set stock
 *
 * **This is a script and not a button**, for the same reason as
 * `racks-fill.mjs`: adding one seed is a three-field form on /admin/seeds, and
 * loading eighteen rows off a PDF is a data job. The owner's instruction on 17
 * Sep 2026 was to keep the admin screens to the minimum controls, with bulk
 * work done directly against the database.
 *
 * ## The price list is per 50 g and the column is per 100 g
 *
 * `Microgreen_Seed_Price_List_50g.pdf` (17 Sep 2026) quotes a 50 g pack.
 * `Seed.pricePer100g` is what the site sells by, because the minimum order is
 * 100 g (SPEC §22.2), so every figure below is **doubled**. That is the only
 * arithmetic in this file and it is linear on purpose — a 100 g pack is two 50
 * g packs, not a discount tier.
 *
 * If the list turns out to be a *cost* rather than a sell price, re-run with
 * `--markup=<percent>`; it is one command, which is why the flag exists rather
 * than eighteen hand edits on the admin screen.
 *
 * ## What it does and does not overwrite
 *
 * A row is matched on `contentKey` — the same key the content file and the URL
 * use. Matching rows keep their `id` and their `active` flag, so a seed
 * withdrawn from sale stays withdrawn across a re-run, and every URL and
 * historical reference survives. The price is rewritten every run, because the
 * list is the source of truth for it.
 *
 * `stockGrams` is **not** touched on an existing row unless `--reset-stock` is
 * passed. Stock is what the owner counted on the shelf, and silently replacing
 * a counted figure with a default from a script is how a shelf starts lying.
 * New rows get `DEFAULT_STOCK_GRAMS`.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

/**
 * The owner's supplier list, verbatim in the third column. The `key` is the
 * content key: it names `content/seeds/<key>.json` and the `/seeds/<key>` URL,
 * so it is kebab-case and it never carries the supplier's word order
 * ("Cabbage Red" is `red-cabbage`, because that is what the URL should read).
 */
export const PRICE_LIST = [
  { key: "alfalfa", listed: "Alfalfa", per50g: 60 },
  { key: "basil", listed: "Basil Green", per50g: 160 },
  { key: "beetroot", listed: "Beet Root Red", per50g: 75 },
  { key: "broccoli", listed: "Broccoli", per50g: 175 },
  { key: "cabbage", listed: "Cabbage", per50g: 170 },
  { key: "dill", listed: "Dill", per50g: 60 },
  { key: "garden-cress", listed: "Garden Cress", per50g: 120 },
  { key: "kale", listed: "Kale", per50g: 115 },
  { key: "mustard", listed: "Mustard", per50g: 20 },
  { key: "pak-choi", listed: "Pak Choi", per50g: 45 },
  { key: "radish", listed: "Radish Pink", per50g: 40 },
  { key: "red-amaranthus", listed: "Red Amaranthus", per50g: 75 },
  { key: "red-cabbage", listed: "Cabbage Red", per50g: 270 },
  { key: "red-onion", listed: "Onion Red", per50g: 75 },
  { key: "rocket", listed: "Rocket Cultivated", per50g: 90 },
  { key: "spinach", listed: "Spinach", per50g: 15 },
  { key: "sunflower", listed: "Sunflower", per50g: 30 },
  { key: "swiss-chard", listed: "Swisschard", per50g: 105 },
];

/** What the owner holds of each seed as of 17 Sep 2026: *"each I have 200 gms"*. */
export const DEFAULT_STOCK_GRAMS = 200;

/**
 * List price → shelf price. Doubles the 50 g figure, applies any markup, and
 * rounds **up** to the rupee so a marked-up price can never land below the
 * figure it was derived from.
 */
export function pricePer100g(per50g, markupPercent = 0) {
  return Math.ceil(per50g * 2 * (1 + markupPercent / 100));
}

function flag(name, fallback = null) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value ?? true;
}

async function main() {
  const dry = flag("dry") !== null;
  const resetStock = flag("reset-stock") !== null;
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
        ? {
            endpoint,
            credentials: { accessKeyId: "local", secretAccessKey: "local" },
          }
        : {}),
    }),
  );

  /* Existing rows, by content key — a Query on GSI1, the same access pattern
     `listSeeds()` uses, so this script sees exactly what the site sees. */
  const existing = new Map();
  const { Items = [] } = await ddb.query({
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": "SEED" },
  });
  for (const item of Items) existing.set(item.contentKey, item);

  let added = 0;
  let updated = 0;

  for (const { key, listed, per50g } of PRICE_LIST) {
    const prior = existing.get(key);
    const row = {
      id: prior?.id ?? randomUUID(),
      contentKey: key,
      pricePer100g: pricePer100g(per50g, markup),
      stockGrams:
        prior && !resetStock ? prior.stockGrams : DEFAULT_STOCK_GRAMS,
      active: prior?.active ?? true,
    };

    const change = prior
      ? `update  ₹${prior.pricePer100g} → ₹${row.pricePer100g}/100 g, ${row.stockGrams} g`
      : `add     ₹${row.pricePer100g}/100 g, ${row.stockGrams} g`;
    console.log(`${key.padEnd(16)} ${change}   (list: ${listed} @ ₹${per50g}/50 g)`);

    if (!dry) {
      await ddb.put({
        TableName: TABLE,
        Item: {
          PK: `SEED#${row.id}`,
          SK: "META",
          GSI1PK: "SEED",
          GSI1SK: row.contentKey,
          ...row,
          __edb_e__: "seed",
          __edb_v__: "1",
        },
      });
    }
    if (prior) updated += 1;
    else added += 1;
  }

  const note = markup ? ` at +${markup}% markup` : " at list price × 2";
  console.log(
    `\n${dry ? "would write" : "wrote"} ${PRICE_LIST.length} seeds${note} — ` +
      `${added} new, ${updated} existing${resetStock ? " (stock reset)" : " (stock kept)"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
