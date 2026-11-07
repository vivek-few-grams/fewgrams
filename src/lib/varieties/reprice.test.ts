import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sowing, Variety } from "@/lib/types";
import { DEFAULT_COSTING } from "./pricing";

/* What the index answers — set per test to the state *before* the write the
   caller has just made, which is what GSI1 can still return on AWS. */
let listed: Variety[] = [];
let seeds: { contentKey: string; costPer100g?: number }[] = [];
let sowings: Sowing[] = [];
const written: { id: string; price: { pricePer100g: number; costPer100g?: number } }[] = [];

vi.mock("@/lib/repo/varieties", () => ({
  listVarieties: async () => listed,
  getVarietyCosting: async () => DEFAULT_COSTING,
  setVarietyPrice: async (id: string, price: { pricePer100g: number; costPer100g?: number }) => {
    written.push({ id, price });
  },
}));
vi.mock("@/lib/repo/seeds", () => ({ listSeeds: async () => seeds }));
vi.mock("@/lib/repo/sowings", () => ({ listSowings: async () => sowings }));

const { pricingInputs, repriceVarieties } = await import("./reprice");

/** Cabbage on 18 Oct 2026 (pricing.test.ts): 18 g of seed a tray, 100 g cut. */
const cabbage: Variety = {
  id: "v-cabbage",
  contentKey: "cabbage",
  pricePer100g: 0,
  yieldGramsPerTrayMin: 100,
  yieldGramsPerTrayMax: 150,
  growDays: 9,
  seedGramsPerTray: 18,
  active: true,
};

/** A sowing of one cabbage tray, harvested at `grams`. */
const sowingOf = (id: string, grams: number, extra: Partial<Sowing["lines"][number]> = {}): Sowing => ({
  id,
  sowDate: "2026-10-10",
  lines: [{ varietyKey: "cabbage", seedGrams: 18, trays: 1, harvestGrams: grams, harvestedOn: "2026-10-18", ...extra }],
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
});

beforeEach(() => {
  listed = [];
  seeds = [];
  sowings = [];
  written.length = 0;
});

describe("pricingInputs", () => {
  it("lays a row just written over the listed one of the same id", () => {
    const stale = { ...cabbage, growDays: 5 };
    const { varieties } = pricingInputs([stale], [], { varieties: [cabbage] });
    expect(varieties).toEqual([cabbage]);
  });

  it("adds a row the index has not shown yet", () => {
    const radish = { ...cabbage, id: "v-radish", contentKey: "radish" };
    const { varieties } = pricingInputs([cabbage], [], { varieties: [radish] });
    expect(varieties.map((v) => v.id)).toEqual(["v-cabbage", "v-radish"]);
  });

  it("takes a seed cost just written, and a removed seed as no cost", () => {
    const { seedCost } = pricingInputs(
      [],
      [
        { contentKey: "cabbage", costPer100g: 200 },
        { contentKey: "radish", costPer100g: 50 },
      ],
      {
        seedCosts: new Map([
          ["cabbage", 225],
          ["radish", undefined],
        ]),
      },
    );
    expect(seedCost.get("cabbage")).toBe(225);
    expect(seedCost.has("radish")).toBe(true);
    expect(seedCost.get("radish")).toBeUndefined();
  });

  it("lays a sowing just saved over the listed one, and drops one just deleted", () => {
    const old = sowingOf("s1", 50);
    const saved = sowingOf("s1", 100);
    const other = sowingOf("s2", 120);
    const { sowings: merged } = pricingInputs([], [], { sowings: [saved], removedSowingIds: ["s2"] }, [old, other]);
    expect(merged).toEqual([saved]);
  });

  it("is the listing unchanged with nothing to override", () => {
    const s = sowingOf("s1", 100);
    const { varieties, seedCost, sowings: same } = pricingInputs(
      [cabbage],
      [{ contentKey: "cabbage", costPer100g: 225 }],
      {},
      [s],
    );
    expect(varieties).toEqual([cabbage]);
    expect(seedCost.get("cabbage")).toBe(225);
    expect(same).toEqual([s]);
  });
});

describe("repriceVarieties", () => {
  it("prices from a harvest the index has not caught up with", async () => {
    /* The index still lists the sowing with nothing cut; the save just
       recorded 100 g. */
    listed = [cabbage];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [{ ...sowingOf("s1", 0), lines: [{ varietyKey: "cabbage", seedGrams: 18, trays: 1 }] }];
    await repriceVarieties(["cabbage"], { sowings: [sowingOf("s1", 100)] });
    /* 40.5 + 18.75 + 30 + 10 = 99.25, one tray a box, + 30 packing =
       129.25, no margin: ₹130. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 130, costPer100g: 129.25 } }]);
  });

  it("leaves out a harvest whose tick is off, and takes the variety off sale with none left", async () => {
    listed = [{ ...cabbage, pricePer100g: 130, costPer100g: 129.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(["cabbage"], { sowings: [sowingOf("s1", 100, { countsForYield: false })] });
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 0 } }]);
  });

  it("takes a variety off sale when the sowing that proved it is deleted", async () => {
    listed = [{ ...cabbage, pricePer100g: 130, costPer100g: 129.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(["cabbage"], { removedSowingIds: ["s1"] });
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 0 } }]);
  });

  it("averages trays across sowings, weighted by trays", async () => {
    listed = [cabbage];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    /* 1 tray at 100 g and 2 trays at 160 g (two-tray line, 320 g): 420 g over
       3 trays = 140 g a tray. */
    sowings = [
      sowingOf("s1", 100),
      { ...sowingOf("s2", 320), lines: [{ varietyKey: "cabbage", seedGrams: 36, trays: 2, harvestGrams: 320, harvestedOn: "2026-10-18" }] },
    ];
    await repriceVarieties(["cabbage"]);
    /* ₹99.25 a tray × 100/140 = ₹70.89 + 30 = ₹100.89 → ₹101. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 101, costPer100g: 100.89 } }]);
  });

  it("prices a variety added a moment ago", async () => {
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(["cabbage"], { varieties: [cabbage] });
    expect(written.map((w) => w.id)).toEqual(["v-cabbage"]);
  });

  it("prices from a seed cost a bill has just set", async () => {
    listed = [{ ...cabbage, pricePer100g: 130, costPer100g: 129.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(["cabbage"], { seedCosts: new Map([["cabbage", 325]]) });
    /* 58.5 + 18.75 + 30 + 10 = 117.25, + 30 packing = 147.25 → ₹148. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 148, costPer100g: 147.25 } }]);
  });

  it("takes a green off sale when its seed has just been deleted", async () => {
    listed = [{ ...cabbage, pricePer100g: 130, costPer100g: 129.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(["cabbage"], { seedCosts: new Map([["cabbage", undefined]]) });
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 0 } }]);
  });

  it("prices from the costing just saved, minimum profit included", async () => {
    listed = [{ ...cabbage, pricePer100g: 130, costPer100g: 129.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(undefined, { costing: { ...DEFAULT_COSTING, minProfitPerBox: 70 } });
    /* ₹129.25 + ₹70 = ₹199.25 → ₹200. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 200, costPer100g: 129.25 } }]);
  });

  it("writes nothing when the price has not moved", async () => {
    listed = [{ ...cabbage, pricePer100g: 130, costPer100g: 129.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    sowings = [sowingOf("s1", 100)];
    await repriceVarieties(["cabbage"]);
    expect(written).toEqual([]);
  });
});
