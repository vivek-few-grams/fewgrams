/**
 * Loads the vendors we buy from into DynamoDB — SPEC §26.6, from the bills
 * and details the owner supplied (18 Oct 2026 onward).
 *
 *   node --env-file=.env.local scripts/vendors-fill.mjs --dry     # preview
 *   node --env-file=.env.local scripts/vendors-fill.mjs           # write
 *
 * **A script and not a form** for the same reason as `seeds-fill.mjs`: the
 * owner gave the details one at a time in a chat, and the same list has to
 * reach the live database after deploy without being typed in twice. Admin →
 * vendors stays the place to add the next one or correct this one.
 *
 * ## What it does and does not overwrite
 *
 * A row is matched on its GSTIN, or on its name for a vendor without one.
 * A matching row keeps its `id` (so its bills still point at it), its
 * `createdAt` and its `active` flag; everything else is rewritten from the
 * list. Nothing is ever deleted — a vendor dropped from the list stays in
 * the table.
 *
 * Every GSTIN is checked against its check digit and its state code before
 * anything is written, so a typo here fails the run rather than reaching a
 * bill.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

/**
 * The vendors. `kind` is `registered`, `unregistered` or `foreign`; a
 * registered one carries its GSTIN and the state its first two digits name.
 * `supplies` are keys from `src/lib/purchases/supplies.ts` — what we buy from
 * them; a product may sit on several vendors. `source` says where each detail
 * was read from, so the next person can check it without asking.
 */
/** The seeds on the shelf, by content key — all bought from AllThatGrows. */
const SEEDS = [
  "alfalfa",
  "basil",
  "beetroot",
  "broccoli",
  "cabbage",
  "dill",
  "garden-cress",
  "kale",
  "mustard",
  "pak-choi",
  "radish",
  "red-amaranthus",
  "red-cabbage",
  "red-onion",
  "rocket",
  "spinach",
  "sunflower",
  "swiss-chard",
];

export const VENDORS = [
  {
    name: "Seed Delivery LLP",
    kind: "registered",
    gstin: "04ADAFS9288D1ZY",
    stateCode: "04",
    stateName: "Chandigarh",
    address: "Plot No 172, Industrial Area Phase-1, Chandigarh 160002",
    phone: "8544865077",
    email: "hello@allthatgrows.in",
    /* Every seed on the shelf (the owner, 18 Oct 2026). */
    supplies: SEEDS.map((k) => `seed:${k}`),
    filing: "unknown",
    notes:
      "AllThatGrows (allthatgrows.in). Microgreen seeds, HSN 1209, exempt. Shipping is billed as its own line at 18% IGST — credit None, since the seeds go only to exempt sales.",
    source: "Their tax invoice of 26 Aug 2026; LLP name from their terms page",
  },
  {
    name: "Bazodo Enterprises",
    kind: "registered",
    gstin: "33DVUPD4855C1ZI",
    stateCode: "33",
    stateName: "Tamil Nadu",
    address: "Old No 2-107-B, New No 7-44, Arulmigu Muniappan Swamy Koil, Irugalur, Salem, Tamil Nadu 637103",
    phone: "9597377857",
    email: "admin@bazodo.com",
    supplies: ["tray:tray-pair", "tray:tray-pair-food-grade"],
    filing: "unknown",
    notes:
      "Bazodo (bazodo.com). Microgreen tray pairs and food-grade tray pairs, HSN 3926 at 18% IGST (Tamil Nadu). Ask for a GST invoice in FEWGRAMS' name with our GSTIN.",
    source:
      "Name and address from their terms and contact pages; GSTIN from their IndiaMART listing (check digit valid) — confirm against their first bill",
  },
  {
    name: "Pasumai Thottakalai",
    kind: "unregistered",
    address: "Tamil Nadu 632316",
    email: "ammuriyas12597@gmail.com",
    supplies: ["tray:drain-cell-mat"],
    filing: "unknown",
    notes:
      "pasumaithottakalai.com. Heavy-duty drain cell mats (20 mm), pack of 5. No GST on their bill (owner, 18 Oct 2026) — nothing to claim; the mats cost the full price.",
    source: "Contact block on their shop page; registration status from the owner's bill",
  },
  {
    name: "Sri Ragavendira Pith Block (Mourian Agro)",
    kind: "registered",
    gstin: "33FYRPS8518D1ZW",
    stateCode: "33",
    stateName: "Tamil Nadu",
    address:
      "S.F.No 205/2B, Marchnaayakkan Palayam, Subbiyagoundern Pudur, Pollachi 642103, Coimbatore district, Tamil Nadu",
    phone: "9715011446",
    email: "coco@mourian.com",
    supplies: ["media:horti-coir", "media:horti-coir-small"],
    filing: "unknown",
    notes:
      "Mourian Agro (mourian.com), the trade name of Sathurtha Mourian's proprietorship. Cocopeat blocks (Horti-Coir 1 kg and 5 kg), HSN 53050040 at 5% IGST (Tamil Nadu). Sent the quotation of 3 Oct 2026. If their bill is headed Mourian Agro under a different GSTIN, correct it here.",
    source:
      "Address and contact from their contact page; GSTIN 33FYRPS8518D1ZW is registered to Sathurtha Mourian, trade name Sri Ragavendira Pith Block, at the same 205/2B address (TaxAdda; check digit valid) — confirm against their first bill",
  },
  {
    name: "Goodluck Steel Racks",
    kind: "unregistered",
    address: "29 Anna Palporul Angaadi Street, Bharathidasan Colony, K.K. Nagar, Chennai 600078, Tamil Nadu",
    phone: "9385290165",
    supplies: ["rack:shelf", "rack:angle"],
    filing: "unknown",
    notes:
      "Shelf (plated) racks and angle racks; they ship racks straight to the customer from this address (admin → delivery pickup). No GST on their bill (owner, 18 Oct 2026) — nothing to claim. Racks are 18%: if they register, ask for a GST invoice in FEWGRAMS' name and change this vendor to registered.",
    source:
      "Owner (name, no GST on bill); address and phone from the rack pickup on admin → delivery; Justdial listing",
  },
];

