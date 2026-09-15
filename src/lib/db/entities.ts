import { CustomAttributeType, Entity } from "electrodb";
import { catalogueConfig, usersConfig } from "@/lib/db/client";

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
 */
export const VarietyEntity = new Entity(
  {
    model: { ...model, entity: "variety" },
    attributes: {
      id: { type: "string", required: true },
      contentKey: { type: "string", required: true },
      pricePer100g: { type: "number", required: true },
      /** The two fields the whole operation computes from (SPEC §3.1), so
       *  both are required on every variety. */
      yieldGramsPerTray: { type: "number", required: true },
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
      city: { type: "string", required: true },
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
