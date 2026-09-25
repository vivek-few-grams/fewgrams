import { CustomAttributeType, Entity } from "electrodb";
import { catalogueConfig, ordersConfig, usersConfig } from "@/lib/db/client";
import { CART_KINDS } from "@/lib/cart/cart";
import { ORDER_STATUSES } from "@/lib/types";

/**
 * ElectroDB entity definitions — the single place the table's key layout is
 * declared (SPEC §4).
 *
 * Why this exists: single-table design means one physical table holds every
 * entity type, and before this file each repository hand-built its own `PK` /
 * `SK` / `GSI1PK` strings. That works but the shape of a row lived only in
 * whichever function last wrote it. ElectroDB moves the key layout into a
 * declared schema and generates the keys from it, so a typo in a prefix is a
 * schema error rather than a silently-missing row.
 *
 * Three rules this file follows, deliberately:
 *
 * 1. **`template` on every key, `casing: "none"` on every key.** Left to
 *    itself ElectroDB builds keys like `$fewgrams#variety_1#id_radish` and
 *    lowercases them. Explicit templates reproduce the keys in SPEC §4
 *    byte-for-byte, so adopting ElectroDB needed no data migration.
 *    src/lib/db/keys.test.ts asserts exactly that.
 *
 * 2. **No collections.** A collection would let one Query return a plan and
 *    its rotation weeks together, but ElectroDB implements non-isolated
 *    collections by filtering on the `__edb_e__` attribute it stamps onto
 *    rows it writes — which rows written before this file do not carry. Plans
 *    number three or four, so the extra Query per plan is cheaper than the
 *    migration. Revisit if a partition ever holds many entity types at once.
 *
 * 3. **Entity attributes mirror src/lib/types.ts.** The domain types stay the
 *    app's vocabulary; these schemas are the storage projection of them, and
 *    src/lib/repo/* is the only layer that translates between the two.
 */

const model = { service: "fewgrams", version: "1" } as const;

/** SPEC §4.4 — admin-created text is a localised map, never a plain string. */
const localisedString = {
  type: "map",
  required: true,
  properties: {
    en: { type: "string", required: true },
    kn: { type: "string" },
  },
} as const;

/**
 * Variety — SPEC §3.1 / §4 / §4.3.
 *   PK = VARIETY#<id>   SK = META   GSI1PK = VARIETY   GSI1SK = <contentKey>
 *
 * GSI1 is what makes "list every variety, ordered by key" a Query rather than
 * a Scan.
 *
 * **Carries no text.** `name` was removed on 15 Sep 2026 — it now lives in
 * `content/varieties/<contentKey>.json` with the rest of the copy, so the
 * admin UI never asks anyone to type a label. `contentKey` replaced `slug`
 * and generates the identical key string, because it does the same two jobs
 * a slug did (URL segment, stable identifier) plus one more: it names the
 * content file. src/lib/db/keys.test.ts pins that the bytes did not move.
 *
 * **`pricePer100g` became `pricePerTray` on 19 Sep 2026** — the owner's
 * instruction: ordering and pricing both move to the tray, and
 * `yieldGramsPerTray` becomes an approximate, informational weight rather
 * than a figure anything is priced from. See the note on `Variety`.
 *
 * **`yieldGramsPerTray` split into `Min`/`Max` the same day** — a range
 * rather than one number, because no two cut trays weigh the same.
 */
export const VarietyEntity = new Entity(
  {
    model: { ...model, entity: "variety" },
    attributes: {
      id: { type: "string", required: true },
      contentKey: { type: "string", required: true },
      pricePerTray: { type: "number", required: true },
      /** The two fields the whole operation computes from (SPEC §3.1), so
       *  both are required on every variety. */
      yieldGramsPerTrayMin: { type: "number", required: true },
      yieldGramsPerTrayMax: { type: "number", required: true },
      growDays: { type: "number", required: true },
      /** Optional: present only for varieties whose seed rate is known, and
       *  it drives the sow plan's advisory seed column (SPEC §6). */
      seedGramsPerTray: { type: "number" },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "VARIETY#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byCatalogue: {
        index: "GSI1",
        pk: { field: "GSI1PK", composite: [], template: "VARIETY", casing: "none" },
        sk: {
          field: "GSI1SK",
          composite: ["contentKey"],
          template: "${contentKey}",
          casing: "none",
        },
      },
    },
  },
  catalogueConfig,
);

/**
 * Product — seeds, racks, trays, snacks (SPEC §3 / §4).
 *   PK = PRODUCT#<id>  SK = META  GSI1PK = CAT#<category>  GSI1SK = <slug>
 *
 * Listing one category is a Query; listing everything is four Queries, one
 * per category, rather than a Scan.
 */