/** The keys `src/lib/purchases/supplies.ts` accepts. */
const SUPPLY = /^(rack:(shelf|angle|pipe-pipes|pipe-connectors)|(seed|tray|media):[a-z]+(-[a-z]+)*)$/;

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTN's mod-36 check digit — the same as `src/lib/tax/gstin.ts`. */
function validGstin(g) {
  if (!SHAPE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return g[14] === CHARS[(36 - (sum % 36)) % 36];
}

function check(v) {
  if (!v.name) throw new Error("a vendor has no name");
  if (!["registered", "unregistered", "foreign"].includes(v.kind))
    throw new Error(`${v.name}: kind ${v.kind}`);
  if (v.kind === "registered") {
    if (!validGstin(v.gstin ?? "")) throw new Error(`${v.name}: GSTIN ${v.gstin} fails its check digit`);
    if (v.gstin.slice(0, 2) !== v.stateCode)
      throw new Error(`${v.name}: GSTIN is state ${v.gstin.slice(0, 2)}, not ${v.stateCode}`);
  } else if (v.gstin) {
    throw new Error(`${v.name}: only a registered vendor has a GSTIN`);
  }
  if (!["monthly", "quarterly", "unknown"].includes(v.filing))
    throw new Error(`${v.name}: filing ${v.filing}`);
  for (const k of v.supplies ?? []) if (!SUPPLY.test(k)) throw new Error(`${v.name}: unknown supply ${k}`);
}

const flag = (name) => process.argv.find((a) => a === `--${name}`) ?? null;

async function main() {
  const dry = flag("dry") !== null;
  VENDORS.forEach(check);

  const TABLE = `${process.env.DYNAMODB_TABLE_PREFIX ?? "fewgrams"}-orders`;
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const ddb = DynamoDBDocument.from(
    new DynamoDBClient({
      region: process.env.DYNAMODB_REGION ?? "ap-south-1",
      ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
    }),
  );
  console.log(`${dry ? "DRY RUN — " : ""}${TABLE}${endpoint ? ` at ${endpoint}` : " (AWS)"}`);

  /* The same Query `listVendors()` makes, so this sees what admin sees. */
  const { Items = [] } = await ddb.query({
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": "VENDOR" },
  });
  const match = (v) =>
    Items.find((i) =>
      v.gstin ? i.gstin === v.gstin : !i.gstin && i.name.toLowerCase() === v.name.toLowerCase(),
    );

  const now = new Date().toISOString();
  for (const v of VENDORS) {
    const prior = match(v);
    const { source: _source, ...fields } = v;
    const row = {
      ...fields,
      gstin: v.gstin ?? undefined,
      stateCode: v.stateCode ?? undefined,
      stateName: v.stateName ?? undefined,
      id: prior?.id ?? randomUUID(),
      active: prior?.active ?? true,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    };
    console.log(
      `${prior ? "update" : "add   "}  ${v.name}${v.gstin ? ` · ${v.gstin} · ${v.stateName}` : ` · ${v.kind}`}`,
    );
    if (!dry) {
      await ddb.put({
        TableName: TABLE,
        Item: Object.fromEntries(
          Object.entries({
            PK: `VENDOR#${row.id}`,
            SK: "META",
            GSI1PK: "VENDOR",
            GSI1SK: row.id,
            ...row,
            __edb_e__: "vendor",
            __edb_v__: "1",
          }).filter(([, x]) => x !== undefined && x !== ""),
        ),
      });
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
