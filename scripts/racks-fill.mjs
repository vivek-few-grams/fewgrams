/**
 * Fills out the rack range in DynamoDB — SPEC §19.3, §20, §21.
 *
 *   node --env-file=.env.local scripts/racks-fill.mjs         # write
 *   node --env-file=.env.local scripts/racks-fill.mjs --dry    # preview only
 *
 * For every height on sale, in every active shelf size or footprint and every
 * active angle grade, publishes the rack if it is not already on sale — plated
 * racks under `MODEL#`, open-frame racks under `AMODEL#`, UPVC pipe racks
 * under `PMODEL#`.
 *
 * **This is a script and not a button on purpose.** There were two bulk
 * buttons on the admin screens, and the owner asked for them gone (17 Sep
 * 2026): *"do not build too many UI elements to load the different combination
 * or accept the prices. The UI should be simple enough to add different
 * combination, but the missing combination can be added directly into the DB
 * from your end."* Adding one rack is a three-field form; filling out a
 * thirty-row grid is a data job, and a data job does not need a UI.
 *
 * **Additive, and it never overwrites.** A rack already on sale is matched on
 * its config and skipped, so a hand-set price, an override or an `active: false`
 * survives every run. Running it twice changes nothing; running it after adding
 * a footprint or a height adds only the new rows.
 *
 * Each new rack is written at the current markup, with `costAtPublish`
 * recording the cost it was priced against — the same contract the admin
 * screens write under. Note that the screens now **reprice on every rate
 * edit** (SPEC §19.3.1), so a row this script writes is not frozen: the next
 * rate change moves it along with everything else.
 *
 * ## Why the arithmetic is duplicated here
 *
 * `src/lib/racks/pricing.ts` is the authoritative copy and this file is plain
 * ESM, which cannot import TypeScript on Node 20. So the formula appears twice,
 * which is a real hazard: a divergence would write wrong prices into the
 * database silently. `src/lib/racks/script-parity.test.ts` imports both and
 * asserts they agree on the whole range, so the duplication cannot drift
 * unnoticed. That is also why every pure function below is exported.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

/* ─────────────────────────── the arithmetic ─────────────────────────── */

/** Shelves are the height in feet minus one — an identity, not a ceiling. */
export function shelvesForHeight(heightFt) {
  return Math.max(0, Math.floor(heightFt) - 1);
}

/** Retail rounds **up**. Rounding to nearest would put a ₹2,310 rack at ₹2,300
 *  — below cost. */
export function retailPrice(cost, settings) {
  const marked = cost * (1 + settings.markupPercent / 100);
  const step = settings.roundUpToNearest;
  return step > 1 ? Math.ceil(marked / step) * step : Math.ceil(marked);
}

/** Legs + plates + bolts + bushes. Bushes are per **rack**, not per shelf. */
export function rackCost(config, card) {
  const plate = card.plates.find((p) => p.id === config.plateId);
  const angle = card.angles.find((a) => a.id === config.angleId);
  if (!plate || !angle) return null;
  const s = card.settings;
  return (
    s.legsPerRack * config.heightFt * angle.ratePerFt +
    config.shelves * plate.price +
    config.shelves * s.boltSetsPerShelf * s.boltSetPrice +
    s.bushesPerRack * s.bushPrice
  );
}

/** Three along the length, two across the depth — the mid-rail is the third
 *  length, and it is what the LED tube mounts on. */
export function frameFeetPerShelf(frame) {
  return 3 * frame.lengthFt + 2 * frame.depthFt;
}

/** Same bill as a plated rack with the plates replaced by angle framing. */
export function angleRackCost(config, card) {
  const frame = card.frames.find((f) => f.id === config.frameId);
  const angle = card.angles.find((a) => a.id === config.angleId);
  if (!frame || !angle) return null;
  const s = card.settings;
  return (
    s.legsPerRack * config.heightFt * angle.ratePerFt +
    config.shelves * frameFeetPerShelf(frame) * angle.ratePerFt +
    config.shelves * s.boltSetsPerShelf * s.boltSetPrice +
    s.bushesPerRack * s.bushPrice
  );
}

/* ── the pipe range (SPEC §21) ──
   Its own material rates and its own footprints, and no gauge at all. The
   three constants below are rules rather than settings, exactly as in
   pricing.ts: 6 ft is what a 1 inch upright can carry, and a 4 ft span gets a
   leg under the middle of each long side. */