export const ProductEntity = new Entity(
  {
    model: { ...model, entity: "product" },
    attributes: {
      id: { type: "string", required: true },
      slug: { type: "string", required: true },
      category: {
        type: ["racks", "trays", "seeds", "snacks"] as const,
        required: true,
      },
      name: localisedString,
      basePrice: { type: "number", required: true },
      /** SPEC §3.0.1 — variants exist from the start rather than being
       *  retrofitted when trays need a material and a size. */
      variants: {
        type: "list",
        required: true,
        items: {
          type: "map",
          properties: {
            sku: { type: "string", required: true },
            /** Free-form `{ material: "PP", size: "10x20" }`, so it cannot be
             *  a `map` with declared properties. */
            attributes: {
              type: CustomAttributeType<Record<string, string>>("any"),
              required: true,
            },
            price: { type: "number", required: true },
            /** Seeds only — real stock in grams (SPEC §3). */
            stockGrams: { type: "number" },
            active: { type: "boolean", required: true },
          },
        },
      },
      active: { type: "boolean", required: true },
      /** Reserved now so GST can be switched on later without a data
       *  migration (SPEC §9.1). */
      hsnCode: { type: "string" },
      taxRate: { type: "number" },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "PRODUCT#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byCategory: {
        index: "GSI1",
        pk: {
          field: "GSI1PK",
          composite: ["category"],
          template: "CAT#${category}",
          casing: "none",
        },
        sk: { field: "GSI1SK", composite: ["slug"], template: "${slug}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * Seed — SPEC §3 / §22.
 *   PK = SEED#<id>   SK = META   GSI1PK = SEED   GSI1SK = <contentKey>
 *
 * Identical key shape to `VarietyEntity`, because a seed is the same kind of
 * record: numbers in DynamoDB, every word in `content/seeds/<contentKey>.json`
 * (SPEC §4.3). GSI1 is what makes "list every seed, ordered by key" a Query
 * rather than a Scan.
 *
 * **A separate entity from `ProductEntity`, not `category: "seeds"` on it.**
 * The reasoning is on the `Seed` type; the storage consequence is that stock
 * lives on the row rather than inside a `variants` list, so decrementing it at
 * checkout is an `UpdateItem` with a condition on one attribute instead of a
 * read-modify-write of a nested list — which could not be made safe under two
 * concurrent orders (SPEC §15).
 *
 * `SEED#` cannot be confused with `SEEDS#` or anything else on this table:
 * the partitions here are one per entity id, and `GSI1PK = "SEED"` is an
 * exact-match partition, never a `begins_with`. `keys.test.ts` pins that a
 * seed and a variety with the same content key land on different keys — which
 * they must, because `radish` the seed and `radish` the microgreen are two
 * different things to buy.
 */
export const SeedEntity = new Entity(
  {
    model: { ...model, entity: "seed" },
    attributes: {
      id: { type: "string", required: true },
      contentKey: { type: "string", required: true },
      /** ₹ per 50 g, from 25 Sep 2026. Optional only because rows saved
       *  before then hold `pricePer100g` instead; the repo reads that as half
       *  until the row is saved again. */
      pricePer50g: { type: "number" },
      /** Retired 25 Sep 2026 — see `pricePer50g`. Never written again. */
      pricePer100g: { type: "number" },
      /** Grams on the shelf — the most that can be ordered (the owner,
       *  25 Sep 2026). Zero is sold out. */
      stockGrams: { type: "number", required: true },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "SEED#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byCatalogue: {
        index: "GSI1",
        pk: { field: "GSI1PK", composite: [], template: "SEED", casing: "none" },
        sk: {
          field: "GSI1SK",
          composite: ["contentKey"],
          template: "${contentKey}",
          casing: "none",
        },
      },
    },
  },
  catalogueConfig,
);

/**
 * Tray or drainage mat — SPEC §23.
 *   PK = TRAY#<id>  SK = META  GSI1PK = TRAY  GSI1SK = <contentKey>
 *
 * The same layout as `SeedEntity` with the stock attribute replaced by a lead
 * time, which is the whole difference between the two: a seed may be on our
 * shelf, a tray is always on the supplier's. Carries no text, for the reasons
 * on the `Tray` type.
 *
 * **Not `category: "trays"` on `ProductEntity`**, which is what SPEC §3
 * originally described. `Product` puts the name in DynamoDB as a
 * `LocalisedString` typed into an admin form, and these items' words — the
 * supplier's dimensions, material and pack contents — want a content file and
 * a git diff instead (SPEC §4.3). Third entity pulled out of `Product` after
 * racks and seeds; only snacks are left on it.
 */
export const TrayEntity = new Entity(
  {
    model: { ...model, entity: "tray" },
    attributes: {
      id: { type: "string", required: true },
      contentKey: { type: "string", required: true },
      /** ₹ for the pack as sold, whole — see the note on `Tray.price`. */
      price: { type: "number", required: true },
      /** Packs held (the owner, 25 Sep 2026). Absent on rows saved before
       *  then, read as none. */
      stockPacks: { type: "number" },
      /** Retired 25 Sep 2026 with the stock count: the supplier lead time
       *  every order used to wait on. Still on stored rows; never read. */
      leadDays: { type: "number" },
      active: { type: "boolean", required: true },
      /** Packing for the courier — see `Tray`. Optional because it is
       *  measured after the row is priced. */
      packPieces: { type: "number" },
      pieceLengthCm: { type: "number" },
      pieceWidthCm: { type: "number" },
      pieceHeightCm: { type: "number" },
      pieceStackCm: { type: "number" },
      pieceGrams: { type: "number" },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "TRAY#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byCatalogue: {
        index: "GSI1",
        pk: { field: "GSI1PK", composite: [], template: "TRAY", casing: "none" },
        sk: {
          field: "GSI1SK",
          composite: ["contentKey"],
          template: "${contentKey}",
          casing: "none",
        },
      },
    },
  },
  catalogueConfig,
);

/**
 * Grow medium (cocopeat) — SPEC §24.
 *   PK = MEDIUM#<id>  SK = META  GSI1PK = MEDIUM  GSI1SK = <contentKey>
 *
 * `TrayEntity`'s layout exactly, attribute for attribute: a block of coir is
 * sold the way a tray is — bought in per order, one price per pack, a lead
 * time per row, six packing figures for the courier. Its own entity because it
 * is its own category and its own content folder (see `GrowMedium`), and
 * `MEDIUM` is an exact-match GSI1 partition like `TRAY`, so a `radish` here
 * could never be read back as the tray, seed or green of that name.
 */
export const GrowMediumEntity = new Entity(
  {
    model: { ...model, entity: "growMedium" },
    attributes: {
      id: { type: "string", required: true },
      contentKey: { type: "string", required: true },
      /** ₹ for one pack as sold, whole — see `GrowMedium.price`. */
      price: { type: "number", required: true },
      /** Blocks held — see `TrayEntity.stockPacks`. */
      stockPacks: { type: "number" },
      /** Retired 25 Sep 2026 — see `TrayEntity.leadDays`. */
      leadDays: { type: "number" },
      active: { type: "boolean", required: true },
      /** Packing for the courier — see `GrowMedium`. Optional because it is
       *  measured after the row is priced. */
      packPieces: { type: "number" },
      pieceLengthCm: { type: "number" },
      pieceWidthCm: { type: "number" },
      pieceHeightCm: { type: "number" },
      pieceStackCm: { type: "number" },
      pieceGrams: { type: "number" },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "MEDIUM#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byCatalogue: {
        index: "GSI1",
        pk: { field: "GSI1PK", composite: [], template: "MEDIUM", casing: "none" },
        sk: {
          field: "GSI1SK",
          composite: ["contentKey"],
          template: "${contentKey}",
          casing: "none",
        },
      },
    },
  },
  catalogueConfig,
);

/**
 * Plan definition — SPEC §5.1.
 *   PK = PLAN#<id>  SK = META  GSI1PK = PLAN  GSI1SK = <sortOrder>#<contentKey>
 *
 * DOCUMENTED DEVIATION from SPEC §4, carried over from the hand-written
 * repository: the spec gives plans no GSI1 entry, but the home page has to
 * list every plan and without an index that is a Scan. Writing
 * `GSI1PK = "PLAN"` makes listing a Query, and putting `sortOrder` first in
 * the sort key hands card ordering to the admin for free.
 *
 * `sortOrder` is padded to three characters because DynamoDB sorts keys as
 * strings: unpadded, plan 10 would sort before plan 2.
 *
 * **Carries no text.** `name`, `blurb` and `highlights` were removed on 15 Sep
 * 2026 — they now live in `content/plans/<contentKey>.json` with the rest of
 * the copy, so the admin UI never asks anyone to type a label or a bullet
 * list. `contentKey` replaced `slug` and generates the identical key string,
 * exactly as it did for varieties; src/lib/db/keys.test.ts pins that.
 */
export const PlanEntity = new Entity(
  {
    model: { ...model, entity: "plan" },
    attributes: {
      id: { type: "string", required: true },
      contentKey: { type: "string", required: true },
      /** Absent means Build Your Own, priced by weight (SPEC §5.1). The
       *  domain type spells this `null`; src/lib/repo/plans.ts translates. */
      monthlyPrice: { type: "number" },
      gramsPerBox: { type: "number", required: true },
      recommended: { type: "boolean", required: true },
      /* No `panel`: the card's ground colour is derived from its position by
         `planPanels()` in src/lib/types.ts, not stored per plan. */
      sortOrder: {
        type: "number",
        required: true,
        padding: { length: 3, char: "0" },
      },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "PLAN#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byCatalogue: {
        index: "GSI1",
        pk: { field: "GSI1PK", composite: [], template: "PLAN", casing: "none" },
        sk: {
          field: "GSI1SK",
          composite: ["sortOrder", "contentKey"],
          template: "${sortOrder}#${contentKey}",
          casing: "none",
        },
      },
    },
  },
  catalogueConfig,
);

