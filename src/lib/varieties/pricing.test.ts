import { describe, expect, it } from "vitest";
import { DEFAULT_COSTING, cocopeatPerTray, varietyCost, varietyPrice } from "./pricing";

/** Cabbage on 18 Oct 2026: 18 g of seed at ₹225 per 100 g, one tray, 100 g cut. */
const cabbage = { seedGramsPerTray: 18, yieldGramsPerTrayMin: 100 };

describe("microgreens pricing", () => {
  it("costs a tray as seed + cocopeat + power and water", () => {
    const r = varietyCost(cabbage, 225, DEFAULT_COSTING);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cost.seed).toBeCloseTo(40.5);
    expect(r.cost.cocopeat).toBeCloseTo(18.75); // ₹300 ÷ 16 trays
    expect(r.cost.overhead).toBe(30);
    expect(r.cost.tray).toBeCloseTo(89.25);
  });

  it("spreads a tray over its low yield, in 100 g", () => {
    const one = varietyCost(cabbage, 225, DEFAULT_COSTING);
    const radish = varietyCost({ seedGramsPerTray: 33, yieldGramsPerTrayMin: 330 }, 50, DEFAULT_COSTING);
    expect(one.ok && one.cost.per100g).toBeCloseTo(89.25);
    /* 16.5 + 18.75 + 30 = 65.25 a tray, cut into 3.3 boxes. */
    expect(radish.ok && radish.cost.per100g).toBeCloseTo(19.77, 2);
  });

  it("prices 100 g with the margin, rounding up", () => {
    const margin = { markupPercent: 50, roundUpToNearest: 5 };
    /* 89.25 × 1.5 = 133.875 → ₹135. */
    expect(varietyPrice(cabbage, 225, { ...DEFAULT_COSTING, margin })).toEqual({
      pricePer100g: 135,
      costPer100g: 89.25,
    });
    /* No margin saved yet: at cost, to the rupee. */
    expect(varietyPrice(cabbage, 225, DEFAULT_COSTING).pricePer100g).toBe(90);
  });

  it("follows the costing — a dearer block, more trays to it, more power", () => {
    expect(cocopeatPerTray({ ...DEFAULT_COSTING, cocopeatBlockCost: 320 })).toBe(20);
    expect(cocopeatPerTray({ ...DEFAULT_COSTING, traysPerBlock: 20 })).toBe(15);
    const r = varietyCost(cabbage, 225, { ...DEFAULT_COSTING, overheadPerTray: 40 });
    expect(r.ok && r.cost.tray).toBeCloseTo(99.25);
  });

  it("refuses a price it cannot work out, and says why", () => {
    expect(varietyCost({ yieldGramsPerTrayMin: 100 }, 225, DEFAULT_COSTING)).toEqual({
      ok: false,
      reason: "noSeedRate",
    });
    expect(varietyCost(cabbage, undefined, DEFAULT_COSTING)).toEqual({ ok: false, reason: "noSeedCost" });
    expect(varietyCost(cabbage, 0, DEFAULT_COSTING)).toEqual({ ok: false, reason: "noSeedCost" });
    expect(varietyCost({ seedGramsPerTray: 18, yieldGramsPerTrayMin: 0 }, 225, DEFAULT_COSTING)).toEqual({
      ok: false,
      reason: "noYield",
    });
    /* And an unpriceable variety stores a price of 0 — off sale — with no cost. */
    expect(varietyPrice({ yieldGramsPerTrayMin: 100 }, 225, DEFAULT_COSTING)).toEqual({ pricePer100g: 0 });
  });
});
