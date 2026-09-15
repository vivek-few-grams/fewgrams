import { describe, expect, it } from "vitest";
import { LIST_OPTS } from "@/lib/db/client";
import { TABLES } from "@/lib/ddb";
import {
  AddressEntity,
  PlanEntity,
  PlanWeekEntity,
  ProductEntity,
  ProfileEntity,
  VarietyEntity,
} from "@/lib/db/entities";

/**
 * The migration guard.
 *
 * Adopting ElectroDB was only free because the generated keys are identical
 * to the ones the hand-written repositories produced — the key strings below
 * are copied from SPEC §4 and from the pre-ElectroDB repo code, not from
 * ElectroDB's output. If a schema edit changes a prefix, drops a `casing`,
 * or loses the `sortOrder` padding, these fail rather than silently orphaning
 * every existing row.
 *
 * `.params()` builds the request without sending it, so none of this needs a
 * running DynamoDB.
 */

/* No `name`: a variety carries no text in DynamoDB as of 15 Sep 2026 — it
   lives in content/varieties/<contentKey>.json (SPEC §4.3). */
const variety = {
  id: "radish",
  contentKey: "radish",
  pricePer100g: 90,
  yieldGramsPerTray: 300,
  growDays: 7,
  active: true,
};

describe("table routing — SPEC §4.6", () => {
  it("sends every catalogue entity to the catalogue table", () => {
    // The table name is a property of the entity schema, not of the call
    // site, so this is the guard against an entity being repointed by
    // accident — a write landing in the wrong table would not error.
    expect(VarietyEntity.put(variety).params().TableName).toBe(TABLES.catalogue);
    expect(PlanWeekEntity.put({ planId: "p", week: 1, varietyKeys: [] }).params().TableName).toBe(
      TABLES.catalogue,
    );
  });

  it("names the three tables from one prefix", () => {
    expect(Object.values(TABLES)).toEqual([
      "fewgrams-users",
      "fewgrams-catalogue",
      "fewgrams-orders",
    ]);
  });
});

describe("variety keys", () => {
  it("writes PK=VARIETY#<id> SK=META GSI1PK=VARIETY GSI1SK=<contentKey>", () => {
    const { Item } = VarietyEntity.put(variety).params();
    expect(Item.PK).toBe("VARIETY#radish");
    expect(Item.SK).toBe("META");
    expect(Item.GSI1PK).toBe("VARIETY");
    expect(Item.GSI1SK).toBe("radish");
  });

  it("reads a single variety by id off the base table", () => {
    const { Key } = VarietyEntity.get({ id: "radish" }).params();
    expect(Key).toEqual({ PK: "VARIETY#radish", SK: "META" });
  });

  it("lists varieties with a GSI1 Query, not a Scan", () => {
    const params = VarietyEntity.query.byCatalogue({}).params();
    expect(params.IndexName).toBe("GSI1");
    expect(params.KeyConditionExpression).toContain("#pk = :pk");
    expect(Object.values(params.ExpressionAttributeValues)).toContain("VARIETY");
  });

  it("returns rows that were not written through ElectroDB", async () => {
    // The regression guard for the trap documented in src/lib/db/client.ts.
    //
    // ElectroDB stamps `__edb_e__` / `__edb_v__` onto rows it writes and, by
    // default, discards rows on read that do not carry its stamp. That default
    // would hide every row written by @auth/dynamodb-adapter and every row
    // written before ElectroDB arrived. The filtering happens when the
    // response is formatted, not as a `FilterExpression`, so inspecting
    // `.params()` does not reveal it — this has to go through `.go()` with a
    // stub client returning an unstamped row.
    const unstamped = {
      PK: "VARIETY#radish",
      SK: "META",
      GSI1PK: "VARIETY",
      GSI1SK: "radish",
      id: "radish",
      contentKey: "radish",
      pricePer100g: 60,
      yieldGramsPerTray: 300,
      growDays: 7,
      active: true,
    };
    const stub = {
      send: () => Promise.resolve({ Items: [unstamped], Count: 1 }),
    } as never;

    const kept = await VarietyEntity.query
      .byCatalogue({})
      .go({ ...LIST_OPTS, client: stub });
    expect(kept.data.map((v) => v.contentKey)).toEqual(["radish"]);

    // The other arm, so this test proves the mechanism rather than just the
    // happy path: drop the option and ElectroDB silently returns nothing,
    // even though the entity config sets `ignoreOwnership` at the entity level.
    const dropped = await VarietyEntity.query.byCatalogue({}).go({ client: stub });
    expect(dropped.data).toEqual([])
  });
});

describe("product keys", () => {
  it("writes PK=PRODUCT#<id> and GSI1PK=CAT#<category>", () => {
    const { Item } = ProductEntity.put({
      id: "tray-1020",
      slug: "tray-1020",
      category: "trays",
      name: { en: "10x20 tray" },
      basePrice: 180,
      variants: [
        {
          sku: "TRAY-1020-PP",
          attributes: { material: "PP", size: "10x20" },
          price: 180,
          active: true,
        },
      ],
      active: true,
    }).params();
    expect(Item.PK).toBe("PRODUCT#tray-1020");
    expect(Item.SK).toBe("META");
    expect(Item.GSI1PK).toBe("CAT#trays");
    expect(Item.GSI1SK).toBe("tray-1020");
    expect(Item.variants[0].attributes).toEqual({ material: "PP", size: "10x20" });
  });
});