/**
 * Plan rotation week — SPEC §4 / §5.2.
 *   PK = PLAN#<planId>  SK = WEEK#<1..4>
 *
 * Shares the plan's partition, so `begins_with(SK, "WEEK#")` returns the
 * whole rotation in one Query. This is a template, copied into
 * `SUB#<subId> / WEEK#<deliveryDate>` when a subscription is created and
 * deliberately never read live, so editing a pack cannot change what an
 * already-paid customer receives.
 */
export const PlanWeekEntity = new Entity(
  {
    model: { ...model, entity: "planWeek" },
    attributes: {
      planId: { type: "string", required: true },
      week: { type: "number", required: true },
      varietyKeys: { type: "list", required: true, items: { type: "string" } },
    },
    indexes: {
      byPlan: {
        pk: {
          field: "PK",
          composite: ["planId"],
          template: "PLAN#${planId}",
          casing: "none",
        },
        sk: {
          field: "SK",
          composite: ["week"],
          template: "WEEK#${week}",
          casing: "none",
        },
      },
    },
  },
  catalogueConfig,
);

/**
 * Customer profile — SPEC §4.
 *   PK = USER#<userId>  SK = PROFILE
 *
 * Lives in the users table, in the same partition as the Auth.js user,
 * account and session rows. That is the whole reason SPEC §4 puts it there:
 * one Query on `USER#<id>` returns the person and everywhere they want things
 * delivered, and deleting the partition deletes the person completely — which
 * is what a DPDP erasure request asks for.
 *
 * It is a separate row rather than more attributes on the adapter's user item
 * because that item is owned by @auth/dynamodb-adapter. The adapter writes it
 * with PutCommand on link and update, so extra attributes we added there
 * could be dropped by a library upgrade without warning. `role` is the
 * deliberate exception (src/lib/auth/users.ts) — it has to be readable in the
 * same GetItem that authorises a request.
 */