export const PIPE_MAX_HEIGHT_FT = 6;
export const PIPE_MID_SUPPORT_FROM_LENGTH_FT = 4;
export const PIPE_MID_SUPPORT_LEGS = 2;

/** The four corners, plus the middle support on anything long enough. */
export function pipeRackLegs(size, settings) {
  return (
    settings.legsPerRack +
    (size.lengthFt >= PIPE_MID_SUPPORT_FROM_LENGTH_FT ? PIPE_MID_SUPPORT_LEGS : 0)
  );
}

/** The perimeter, and only the perimeter — no mid-rail. A pipe shelf braces
 *  its span from underneath with a leg, not across the top with a rail. */
export function pipeFeetPerShelf(size) {
  return 2 * (size.lengthFt + size.depthFt);
}

/** Pipe by the foot, a four-way connector at every leg on every level, and a
 *  bottom bush per leg. No bolts: the joint *is* the fitting. */
export function pipeRackCost(config, card) {
  const size = card.pipes.find((p) => p.id === config.pipeSizeId);
  const pipe = card.pipeSettings;
  if (!size || !pipe) return null;
  const legs = pipeRackLegs(size, card.settings);
  return (
    legs * config.heightFt * pipe.ratePerFt +
    config.shelves * pipeFeetPerShelf(size) * pipe.ratePerFt +
    legs * config.shelves * pipe.connectorPrice +
    legs * pipe.bushPrice
  );
}

const heights = (card) => [...card.settings.heightsFt].sort((a, b) => a - b);

/** Active parts only: a bulk fill must not resurrect a retired size as a rack. */
export function allRackConfigs(card) {
  return heights(card).flatMap((heightFt) =>
    card.plates
      .filter((p) => p.active)
      .flatMap((plate) =>
        card.angles
          .filter((a) => a.active)
          .map((angle) => ({
            heightFt,
            shelves: shelvesForHeight(heightFt),
            plateId: plate.id,
            angleId: angle.id,
          })),
      ),
  );
}

export function allAngleRackConfigs(card) {
  return heights(card).flatMap((heightFt) =>
    card.frames
      .filter((f) => f.active)
      .flatMap((frame) =>
        card.angles
          .filter((a) => a.active)
          .map((angle) => ({
            heightFt,
            shelves: shelvesForHeight(heightFt),
            frameId: frame.id,
            angleId: angle.id,
          })),
      ),
  );
}

/** Capped at what the pipe can carry, and empty until its rates exist. The
 *  heights list is shared with two steel ranges that have no such limit. */
export function allPipeRackConfigs(card) {
  if (!card.pipeSettings) return [];
  return heights(card)
    .filter((h) => h <= PIPE_MAX_HEIGHT_FT)
    .flatMap((heightFt) =>
      card.pipes
        .filter((p) => p.active)
        .map((size) => ({
          heightFt,
          shelves: shelvesForHeight(heightFt),
          pipeSizeId: size.id,
        })),
    );
}

/* One comparison for all three ranges. A config names exactly one part list —
   a plate, a frame or a pipe size — so coalescing them is not a guess, and
   `angleId` is `undefined` on both sides for a pipe rack, which compares
   equal. `script-parity.test.ts` runs it over every range. */
const sameConfig = (a, b) =>
  a.heightFt === b.heightFt &&
  a.shelves === b.shelves &&
  a.angleId === b.angleId &&
  (a.plateId ?? a.frameId ?? a.pipeSizeId) ===
    (b.plateId ?? b.frameId ?? b.pipeSizeId);

/* ───────────────────────────── the writing ──────────────────────────── */

/* Entry point only. Importing this file for its arithmetic — which the parity
   test does — must not open a DynamoDB connection or write anything. */
const isEntryPoint = process.argv[1]?.endsWith("racks-fill.mjs");
if (isEntryPoint) await main();