describe("plan keys", () => {
  const plan = {
    id: "essential",
    contentKey: "essential",
    monthlyPrice: 1200,
    gramsPerBox: 400,
    recommended: true,
    sortOrder: 2,
    active: true,
  };

  /* `contentKey` replaced `slug` when plan copy moved to content files
     (15 Sep 2026). It is the same string in the same position, so no existing
     row moves — this is the assertion that says so, and the reason the swap
     needed no migration. */
  it("writes PK=PLAN#<id> and GSI1SK=<padded sortOrder>#<contentKey>", () => {
    const { Item } = PlanEntity.put(plan).params();
    expect(Item.PK).toBe("PLAN#essential");
    expect(Item.SK).toBe("META");
    expect(Item.GSI1PK).toBe("PLAN");
    expect(Item.GSI1SK).toBe("002#essential");
  });

  it("pads sortOrder so plan 10 sorts after plan 2", () => {
    const two = PlanEntity.put({ ...plan, sortOrder: 2 }).params().Item.GSI1SK;
    const ten = PlanEntity.put({ ...plan, sortOrder: 10 }).params().Item.GSI1SK;
    expect(two < ten).toBe(true);
  });

  it("stores no monthlyPrice for Build Your Own", () => {
    const { Item } = PlanEntity.put({ ...plan, monthlyPrice: undefined }).params();
    expect("monthlyPrice" in Item).toBe(false);
  });
});

describe("plan week keys", () => {
  it("writes PK=PLAN#<planId> SK=WEEK#<n>", () => {
    const { Item } = PlanWeekEntity.put({
      planId: "essential",
      week: 2,
      varietyKeys: ["radish", "mustard"],
    }).params();
    expect(Item.PK).toBe("PLAN#essential");
    expect(Item.SK).toBe("WEEK#2");
  });

  it("returns the whole rotation with begins_with on the plan partition", () => {
    const params = PlanWeekEntity.query.byPlan({ planId: "essential" }).params();
    expect(params.IndexName).toBeUndefined();
    expect(params.KeyConditionExpression).toContain("begins_with");
    expect(Object.values(params.ExpressionAttributeValues)).toContain("WEEK#");
  });
});

/**
 * Profile and address rows share the Auth.js partition, so their keys are the
 * one place a mistake would be invisible: a wrong SK prefix writes a row that
 * nothing reads, and a stray GSI1PK would land in the middle of the adapter's
 * email index.
 */
describe("profile and address keys — SPEC §4", () => {
  const profile = { userId: "u1", name: "Vivek", updatedAt: "2026-09-15T00:00:00.000Z" };

  const address = {
    userId: "u1",
    addrId: "a1",
    label: "Home",
    recipient: "Vivek",
    phone: "9845012345",
    line1: "12, Green Court",
    city: "Bengaluru",
    pincode: "560038",
    isDefault: true,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };

  it("writes PK=USER#<id> SK=PROFILE", () => {
    const { Item, TableName } = ProfileEntity.put(profile).params();
    expect(Item.PK).toBe("USER#u1");
    expect(Item.SK).toBe("PROFILE");
    expect(TableName).toBe(TABLES.users);
  });

  it("writes PK=USER#<id> SK=ADDR#<addrId>", () => {
    const { Item, TableName } = AddressEntity.put(address).params();
    expect(Item.PK).toBe("USER#u1");
    expect(Item.SK).toBe("ADDR#a1");
    expect(TableName).toBe(TABLES.users);
  });

  /**
   * GSI1 on the users table belongs to @auth/dynamodb-adapter's
   * `EMAIL#<email>` lookup. Neither entity declares a GSI1 index, so neither
   * may write its key attributes — a profile row appearing in that index
   * would be returned by the adapter's getUserByEmail query.
   */
  it("keeps both entities out of the adapter's email index", () => {
    for (const { Item } of [
      ProfileEntity.put(profile).params(),
      AddressEntity.put(address).params(),
    ]) {
      expect(Item.GSI1PK).toBeUndefined();
      expect(Item.GSI1SK).toBeUndefined();
    }
  });

  /**
   * The query that makes the shared partition workable: listing one
   * customer's addresses must not also return their profile, session,
   * account or user rows.
   */
  it("lists addresses with begins_with(SK, 'ADDR#')", () => {
    const params = AddressEntity.query.byUser({ userId: "u1" }).params();
    expect(params.KeyConditionExpression).toContain("begins_with");
    expect(Object.values(params.ExpressionAttributeValues)).toContain("ADDR#");
    expect(Object.values(params.ExpressionAttributeValues)).toContain("USER#u1");
  });
});