export const ProfileEntity = new Entity(
  {
    model: { ...model, entity: "profile" },
    attributes: {
      userId: { type: "string", required: true },
      /** Optional because a magic-link sign-in tells us nothing but an
       *  email. The account works without it; the delivery label reads
       *  better with it. */
      name: { type: "string" },
      phone: { type: "string" },
      updatedAt: { type: "string", required: true },
    },
    indexes: {
      byUser: {
        pk: {
          field: "PK",
          composite: ["userId"],
          template: "USER#${userId}",
          casing: "none",
        },
        sk: { field: "SK", composite: [], template: "PROFILE", casing: "none" },
      },
    },
  },
  usersConfig,
);

/**
 * Delivery address — SPEC §4.
 *   PK = USER#<userId>  SK = ADDR#<addrId>
 *
 * `begins_with(SK, "ADDR#")` returns one customer's addresses without
 * touching their profile, session or account rows, which is why the sort key
 * carries a prefix rather than being the bare id.
 *
 * No GSI. Addresses are only ever read for one known user; the delivery run
 * (SPEC §4.1) reads the address snapshot copied onto the order, not this row,
 * so that editing an address can never change where a packed order was
 * supposed to go.
 */
export const AddressEntity = new Entity(
  {
    model: { ...model, entity: "address" },
    attributes: {
      userId: { type: "string", required: true },
      addrId: { type: "string", required: true },
      label: { type: "string", required: true },
      recipient: { type: "string", required: true },
      phone: { type: "string", required: true },
      line1: { type: "string", required: true },
      line2: { type: "string" },
      landmark: { type: "string" },
      /** Legacy — no longer asked for; district replaced it (23 Sep 2026). */
      city: { type: "string" },
      /** Filled from the PIN (`placeForPin`), editable by the customer.
       *  Absent on addresses saved before 23 Sep 2026. */
      district: { type: "string" },
      state: { type: "string" },
      /** String, not number: a PIN code is an identifier. SPEC §7's
       *  allowlist compares it as text. */
      pincode: { type: "string", required: true },
      notes: { type: "string" },
      /** Optional throughout — the visitor can refuse the permission. */
      geo: {
        type: "map",
        properties: {
          lat: { type: "number", required: true },
          lng: { type: "number", required: true },
          accuracyM: { type: "number" },
        },
      },
      /** Exactly one address per user should carry this. It is enforced in
       *  src/lib/repo/profile.ts, not here — DynamoDB cannot express a
       *  cross-item constraint on a non-key attribute. */
      isDefault: { type: "boolean", required: true },
      createdAt: { type: "string", required: true },
      updatedAt: { type: "string", required: true },
    },
    indexes: {
      byUser: {
        pk: {
          field: "PK",
          composite: ["userId"],
          template: "USER#${userId}",
          casing: "none",
        },
        sk: {
          field: "SK",
          composite: ["addrId"],
          template: "ADDR#${addrId}",
          casing: "none",
        },
      },
    },
  },
  usersConfig,
);

/**
 * Rack rate card — SPEC §19–§21. Nine entities, one partition.
 *
 *   PK = RACKSPEC   SK = SETTINGS | PLATE#<id> | ANGLE#<id>
 *                        | FRAME#<id> | MODEL#<id> | AMODEL#<id>
 *                        | PIPESETTINGS | PIPESIZE#<id> | PMODEL#<id>
 *
 * Everything the rack calculator needs shares `PK = RACKSPEC`, so the whole
 * rate card is one partition and reading it costs three small Queries — one
 * per SK prefix. Not a collection, for the reason given at the top of this
 * file: ElectroDB implements non-isolated collections by filtering on the
 * `__edb_e__` attribute, and three Queries on a partition this size is
 * cheaper than earning the right to use one.
 *
 * Separate entities rather than one with a `kind` discriminator because the
 * shapes have nothing in common — a plate has a depth and a capacity, an
 * angle has a gauge and a colour list, and settings is a singleton. One
 * entity covering all of them would make almost every attribute optional and
 * give up the schema validation that is the point of declaring them here.
 *
 * **`MODEL#`, `AMODEL#` and `PMODEL#` are three lists, not one.** All three
 * rack ranges live in the same partition because they share `shelvesForHeight`
 * and the markup, but a `begins_with(SK, "MODEL#")` cannot match `AMODEL#...`
 * or `PMODEL#...` — the `#` is part of the prefix — so each screen queries
 * only its own range. `keys.test.ts` pins every direction.
 *
 * **Rack models are not here.** A rack that is actually on sale is a
 * `ProductVariant` on the single `category: "racks"` product, carrying its
 * frozen price and the `build` that produced it. The rate card computes
 * prices; the product catalogue owns what is sold. Keeping models out of this
 * partition is what stops there being two answers to "what racks do we sell".
 */
const RACKSPEC = "RACKSPEC" as const;

/** Singleton. `heightsFt` is a list of numbers rather than a string so the
 *  form parses once, on write, instead of at every read site. */
