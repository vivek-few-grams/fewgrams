/**
 * Loads the trays and drainage cells into DynamoDB from the supplier pages the
 * owner supplied — SPEC §23, §23.6.
 *
 *   node --env-file=.env.local scripts/trays-fill.mjs --dry            # preview
 *   node --env-file=.env.local scripts/trays-fill.mjs                  # write
 *   node --env-file=.env.local scripts/trays-fill.mjs --markup=40      # +40% on the list
 *
 * **This is a script and not a button**, for the same reason as
 * `seeds-fill.mjs` and `racks-fill.mjs`: adding one item is a three-field form
 * on /admin/trays, and transcribing a supplier's catalogue is a data job. The
 * owner's instruction on 17 Sep 2026 was to keep the admin screens to the
 * minimum controls, with bulk work done directly against the database.
 *
 * ## The prices are the suppliers' own, verbatim
 *
 * The owner's instruction was *"add same price that is shown on the website"*,
 * so the third column below is exactly what each product page listed on 17 Sep
 * 2026 — no markup, no rounding, no arithmetic at all. That is the one reading
 * of the instruction that needs no assumption about margin.
 *
 * **Whether these are sell prices or costs is unconfirmed** (SPEC §23.6), the
 * same open question as the seed price list. If they turn out to be costs,
 * re-run with `--markup=<percent>`; it is one command, which is why the flag
 * exists rather than three hand edits on the admin screen.
 *
 * ## What it does and does not overwrite
 *
 * A row is matched on `contentKey`. Matching rows keep their `id`, their
 * `active` flag **and their lead days**, so an item withdrawn from sale stays
 * withdrawn across a re-run and a lead time the owner has corrected by hand is
 * not silently reset to the launch figure. The price is rewritten every run,
 * because the supplier's list is the source of truth for it.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

/**
 * The three items, with the page each price was read from.
 *
 * `key` is the content key: it names `content/trays/<key>.json`, and
 * `src/lib/trays/script-parity.test.ts` fails if one exists without the other.
 * The `source` column is not decoration — it is how the next person confirms a
 * price without guessing which of two suppliers a row came from.
 */
export const PRICE_LIST = [
  {
    key: "drain-cell-mat",
    listed: "Heavy Duty Drain Cell Mat (20 MM) (Pack of 5)",
    price: 300,
    leadDays: 7,
    source:
      "pasumaithottakalai.com/products/heavy-duty-drain-cell-mat-20-mm-pack-of-5-...",
  },
  {
    key: "tray-pair",
    listed: "Micro Green Trays - 2 Trays (1 drained, 1 solid) - Sample Kit",
    price: 160,
    leadDays: 7,
    source: "bazodo.com/product/683-micro-green-trays-2-trays-...-sample-kit",
  },
  {
    key: "tray-pair-food-grade",
    listed: "Food Grade Micro Green Trays - 2 Trays - Virgin Plastic Trays",
    price: 270,
    leadDays: 7,
    source: "bazodo.com/product/691-food-grade-micro-green-trays-2-trays-...",
  },
];

/**
 * List price → shelf price. No arithmetic at zero markup, which is the launch
 * state; a markup rounds **up** to the rupee so a marked-up price can never
 * land below the figure it was derived from. Same rule as seeds and racks.
 */
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
     `listTrays()` uses, so this script sees exactly what the site sees. */
  const existing = new Map();
  const { Items = [] } = await ddb.query({
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": "TRAY" },
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
          PK: `TRAY#${row.id}`,
          SK: "META",
          GSI1PK: "TRAY",
          GSI1SK: row.contentKey,
          ...row,
          __edb_e__: "tray",
          __edb_v__: "1",
        },
      });
    }
    if (prior) updated += 1;
    else added += 1;
  }

  const note = markup ? ` at +${markup}% markup` : " at the suppliers' listed prices";
  console.log(
    `\n${dry ? "would write" : "wrote"} ${PRICE_LIST.length} items${note} — ` +
      `${added} new, ${updated} existing (lead days kept)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
