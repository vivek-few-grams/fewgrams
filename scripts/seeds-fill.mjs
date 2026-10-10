/**
 * Loads the seed shelf into DynamoDB from the owner's supplier price list —
 * SPEC §22.1, §22.2.
 *
 *   node --env-file=.env.local scripts/seeds-fill.mjs --dry           # preview
 *   node --env-file=.env.local scripts/seeds-fill.mjs                 # write
 *   node --env-file=.env.local scripts/seeds-fill.mjs --reset-stock   # also set stock
 *
 * **This is a script and not a button**, for the same reason as
 * `racks-fill.mjs`: adding one seed is a three-field form on /admin/seeds, and
 * loading eighteen rows off a PDF is a data job. The owner's instruction on 17
 * Sep 2026 was to keep the admin screens to the minimum controls, with bulk
 * work done directly against the database.
 *
 * ## Costs, from the vendor's invoice of 26 Aug 2026
 *
 * AllThatGrows (Seed Delivery LLP) invoiced 250 g of each of fourteen seeds,
 * quoting a **price per kg**. The site sells by the 100 g (the owner, 3 Oct
 * 2026: *"seeds should be always purchasable in 100 gm qty"*), so each cost
 * below is that per-kg price ÷ 10, written to `costPer100g`. The sell price is
 * worked out from it with the seeds margin (`SEEDSETTINGS`, the Margin form on
 * /admin/seeds) — `retailPrice`, the racks' formula.
 *
 * **Shipping is not in the cost.** The invoice's ₹231 + 18% GST (₹272.58)
 * over 3.5 kg is about ₹7.79 per 100 g; it is left out so a cost reads the
 * same as the vendor's price list.
 *
 * Four seeds were not on that invoice — alfalfa, dill, kale and red
 * amaranthus. The owner supplied their costs the same day (3 Oct 2026) as a
 * price per 250 g — ₹200, ₹200, ₹375 and ₹200 — written here per kg (× 4).
 * A row with `perKg: null` would keep whatever price it already has.
 *
 * Until 3 Oct 2026 this list held a 50 g *sell* price list
 * (`Microgreen_Seed_Price_List_50g.pdf`, 17 Sep 2026) and wrote it doubled.
 *
 * ## What it does and does not overwrite
 *
 * A row is matched on `contentKey` — the same key the content file and the URL
 * use. Matching rows keep their `id` and their `active` flag, so a seed
 * withdrawn from sale stays withdrawn across a re-run, and every URL and
 * historical reference survives. The cost and price are rewritten every run
 * for a seed with a cost.
 *
 * `stockGrams` is **not** touched on an existing row unless `--reset-stock` is
 * passed. Stock is what the owner counted on the shelf, and silently replacing
 * a counted figure with a default from a script is how a shelf starts lying.
 * New rows get `DEFAULT_STOCK_GRAMS`.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
/* The one formula, shared with the racks; `racks-fill.mjs` guards its entry
   point, so importing it runs nothing. */
import { retailPrice } from "./racks-fill.mjs";

/**
 * The owner's supplier list, verbatim in the third column. The `key` is the
 * content key: it names `content/seeds/<key>.json` and the `/seeds/<key>` URL,
 * so it is kebab-case and it never carries the supplier's word order
 * ("Cabbage Red" is `red-cabbage`, because that is what the URL should read).
 */