export const RackSettingsEntity = new Entity(
  {
    model: { ...model, entity: "rackSettings" },
    attributes: {
      boltSetPrice: { type: "number", required: true },
      bushPrice: { type: "number", required: true },
      legsPerRack: { type: "number", required: true },
      boltSetsPerShelf: { type: "number", required: true },
      bushesPerRack: { type: "number", required: true },
      heightsFt: { type: "list", required: true, items: { type: "number" } },
      markupPercent: { type: "number", required: true },
      roundUpToNearest: { type: "number", required: true },
      angleWidthCm: { type: "number" },
      angleStackCm: { type: "number" },
    },
    indexes: {
      single: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: [], template: "SETTINGS", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/** One row per shelf size the vendor sells. Priced per size, not per square
 *  foot — the vendor's figures are not linear in area (see `ShelfPlate`). */
export const ShelfPlateEntity = new Entity(
  {
    model: { ...model, entity: "shelfPlate" },
    attributes: {
      id: { type: "string", required: true },
      depthFt: { type: "number", required: true },
      lengthFt: { type: "number", required: true },
      thicknessMm: { type: "number", required: true },
      capacityKg: { type: "number", required: true },
      price: { type: "number", required: true },
      active: { type: "boolean", required: true },
      gramsPerShelf: { type: "number" },
      packedCm: { type: "number" },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "PLATE#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/** One row per angle grade. `colours` lives here, not on the rack, because the
 *  vendor couples gauge and colour.
 *
 *  `finish` was removed on 17 Sep 2026 — every rack is powder-coated, so the
 *  attribute had one value. Rows written before then still carry it in
 *  DynamoDB; ElectroDB ignores attributes absent from the schema on read, and
 *  the next `put` drops it. */
export const AngleGradeEntity = new Entity(
  {
    model: { ...model, entity: "angleGrade" },
    attributes: {
      id: { type: "string", required: true },
      thicknessMm: { type: "number", required: true },
      colours: { type: "list", required: true, items: { type: "string" } },
      ratePerFt: { type: "number", required: true },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "ANGLE#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * A rack on sale — SPEC §19.
 *   PK = RACKSPEC   SK = MODEL#<id>
 *
 * Same partition as the rate card it is priced from, so one more small Query
 * returns the whole rack screen's data.
 *
 * The key carried a `sortOrder` prefix until 17 Sep 2026, so that DynamoDB
 * returned models in display order without the app re-sorting. Display order
 * is now **derived** from the config — shortest rack first — which is not
 * expressible in a key, so the app sorts. That is free at this scale: a rack
 * range is a handful of rows, not a page of them.
 *
 * **Not a `ProductVariant`.** A rack model becomes a purchasable variant when
 * the customer view is built; until then, projecting it into the product
 * catalogue would leave `build` metadata on `ProductEntity` that nothing
 * reads. One home now, and the projection is a deliberate later step.
 */
export const RackModelEntity = new Entity(
  {
    model: { ...model, entity: "rackModel" },
    attributes: {
      id: { type: "string", required: true },
      config: {
        type: "map",
        required: true,
        properties: {
          heightFt: { type: "number", required: true },
          shelves: { type: "number", required: true },
          plateId: { type: "string", required: true },
          angleId: { type: "string", required: true },
          /* No `colour`: it left the config on 17 Sep 2026 because the angle
             grade already lists the colours it comes in, and they apply to
             every rack built on it. Rows written before then still carry it;
             ElectroDB ignores attributes absent from the schema. */
        },
      },
      /** Frozen at publish. See `RackModel` for why it is not derived. */
      price: { type: "number", required: true },
      costAtPublish: { type: "number", required: true },
      publishedAt: { type: "string", required: true },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "MODEL#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * A footprint for the open-frame range — SPEC §20.
 *   PK = RACKSPEC   SK = FRAME#<id>
 *
 * **No `price` and no `capacityKg`**, which is the whole difference from
 * `ShelfPlateEntity`. An open frame is not a bought part: it is
 * `3 × length + 2 × depth` feet of angle, priced from the grade's rate per
 * foot, so a stored price would be a stored answer to a sum — the thing this
 * partition exists to avoid. And there is no deck to rate for load.
 */
export const FrameSizeEntity = new Entity(
  {
    model: { ...model, entity: "frameSize" },
    attributes: {
      id: { type: "string", required: true },
      depthFt: { type: "number", required: true },
      lengthFt: { type: "number", required: true },
      active: { type: "boolean", required: true },
      gramsPerShelf: { type: "number" },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "FRAME#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * An open-frame rack on sale — SPEC §20.
 *   PK = RACKSPEC   SK = AMODEL#<id>
 *
 * Same shape as `RackModelEntity` with `frameId` in place of `plateId`, and a
 * separate entity rather than an optional field on that one: a row carrying
 * `plateId?` and `frameId?` would be a row where neither is guaranteed, and
 * the pricing formula that applies is decided by which one is set. Two
 * entities make that a type-level fact rather than a runtime check.
 *
 * `AMODEL#` and not `ANGLEMODEL#` because `ANGLE#` is already the grade
 * prefix, and two prefixes where one is nearly the other is a `begins_with`
 * bug waiting to be written.
 */
export const AngleRackModelEntity = new Entity(
  {
    model: { ...model, entity: "angleRackModel" },
    attributes: {
      id: { type: "string", required: true },
      config: {
        type: "map",
        required: true,
        properties: {
          heightFt: { type: "number", required: true },
          shelves: { type: "number", required: true },
          frameId: { type: "string", required: true },
          angleId: { type: "string", required: true },
        },
      },
      /** Frozen at publish, for the reasons on `RackModel`. */
      price: { type: "number", required: true },
      costAtPublish: { type: "number", required: true },
      publishedAt: { type: "string", required: true },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "AMODEL#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/* ────────────────────────── UPVC pipe racks ─────────────────────────── */

/**
 * The pipe range's own material rates — SPEC §21.
 *   PK = RACKSPEC   SK = PIPESETTINGS
 *
 * A **second settings row**, not three more attributes on
 * `RackSettingsEntity`, and the split is along a real seam: `SETTINGS` holds
 * what every range shares — the corner leg count, the heights on sale, markup
 * and rounding — while this holds what only this range buys. Pipe, connectors
 * and pipe bushes appear in no other bill, so on the shared row they would be
 * three fields the plated rates form neither renders nor writes, which is the
 * unread schema field the project rules say to cut.
 *
 * `PIPESETTINGS` rather than `PIPE#SETTINGS`, so it cannot be caught by the
 * `begins_with(SK, "PIPESIZE#")` that lists the footprints. `keys.test.ts`
 * pins that none of the five prefixes on this partition can match another.
 */
export const PipeSettingsEntity = new Entity(
  {
    model: { ...model, entity: "pipeSettings" },
    attributes: {
      ratePerFt: { type: "number", required: true },
      connectorPrice: { type: "number", required: true },
      /** Per **leg**, unlike `RackSettings.bushPrice` which is per rack at a
       *  fixed four. A 4 ft pipe rack carries a middle support, so six. */
      bushPrice: { type: "number", required: true },
      pipeDiameterCm: { type: "number" },
    },
    indexes: {
      single: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: [], template: "PIPESETTINGS", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * A footprint for the pipe range — SPEC §21.
 *   PK = RACKSPEC   SK = PIPESIZE#<id>
 *
 * Same shape as `FrameSizeEntity`, and a separate list rather than a shared
 * one because the **sizes genuinely differ**: the owner dropped 1¼ ft depth
 * here and added a 2½ ft length that neither steel range offers. Sharing the
 * list would mean an `offeredIn` flag on every row, which is a worse model of
 * "these are two different product ranges" than two lists.
 *
 * No price and no capacity, for the reasons on `FrameSizeEntity`.
 */
export const PipeSizeEntity = new Entity(
  {
    model: { ...model, entity: "pipeSize" },
    attributes: {
      id: { type: "string", required: true },
      depthFt: { type: "number", required: true },
      lengthFt: { type: "number", required: true },
      active: { type: "boolean", required: true },
      gramsPerShelf: { type: "number" },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "PIPESIZE#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * A pipe rack on sale — SPEC §21.
 *   PK = RACKSPEC   SK = PMODEL#<id>
 *
 * The config is **three fields, not four**: there is no `angleId`, because
 * there is one pipe spec and it is white. So this range has no grade dimension
 * and no colour choice, and a footprint plus a height is the whole of a model.
 *
 * `PMODEL#` joins `MODEL#` and `AMODEL#`. None of the three can match another
 * under `begins_with` — the `#` is part of the prefix — and `keys.test.ts`
 * asserts all six directions, because the day one of them starts matching is
 * the day three rack screens show each other's racks at each other's prices.
 */
export const PipeRackModelEntity = new Entity(
  {
    model: { ...model, entity: "pipeRackModel" },
    attributes: {
      id: { type: "string", required: true },
      config: {
        type: "map",
        required: true,
        properties: {
          heightFt: { type: "number", required: true },
          shelves: { type: "number", required: true },
          pipeSizeId: { type: "string", required: true },
        },
      },
      /** Frozen at publish, for the reasons on `RackModel`. */
      price: { type: "number", required: true },
      costAtPublish: { type: "number", required: true },
      publishedAt: { type: "string", required: true },
      active: { type: "boolean", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: [], template: RACKSPEC, casing: "none" },
        sk: { field: "SK", composite: ["id"], template: "PMODEL#${id}", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * Singleton. Which product types the owner has switched off — SPEC §12
 * "settings". Absent entirely until the first toggle, which is why the repo
 * treats a missing row as "nothing disabled" rather than seeding one at
 * startup.
 *
 * A list of the disabled ones, not a map of every `ProductType` to a
 * boolean: `PRODUCT_TYPES` grows over time (snacks arrived after racks;
 * microgreens was there from the start), and a required map would need a
 * migration on every addition. An absent entry already means "enabled" for a
 * type that did not exist when this row was last written, which is the
 * correct default for a brand-new type.
 */
export const CatalogueVisibilityEntity = new Entity(
  {
    model: { ...model, entity: "catalogueVisibility" },
    attributes: {
      disabled: { type: "list", required: true, items: { type: "string" } },
    },
    indexes: {
      single: {
        pk: { field: "PK", composite: [], template: "CATALOGUEVISIBILITY", casing: "none" },
        sk: { field: "SK", composite: [], template: "SETTINGS", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * Singleton. Where the courier collects from, and how the owner packs —
 * SPEC §7. Absent until admin → delivery is first saved, and checkout then
 * refuses to quote rather than invent a pickup PIN or a parcel weight.
 *
 * Flat numbers rather than nested box maps, so the admin form maps one input
 * to one attribute and a partial box cannot be stored.
 */
export const ShippingSettingsEntity = new Entity(
  {
    model: { ...model, entity: "shippingSettings" },
    attributes: {
      pickupName: { type: "string", required: true },
      pickupPhone: { type: "string", required: true },
      pickupAddress: { type: "string", required: true },
      pickupCity: { type: "string", required: true },
      pickupPincode: { type: "string", required: true },
      /** Rupees, the fixed delivery fee for any order with greens in it —
       *  the owner's own same-day run, not a courier (set 23 Sep 2026). */
      greenRunFee: { type: "number", required: true },
      seedPackingGrams: { type: "number", required: true },
      /** Height one flat-packed shelf adds to a rack's box. Per-item packing
       *  lives on the tray row and the shelf-size rows, not here. */
      /** Retired 24 Sep 2026: shelf racks take their plate's `packedCm`, and
       *  angle and pipe racks pack as a bundle. Still on the stored row, so
       *  kept as an optional attribute; nothing reads or writes it. */
      shelfStackCm: { type: "number" },
      /** Where else parcels are collected from — a supplier who hands our
       *  customer's parcel straight to the courier (the owner, 24 Sep 2026).
       *  The pickup above is always `home`; these are the others. Absent on
       *  rows saved before then, read back as none. */
      origins: {
        type: "list",
        items: {
          type: "map",
          properties: {
            id: { type: "string", required: true },
            name: { type: "string", required: true },
            phone: { type: "string", required: true },
            address: { type: "string", required: true },
            city: { type: "string", required: true },
            pincode: { type: "string", required: true },
          },
        },
      },
      /** Each item's vendor pickup, keyed `rack:shelf`, `tray:<contentKey>`
       *  and so on (`originItemKey`) — set on the item's own admin screen.
       *  Checkout prices each such item from ours and from its vendor and
       *  takes the cheaper (the owner, 25 Sep 2026). */
      vendors: {
        type: "list",
        items: {
          type: "map",
          properties: {
            item: { type: "string", required: true },
            origin: { type: "string", required: true },
          },
        },
      },
      /** Retired 25 Sep 2026, the day it was added: the items checkout
       *  priced from their vendor. Checkout now compares both. Still on
       *  stored rows, so kept optional; nothing reads or writes it. */
      shipsFrom: {
        type: "list",
        items: {
          type: "map",
          properties: {
            item: { type: "string", required: true },
            origin: { type: "string", required: true },
          },
        },
      },
      updatedAt: { type: "string", required: true },
    },
    indexes: {
      single: {
        pk: { field: "PK", composite: [], template: "SHIPPING", casing: "none" },
        sk: { field: "SK", composite: [], template: "SETTINGS", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/**
 * What India Post says a PIN is — `src/lib/pincode/place.ts`.
 *   PK = PIN#<pincode>   SK = PLACE
 *
 * A cache of the Department of Posts directory, so each PIN is asked about
 * once, ever: a district does not move, and the directory's free key is
 * rate-limited. Only a found answer is stored — "unknown" or "did not
 * answer" may be wrong tomorrow.
 *
 * Shares its partition with SPEC §4's `PIN#<pincode> / META`, the delivery
 * allowlist row it will sit beside when that moves out of `brand.ts`. A
 * different SK, so neither can overwrite the other, and one partition holds
 * everything known about one PIN.
 */
export const PinPlaceEntity = new Entity(
  {
    model: { ...model, entity: "pinPlace" },
    attributes: {
      pincode: { type: "string", required: true },
      district: { type: "string", required: true },
      state: { type: "string", required: true },
      fetchedAt: { type: "string", required: true },
    },
    indexes: {
      byPin: {
        pk: { field: "PK", composite: ["pincode"], template: "PIN#${pincode}", casing: "none" },
        sk: { field: "SK", composite: [], template: "PLACE", casing: "none" },
      },
    },
  },
  catalogueConfig,
);

/* ─────────────────────────────── Orders ─────────────────────────────── */

/** An unpaid order is a checkout somebody may never finish. It belongs in the
 *  admin's status list and nowhere else — not on the delivery run, and not in
 *  the customer's history. */
const placed = (attr: Record<string, unknown>) => attr.status !== "pending_payment";

/**
 * One-off order — SPEC §4, §9, §13.
 *   PK = ORDER#<id>   SK = META
 *   GSI1PK = DELIVERY#<date>   GSI1SK = ORDER#<id>        (paid onwards)
 *   GSI2PK = STATUS#<status>   GSI2SK = <createdAt>
 *   GSI3PK = USER#<userId>     GSI3SK = ORDER#<createdAt> (paid onwards)
 *
 * **Lines are a list on this row, not `ITEM#<n>` rows** — a documented
 * deviation from SPEC §4. A line is never read, written or updated on its
 * own, the cart caps an order at twelve, and one row makes placing an order
 * one write and reading it one `GetItem`.
 *
 * GSI1 and GSI3 are **sparse on purpose** (`placed`): the `DELIVERY#` query
 * that builds the pick-pack list (§4.1) must not return a checkout nobody
 * paid for. So any update that moves an order out of `pending_payment` has
 * to supply `deliveryDate`, `userId` and `createdAt`, or ElectroDB cannot
 * write the keys it now owes those indexes.
 */
export const OrderEntity = new Entity(
  {
    model: { ...model, entity: "order" },
    attributes: {
      id: { type: "string", required: true },
      userId: { type: "string", required: true },
      email: { type: "string" },
      status: { type: ORDER_STATUSES, required: true },
      lines: {
        type: "list",
        required: true,
        items: {
          type: "map",
          properties: {
            kind: { type: CART_KINDS, required: true },
            key: { type: "string", required: true },
            name: { type: "string", required: true },
            units: { type: "number", required: true },
            unitPrice: { type: "number", required: true },
            lineTotal: { type: "number", required: true },
            /** Absent for a kind not sold by weight; the repo reads it back
             *  as null, never 0. */
            grams: { type: "number" },
            readyDate: { type: "string", required: true },
            sourcing: { type: ["shelf", "vendor"] as const },
          },
        },
      },
      total: { type: "number", required: true },
      /** Rupees, included in `total`. Absent on orders placed before
       *  23 Sep 2026, when delivery was free; the repo reads that as 0. */
      deliveryCharge: { type: "number" },
      /** How it travels: the owner's own run (any order with greens) or the
       *  courier. Absent on orders placed while delivery was free. */
      deliveryMethod: { type: ["own_run", "courier"] as const },
      /** The courier quote the charge came from, for the admin screen. */
      shippingQuote: {
        type: "map",
        properties: {
          courier: { type: ["delhivery", "ekart", "shiprocket"] as const, required: true },
          carrier: { type: "string" },
          serviceId: { type: "string" },
          quotedTotal: { type: "number", required: true },
          chargedGrams: { type: "number", required: true },
          zone: { type: "string", required: true },
        },
      },
      /** One per pickup — see `OrderShipment`. Absent on orders placed
       *  before 24 Sep 2026. */
      shipments: {
        type: "list",
        items: {
          type: "map",
          properties: {
            origin: {
              type: "map",
              required: true,
              properties: {
                id: { type: "string", required: true },
                name: { type: "string", required: true },
                city: { type: "string", required: true },
                pincode: { type: "string", required: true },
              },
            },
            method: { type: ["own_run", "courier"] as const, required: true },
            lines: { type: "list", required: true, items: { type: "string" } },
            charge: { type: "number", required: true },
            quote: {
              type: "map",
              properties: {
                courier: { type: ["delhivery", "ekart", "shiprocket"] as const, required: true },
                carrier: { type: "string" },
                serviceId: { type: "string" },
                quotedTotal: { type: "number", required: true },
                chargedGrams: { type: "number", required: true },
                zone: { type: "string", required: true },
              },
            },
            deliveryDate: { type: "string", required: true },
          },
        },
      },
      deliveryDate: { type: "string", required: true },
      address: {
        type: "map",
        required: true,
        properties: {
          label: { type: "string", required: true },
          recipient: { type: "string", required: true },
          phone: { type: "string", required: true },
          line1: { type: "string", required: true },
          line2: { type: "string" },
          landmark: { type: "string" },
          /** Only on orders placed before 23 Sep 2026; district replaced it. */
          city: { type: "string" },
          /** Absent on orders placed before 23 Sep 2026. */
          district: { type: "string" },
          state: { type: "string" },
          pincode: { type: "string", required: true },
          notes: { type: "string" },
          geo: {
            type: "map",
            properties: {
              lat: { type: "number", required: true },
              lng: { type: "number", required: true },
              accuracyM: { type: "number" },
            },
          },
        },
      },
      locale: { type: "string", required: true },
      provider: { type: ["cashfree"] as const, required: true },
      providerOrderId: { type: "string" },
      receiptNo: { type: "number" },
      paidAt: { type: "string" },
      createdAt: { type: "string", required: true },
      updatedAt: { type: "string", required: true },
      expiresAt: { type: "string", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "ORDER#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byDelivery: {
        index: "GSI1",
        condition: placed,
        pk: {
          field: "GSI1PK",
          composite: ["deliveryDate"],
          template: "DELIVERY#${deliveryDate}",
          casing: "none",
        },
        sk: { field: "GSI1SK", composite: ["id"], template: "ORDER#${id}", casing: "none" },
      },
      byStatus: {
        index: "GSI2",
        pk: { field: "GSI2PK", composite: ["status"], template: "STATUS#${status}", casing: "none" },
        sk: { field: "GSI2SK", composite: ["createdAt"], template: "${createdAt}", casing: "none" },
      },
      byUser: {
        index: "GSI3",
        condition: placed,
        pk: { field: "GSI3PK", composite: ["userId"], template: "USER#${userId}", casing: "none" },
        sk: {
          field: "GSI3SK",
          composite: ["createdAt"],
          template: "ORDER#${createdAt}",
          casing: "none",
        },
      },
    },
  },
  ordersConfig,
);

/**
 * One payment event from the gateway — SPEC §4, §9 ("store every payment
 * event").
 *   PK = PAYMENT#<id>   SK = META   GSI1PK = ORDER#<orderId>   GSI1SK = PAYMENT#<id>
 *
 * `id` is the gateway's attempt id **plus its status**, because one attempt
 * is reported more than once — pending, then success. Written with `create`,
 * which refuses an existing row, so a webhook delivered twice (Cashfree's
 * delivery is at-least-once) stores one row, not two.
 *
 * Shares GSI1 with the delivery run, on a different partition prefix:
 * `ORDER#` and `DELIVERY#` cannot reach each other.
 */
export const PaymentEntity = new Entity(
  {
    model: { ...model, entity: "payment" },
    attributes: {
      id: { type: "string", required: true },
      orderId: { type: "string", required: true },
      provider: { type: ["cashfree"] as const, required: true },
      providerPaymentId: { type: "string", required: true },
      status: { type: ["success", "failed", "dropped", "pending"] as const, required: true },
      amount: { type: "number", required: true },
      currency: { type: "string", required: true },
      method: { type: "string" },
      at: { type: "string" },
      /** `webhook` or `return` — which path told us, for reconciliation. */
      source: { type: ["webhook", "return"] as const, required: true },
      receivedAt: { type: "string", required: true },
    },
    indexes: {
      byId: {
        pk: { field: "PK", composite: ["id"], template: "PAYMENT#${id}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
      byOrder: {
        index: "GSI1",
        pk: { field: "GSI1PK", composite: ["orderId"], template: "ORDER#${orderId}", casing: "none" },
        sk: { field: "GSI1SK", composite: ["id"], template: "PAYMENT#${id}", casing: "none" },
      },
    },
  },
  ordersConfig,
);

/**
 * A named sequence — SPEC §9.1 ("keep receipt numbering sequential").
 *   PK = COUNTER#<name>   SK = META
 *
 * Incremented with an atomic `ADD`, so two orders paid in the same second get
 * two numbers. Drawn only when an order is paid: an abandoned checkout takes
 * nothing from the sequence, so the receipts have no gaps to explain.
 */
export const CounterEntity = new Entity(
  {
    model: { ...model, entity: "counter" },
    attributes: {
      name: { type: "string", required: true },
      value: { type: "number", required: true },
    },
    indexes: {
      byName: {
        pk: { field: "PK", composite: ["name"], template: "COUNTER#${name}", casing: "none" },
        sk: { field: "SK", composite: [], template: "META", casing: "none" },
      },
    },
  },
  ordersConfig,
);