async function main() {
  const dry = process.argv.includes("--dry");

  const TABLE = `${process.env.DYNAMODB_TABLE_PREFIX ?? "fewgrams"}-catalogue`;
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const ddb = DynamoDBDocument.from(
    new DynamoDBClient({
      region: process.env.DYNAMODB_REGION ?? "ap-south-1",
      ...(endpoint && {
        endpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );

  /* One Query for the whole rate card and both model lists: everything rack
     lives in the `RACKSPEC` partition, which is the reason it does. */
  const { Items = [] } = await ddb.query({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": "RACKSPEC" },
  });

  const under = (prefix) => Items.filter((i) => i.SK.startsWith(prefix));
  const card = {
    settings: Items.find((i) => i.SK === "SETTINGS"),
    plates: under("PLATE#"),
    angles: under("ANGLE#"),
    frames: under("FRAME#"),
    pipes: under("PIPESIZE#"),
    /* Read by exact key, and `null` rather than `undefined` when absent, so
       the pipe cost function's `!pipe` guard reads the same here as in
       pricing.ts. `PIPESETTINGS` is not caught by `under("PIPESIZE#")` —
       keys.test.ts pins that none of the nine keys on this partition can
       match another's prefix. */
    pipeSettings: Items.find((i) => i.SK === "PIPESETTINGS") ?? null,
  };

  if (!card.settings) {
    console.error(
      "No rack settings in the catalogue table. Set the rates in admin → Shelf racks first;\n" +
        "a price computed from figures nobody entered is worse than no price.",
    );
    process.exitCode = 1;
    return;
  }

  const ranges = [
    {
      label: "plated racks",
      prefix: "MODEL#",
      entity: "rackModel",
      /* `AMODEL#` does not begin with `MODEL#` — the `#` is part of the
         prefix — so this returns plated racks only. keys.test.ts pins it. */
      existing: under("MODEL#"),
      wanted: allRackConfigs(card),
      cost: (c) => rackCost(c, card),
      describe: (c) => `${c.heightFt} ft · ${c.shelves} shelves · ${c.plateId}`,
    },
    {
      label: "angle racks",
      prefix: "AMODEL#",
      entity: "angleRackModel",
      existing: under("AMODEL#"),
      wanted: allAngleRackConfigs(card),
      cost: (c) => angleRackCost(c, card),
      describe: (c) => `${c.heightFt} ft · ${c.shelves} shelves · ${c.frameId}`,
    },
    {
      label: "pipe racks",
      prefix: "PMODEL#",
      entity: "pipeRackModel",
      existing: under("PMODEL#"),
      /* Empty, not an error, when the pipe rates have not been entered: the
         two steel ranges still fill. */
      wanted: allPipeRackConfigs(card),
      cost: (c) => pipeRackCost(c, card),
      describe: (c) => `${c.heightFt} ft · ${c.shelves} shelves · ${c.pipeSizeId}`,
    },
  ];

  const now = new Date().toISOString();

  for (const range of ranges) {
    const missing = range.wanted.filter(
      (c) => !range.existing.some((m) => sameConfig(m.config, c)),
    );

    console.log(
      `${range.label}: wanted ${range.wanted.length} · on sale ${range.existing.length} · ` +
        `missing ${missing.length}`,
    );

    for (const config of missing) {
      const cost = range.cost(config);
      /* Skipped, not written at zero: a config whose part has gone is
         unpriceable, and a ₹0 rack on sale is worse than a gap. */
      if (cost === null) {
        console.log(`  skip (unpriceable)  ${range.describe(config)}`);
        continue;
      }
      const price = retailPrice(cost, card.settings);
      console.log(
        `  ${dry ? "would add" : "add     "}  ${range.describe(config)}  ` +
          `cost ₹${cost} → ₹${price}`,
      );
      if (dry) continue;

      const id = randomUUID();
      await ddb.put({
        TableName: TABLE,
        Item: {
          PK: "RACKSPEC",
          SK: `${range.prefix}${id}`,
          /* ElectroDB stamps these on everything it writes. Our config sets
             `ignoreOwnership`, so reads do not depend on them — but a row
             without them would be the only one of its kind in the partition,
             and the next person to turn ownership on would lose exactly these
             rows. */
          __edb_e__: range.entity,
          __edb_v__: "1",
          id,
          config,
          price,
          costAtPublish: cost,
          publishedAt: now,
          active: true,
        },
        /* Belt and braces on the UUID: a collision would overwrite a rack
           that already has a price someone set. */
        ConditionExpression: "attribute_not_exists(SK)",
      });
    }
  }

  if (dry) console.log("\n--dry: nothing written.");
}
