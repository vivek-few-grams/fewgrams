import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Variety } from "@/lib/types";
import { DEFAULT_COSTING } from "./pricing";

/* What the index answers — set per test to the state *before* the write the
   caller has just made, which is what GSI1 can still return on AWS. */
let listed: Variety[] = [];
let seeds: { contentKey: string; costPer100g?: number }[] = [];
const written: { id: string; price: { pricePer100g: number; costPer100g?: number } }[] = [];

vi.mock("@/lib/repo/varieties", () => ({
  listVarieties: async () => listed,
  getVarietyCosting: async () => DEFAULT_COSTING,
  setVarietyPrice: async (id: string, price: { pricePer100g: number; costPer100g?: number }) => {
    written.push({ id, price });
  },
}));
vi.mock("@/lib/repo/seeds", () => ({ listSeeds: async () => seeds }));

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

beforeEach(() => {
  listed = [];
  seeds = [];
  written.length = 0;
});

describe("pricingInputs", () => {
  it("lays a row just written over the listed one of the same id", () => {
    const stale = { ...cabbage, yieldGramsPerTrayMin: 50 };
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

  it("is the listing unchanged with nothing to override", () => {
    const { varieties, seedCost } = pricingInputs([cabbage], [{ contentKey: "cabbage", costPer100g: 225 }]);
    expect(varieties).toEqual([cabbage]);
    expect(seedCost.get("cabbage")).toBe(225);
  });
});

describe("repriceVarieties", () => {
  it("prices a new yield the index has not caught up with", async () => {
    /* The index still holds a 50 g yield; the save just wrote 100 g. */
    listed = [{ ...cabbage, yieldGramsPerTrayMin: 50 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    await repriceVarieties(["cabbage"], { varieties: [cabbage] });
    /* 40.5 + 18.75 + 30 = 89.25 over 100 g, no margin: ₹90. Over 50 g it
       would have been ₹179. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 90, costPer100g: 89.25 } }]);
  });

  it("prices a variety added a moment ago", async () => {
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    await repriceVarieties(["cabbage"], { varieties: [cabbage] });
    expect(written.map((w) => w.id)).toEqual(["v-cabbage"]);
  });

  it("prices from a seed cost a bill has just set", async () => {
    listed = [{ ...cabbage, pricePer100g: 90, costPer100g: 89.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    await repriceVarieties(["cabbage"], { seedCosts: new Map([["cabbage", 325]]) });
    /* 58.5 + 18.75 + 30 = 107.25 → ₹108. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 108, costPer100g: 107.25 } }]);
  });

  it("takes a green off sale when its seed has just been deleted", async () => {
    listed = [{ ...cabbage, pricePer100g: 90, costPer100g: 89.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    await repriceVarieties(["cabbage"], { seedCosts: new Map([["cabbage", undefined]]) });
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 0 } }]);
  });

  it("prices from the costing just saved", async () => {
    listed = [{ ...cabbage, pricePer100g: 90, costPer100g: 89.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    await repriceVarieties(undefined, { costing: { ...DEFAULT_COSTING, overheadPerTray: 40 } });
    /* 99.25 → ₹100. */
    expect(written).toEqual([{ id: "v-cabbage", price: { pricePer100g: 100, costPer100g: 99.25 } }]);
  });

  it("writes nothing when the price has not moved", async () => {
    listed = [{ ...cabbage, pricePer100g: 90, costPer100g: 89.25 }];
    seeds = [{ contentKey: "cabbage", costPer100g: 225 }];
    await repriceVarieties(["cabbage"]);
    expect(written).toEqual([]);
  });
});