export const PRICE_LIST = [
  { key: "alfalfa", listed: "Alfalfa", perKg: 800 },
  { key: "basil", listed: "Basil Green", perKg: 2100 },
  { key: "beetroot", listed: "Beet Root Red", perKg: 1000 },
  { key: "broccoli", listed: "Broccoli", perKg: 2300 },
  { key: "cabbage", listed: "Cabbage", perKg: 2250 },
  { key: "dill", listed: "Dill", perKg: 800 },
  { key: "garden-cress", listed: "Garden Cress", perKg: 1600 },
  { key: "kale", listed: "Kale green", perKg: 1500 },
  { key: "mustard", listed: "Mustard", perKg: 250 },
  { key: "pak-choi", listed: "Pak Choi", perKg: 600 },
  { key: "radish", listed: "Radish Pink", perKg: 500 },
  { key: "red-amaranthus", listed: "Amaranthus Red", perKg: 800 },
  { key: "red-cabbage", listed: "Cabbage Red", perKg: 3600 },
  { key: "red-onion", listed: "Onion Red", perKg: 1000 },
  { key: "rocket", listed: "Rocket Cultivated", perKg: 1200 },
  { key: "spinach", listed: "Spinach", perKg: 150 },
  { key: "sunflower", listed: "Sunflower", perKg: 350 },
  { key: "swiss-chard", listed: "Swisschard", perKg: 1400 },
];

/** Where the costs came from — the invoice the owner forwarded. */
export const COST_SOURCE = "AllThatGrows (Seed Delivery LLP) invoice, 26 Aug 2026";

/** What the owner holds of each seed as of 17 Sep 2026: *"each I have 200 gms"*. */
export const DEFAULT_STOCK_GRAMS = 200;

/** The vendor's per-kg price → our cost per 100 g, the unit the site sells. */
export function costPer100g(perKg) {
  return perKg / 10;
}

/** The margin as stored, or cost to the rupee when none has been saved —
 *  `getSeedMargin`'s rule. */
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
  const resetStock = flag("reset-stock") !== null;

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

  const { Item: settings } = await ddb.get({
    TableName: TABLE,
    Key: { PK: "SEEDSETTINGS", SK: "SETTINGS" },
  });
  const margin = marginFrom(settings);

  let added = 0;
  let updated = 0;
  const uncosted = [];

  for (const { key, listed, perKg } of PRICE_LIST) {
    const prior = existing.get(key);
    const cost = perKg === null ? prior?.costPer100g : costPer100g(perKg);
    const priorPrice = prior?.pricePer100g ?? (prior?.pricePer50g ?? 0) * 2;
    if (cost === undefined) {
      uncosted.push(key);
      /* No cost and no row: nothing to price it from, so it is not added. */
      if (!prior) {
        console.log(`${key.padEnd(16)} skip    no cost and no row yet`);
        continue;
      }
    }
    const row = {
      id: prior?.id ?? randomUUID(),
      contentKey: key,
      pricePer100g: cost === undefined ? priorPrice : retailPrice(cost, margin),
      ...(cost === undefined ? {} : { costPer100g: cost }),
      stockGrams: prior && !resetStock ? prior.stockGrams : DEFAULT_STOCK_GRAMS,
      active: prior?.active ?? true,
    };

    const change = prior
      ? `update  ₹${priorPrice} → ₹${row.pricePer100g}/100 g, ${row.stockGrams} g`
      : `add     ₹${row.pricePer100g}/100 g, ${row.stockGrams} g`;
    const costNote = cost === undefined ? "no cost yet, price kept" : `cost ₹${cost}/100 g`;
    console.log(`${key.padEnd(16)} ${change}   (${listed}, ${costNote})`);

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

  console.log(
    `\n${dry ? "would write" : "wrote"} ${added + updated} seeds at ${margin.markupPercent}% markup, ` +
      `rounded up to ₹${margin.roundUpToNearest} — ${added} new, ${updated} existing` +
      `${resetStock ? " (stock reset)" : " (stock kept)"}`,
  );
  if (uncosted.length) console.log(`no cost yet: ${uncosted.join(", ")}`);
}

/* Entry point only, as in racks-fill.mjs. The parity test imports this file
   for its price list, and an unguarded call wrote to DynamoDB on import — or,
   in CI with no credentials, exited the test run (10 Oct 2026). */
if (process.argv[1]?.endsWith("seeds-fill.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
