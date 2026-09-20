import { describe, expect, it } from "vitest";
import { LIST_OPTS } from "@/lib/db/client";
import { TABLES } from "@/lib/ddb";
import {
  AddressEntity,
  AngleGradeEntity,
  AngleRackModelEntity,
  CatalogueVisibilityEntity,
  PlanEntity,
  PlanWeekEntity,
  ProductEntity,
  ProfileEntity,
  FrameSizeEntity,
  PipeRackModelEntity,
  PipeSettingsEntity,
  PipeSizeEntity,
  RackModelEntity,
  RackSettingsEntity,
  SeedEntity,
  TrayEntity,
  ShelfPlateEntity,
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
  pricePerTray: 90,
  yieldGramsPerTrayMin: 250,
  yieldGramsPerTrayMax: 350,
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
      pricePerTray: 60,
      yieldGramsPerTrayMin: 250,
      yieldGramsPerTrayMax: 350,
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

describe("seed keys", () => {
  const seed = {
    id: "0f2a-uuid",
    contentKey: "radish",
    pricePer100g: 40,
    stockGrams: 2500,
    active: true,
  };

  it("writes PK=SEED#<id> SK=META GSI1PK=SEED GSI1SK=<contentKey>", () => {
    const { Item } = SeedEntity.put(seed).params();
    expect(Item.PK).toBe("SEED#0f2a-uuid");
    expect(Item.SK).toBe("META");
    expect(Item.GSI1PK).toBe("SEED");
    expect(Item.GSI1SK).toBe("radish");
  });

  it("goes to the catalogue table", () => {
    expect(SeedEntity.put(seed).params().TableName).toBe(TABLES.catalogue);
  });

  it("lists seeds with a GSI1 Query, not a Scan", () => {
    const params = SeedEntity.query.byCatalogue({}).params();
    expect(params.IndexName).toBe("GSI1");
    expect(params.KeyConditionExpression).toContain("#pk = :pk");
    expect(Object.values(params.ExpressionAttributeValues)).toContain("SEED");
  });

  /**
   * The collision this key layout has to survive.
   *
   * `radish` is a microgreen you eat and a seed you sow — two products, two
   * content files, two prices. They share a content key by design, so the keys
   * have to keep them apart: different base-table partitions, and different
   * GSI1 partitions so neither list can ever return the other's rows.
   */
  it("keeps a seed and a variety with the same content key apart", () => {
    const seedItem = SeedEntity.put(seed).params().Item;
    const varietyItem = VarietyEntity.put(variety).params().Item;

    expect(seedItem.GSI1SK).toBe(varietyItem.GSI1SK);
    expect(seedItem.PK).not.toBe(varietyItem.PK);
    expect(seedItem.GSI1PK).not.toBe(varietyItem.GSI1PK);

    /* And the GSI1 partitions are exact-match, never `begins_with`, so
       "SEED" cannot be caught by a query for "VARIETY" or the reverse. */
    const seedQuery = SeedEntity.query.byCatalogue({}).params();
    const varietyQuery = VarietyEntity.query.byCatalogue({}).params();
    expect(seedQuery.KeyConditionExpression).not.toContain("begins_with");
    expect(varietyQuery.KeyConditionExpression).not.toContain("begins_with");
  });

  it("stores zero grams rather than dropping the attribute", () => {
    /* Zero is a real state: an empty shelf, where every order is bought in
       (SPEC §22.2). If the marshaller or the schema treated it as absent, the
       row would read back with no stock figure at all, and `seedSourcing`
       would be deciding a delivery date from `undefined`. */
    const { Item } = SeedEntity.put({ ...seed, stockGrams: 0 }).params();
    expect(Item.stockGrams).toBe(0);
  });
});

describe("tray keys", () => {
  const tray = {
    id: "8b41-uuid",
    contentKey: "drain-cell-mat",
    price: 300,
    leadDays: 7,
    active: true,
  };

  it("writes PK=TRAY#<id> SK=META GSI1PK=TRAY GSI1SK=<contentKey>", () => {
    const { Item } = TrayEntity.put(tray).params();
    expect(Item.PK).toBe("TRAY#8b41-uuid");
    expect(Item.SK).toBe("META");
    expect(Item.GSI1PK).toBe("TRAY");
    expect(Item.GSI1SK).toBe("drain-cell-mat");
  });

  it("goes to the catalogue table", () => {
    expect(TrayEntity.put(tray).params().TableName).toBe(TABLES.catalogue);
  });

  it("lists trays with a GSI1 Query, not a Scan", () => {
    const params = TrayEntity.query.byCatalogue({}).params();
    expect(params.IndexName).toBe("GSI1");
    expect(params.KeyConditionExpression).toContain("#pk = :pk");
    expect(Object.values(params.ExpressionAttributeValues)).toContain("TRAY");
  });

  /**
   * `content/trays/` is its own namespace, like `content/seeds/`. Nothing
   * shares a key across the two today, but the whole point of separate
   * namespaces is that one could — so the keys have to keep any such pair
   * apart on both the base table and GSI1, exactly as they do for a seed and
   * a variety.
   */
  it("keeps a tray and a seed with the same content key apart", () => {
    const trayItem = TrayEntity.put({ ...tray, contentKey: "radish" }).params().Item;
    const seedItem = SeedEntity.put({
      id: "0f2a-uuid",
      contentKey: "radish",
      pricePer100g: 40,
      stockGrams: 200,
      active: true,
    }).params().Item;

    expect(trayItem.GSI1SK).toBe(seedItem.GSI1SK);
    expect(trayItem.PK).not.toBe(seedItem.PK);
    expect(trayItem.GSI1PK).not.toBe(seedItem.GSI1PK);

    /* Exact-match partitions, never `begins_with`, so "TRAY" cannot catch a
       "SEED" row or the reverse. */
    expect(
      TrayEntity.query.byCatalogue({}).params().KeyConditionExpression,
    ).not.toContain("begins_with");
  });

  /** There is no stock attribute to lose here, which is the point — but the
   *  lead time is the figure the customer-facing date is computed from, so it
   *  must survive the round trip as a number rather than a string. */
  it("stores the lead time as a number", () => {
    const { Item } = TrayEntity.put(tray).params();
    expect(Item.leadDays).toBe(7);
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

/**
 * Rack rate card — SPEC §19.
 *
 * Six entities share one partition, which is the whole reason the rack screens
 * are cheap to load. These pin that they really do share it, and that each
 * one's sort-key prefix is distinct enough that listing plates cannot also
 * return angles, settings, footprints or either kind of model.
 */
describe("rack rate card keys — SPEC §19", () => {
  const plate = {
    id: "p-1.25x3",
    depthFt: 1.25,
    lengthFt: 3,
    thicknessMm: 0.6,
    capacityKg: 20,
    price: 250,
    active: true,
  };
  const angle = {
    id: "a-1.4",
    thicknessMm: 1.4,
    finish: "powder" as const,
    colours: ["Orange", "Green", "Purple"],
    ratePerFt: 40,
    active: true,
  };
  const settings = {
    boltSetPrice: 2,
    bushPrice: 5,
    legsPerRack: 4,
    boltSetsPerShelf: 8,
    bushesPerRack: 4,
    heightsFt: [3, 4, 5, 6],
    markupPercent: 0,
    roundUpToNearest: 50,
  };
  const rackModel = {
    id: "m1",
    config: { heightFt: 6, shelves: 5, plateId: plate.id, angleId: angle.id },
    price: 2350,
    costAtPublish: 2310,
    publishedAt: "2026-09-16T00:00:00.000Z",
    active: true,
  };

  it("puts the whole rate card in one partition", () => {
    for (const params of [
      RackSettingsEntity.put(settings).params(),
      ShelfPlateEntity.put(plate).params(),
      AngleGradeEntity.put(angle).params(),
      RackModelEntity.put(rackModel).params(),
    ]) {
      expect(params.Item.PK).toBe("RACKSPEC");
      expect(params.TableName).toBe(TABLES.catalogue);
    }
  });

  it("gives each kind its own sort key", () => {
    expect(RackSettingsEntity.put(settings).params().Item.SK).toBe("SETTINGS");
    expect(ShelfPlateEntity.put(plate).params().Item.SK).toBe("PLATE#p-1.25x3");
    expect(AngleGradeEntity.put(angle).params().Item.SK).toBe("ANGLE#a-1.4");
  });

  const frame = { id: "f-1x4", depthFt: 1, lengthFt: 4, active: true };
  const angleRackModel = {
    id: "a1",
    config: { heightFt: 6, shelves: 5, frameId: frame.id, angleId: angle.id },
    price: 3900,
    costAtPublish: 3860,
    publishedAt: "2026-09-17T00:00:00.000Z",
    active: true,
  };

  it("puts the open-frame range in the same partition — SPEC §20", () => {
    /* Same partition because it is priced from the same rates. A separate one
       would mean a second bolt price waiting to disagree with the first. */
    for (const params of [
      FrameSizeEntity.put(frame).params(),
      AngleRackModelEntity.put(angleRackModel).params(),
    ]) {
      expect(params.Item.PK).toBe("RACKSPEC");
      expect(params.TableName).toBe(TABLES.catalogue);
    }
  });

  it("gives the open-frame entities their own sort keys", () => {
    expect(FrameSizeEntity.put(frame).params().Item.SK).toBe("FRAME#f-1x4");
    expect(AngleRackModelEntity.put(angleRackModel).params().Item.SK).toBe("AMODEL#a1");
  });

  it("does not let either model list return the other", () => {
    /* `AMODEL#` and `MODEL#` are the one pair on this partition that could
       collide, and they do not: the `#` is part of the prefix, so
       `begins_with(SK, "MODEL#")` cannot match `AMODEL#a1`. If a future rename
       drops that `#` the two rack screens silently start showing each other's
       racks, at each other's prices. */
    expect("AMODEL#a1".startsWith("MODEL#")).toBe(false);
    expect("MODEL#m1".startsWith("AMODEL#")).toBe(false);
    /* Same for the grade list, which `ANGLEMODEL#` would have broken — hence
       the shorter prefix. */
    expect("AMODEL#a1".startsWith("ANGLE#")).toBe(false);
  });

  it("keys a model by id alone", () => {
    /* The key carried a padded `sortOrder` prefix until 17 Sep 2026, so that
       DynamoDB returned models in display order. Display order is now derived
       from the config — shortest rack first, see `listRackModels` — which a
       key cannot express, so the app sorts and the key is just an identifier. */
    expect(RackModelEntity.put(rackModel).params().Item.SK).toBe("MODEL#m1");
  });

  const pipeSettings = { ratePerFt: 25, connectorPrice: 110, bushPrice: 10 };
  const pipeSize = { id: "pp-1.5x3", depthFt: 1.5, lengthFt: 3, active: true };
  const pipeRackModel = {
    id: "p1",
    config: { heightFt: 6, shelves: 5, pipeSizeId: pipeSize.id },
    price: 7150,
    costAtPublish: 3965,
    publishedAt: "2026-09-17T00:00:00.000Z",
    active: true,
  };

  it("puts the pipe range in the same partition — SPEC §21", () => {
    for (const params of [
      PipeSettingsEntity.put(pipeSettings).params(),
      PipeSizeEntity.put(pipeSize).params(),
      PipeRackModelEntity.put(pipeRackModel).params(),
    ]) {
      expect(params.Item.PK).toBe("RACKSPEC");
      expect(params.TableName).toBe(TABLES.catalogue);
    }
  });

  it("gives the pipe entities their own sort keys", () => {
    expect(PipeSettingsEntity.put(pipeSettings).params().Item.SK).toBe("PIPESETTINGS");
    expect(PipeSizeEntity.put(pipeSize).params().Item.SK).toBe("PIPESIZE#pp-1.5x3");
    expect(PipeRackModelEntity.put(pipeRackModel).params().Item.SK).toBe("PMODEL#p1");
  });

  it("keeps all nine prefixes on this partition mutually unmatchable", () => {
    /* Every key this partition holds, against every prefix anything queries
       it with. A `begins_with` that matched the wrong one would not error —
       it would quietly serve one rack range's rows to another range's screen,
       priced by the wrong formula. The pairs that could plausibly collide:
       `MODEL#`/`AMODEL#`/`PMODEL#` all end in the same six characters, and
       `PIPESETTINGS` sits one character away from `PIPESIZE#`.

       Two keys are the reason the naming is what it is. `ANGLEMODEL#` would
       have been caught by the `ANGLE#` grade prefix, hence `AMODEL#`. And
       `PIPE#SETTINGS` would have been caught by a `PIPE#` size prefix, hence
       `PIPESETTINGS` against `PIPESIZE#`. */
    const keys = [
      "SETTINGS",
      "PLATE#p-1x3",
      "ANGLE#a-1.4",
      "FRAME#f-1x4",
      "MODEL#m1",
      "AMODEL#a1",
      "PIPESETTINGS",
      "PIPESIZE#pp-1x3",
      "PMODEL#p1",
    ];
    const prefixes = [
      "PLATE#",
      "ANGLE#",
      "FRAME#",
      "MODEL#",
      "AMODEL#",
      "PIPESIZE#",
      "PMODEL#",
    ];

    for (const prefix of prefixes) {
      const matched = keys.filter((k) => k.startsWith(prefix));
      expect(matched, `${prefix} should match exactly one key`).toHaveLength(1);
    }
    /* The two singletons are read by exact key, so what matters is that no
       list prefix sweeps them up. */
    for (const prefix of prefixes) {
      expect("SETTINGS".startsWith(prefix)).toBe(false);
      expect("PIPESETTINGS".startsWith(prefix)).toBe(false);
    }
  });

  it("lists each kind with begins_with on its own prefix", () => {
    const prefix = (params: { ExpressionAttributeValues: Record<string, unknown> }) =>
      Object.values(params.ExpressionAttributeValues);

    expect(prefix(ShelfPlateEntity.query.byId({}).params())).toContain("PLATE#");
    expect(prefix(AngleGradeEntity.query.byId({}).params())).toContain("ANGLE#");
    expect(prefix(RackModelEntity.query.byId({}).params())).toContain("MODEL#");
    expect(prefix(FrameSizeEntity.query.byId({}).params())).toContain("FRAME#");
    expect(prefix(AngleRackModelEntity.query.byId({}).params())).toContain("AMODEL#");
    expect(prefix(PipeSizeEntity.query.byId({}).params())).toContain("PIPESIZE#");
    expect(prefix(PipeRackModelEntity.query.byId({}).params())).toContain("PMODEL#");
  });

  it("keeps the rate card off GSI1, which lists the public catalogue", () => {
    // GSI1PK = CAT#racks lists what a customer can buy. A plate is a
    // component, not a product; if it landed in that index the shop page
    // would try to render it.
    for (const params of [
      ShelfPlateEntity.put(plate).params(),
      AngleGradeEntity.put(angle).params(),
      RackModelEntity.put(rackModel).params(),
      RackSettingsEntity.put(settings).params(),
      FrameSizeEntity.put(frame).params(),
      AngleRackModelEntity.put(angleRackModel).params(),
    ]) {
      expect(params.Item.GSI1PK).toBeUndefined();
    }
  });
});

describe("catalogue visibility — the product on/off switch", () => {
  it("is its own singleton, off GSI1", () => {
    const params = CatalogueVisibilityEntity.put({ disabled: ["snacks"] }).params();
    expect(params.Item.PK).toBe("CATALOGUEVISIBILITY");
    expect(params.Item.SK).toBe("SETTINGS");
    expect(params.TableName).toBe(TABLES.catalogue);
    expect(params.Item.GSI1PK).toBeUndefined();
  });
});
