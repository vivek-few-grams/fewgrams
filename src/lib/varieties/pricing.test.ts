import { describe, expect, it } from "vitest";
import type { LoggedGrowth } from "@/lib/sowing/sowing";
import type { VarietyCosting } from "@/lib/types";
import { DEFAULT_COSTING, boxPrice, cocopeatPerTray, traysPerBox, varietyCost, varietyPrice } from "./pricing";

/** One logged harvest of one tray. */
const grown = (seedGramsPerTray: number, gramsPerTray: number): LoggedGrowth => ({
  harvests: 1,
  trays: 1,
  seedGramsPerTray,
  gramsPerTray,
});

/** Cabbage on 18 Oct 2026: 18 g of seed at ₹225 per 100 g, one tray, 100 g cut. */
const cabbage = grown(18, 100);

/** The costing the owner agreed on 7 Nov 2026: ₹25 cocopeat (₹300 ÷ 12),
 *  ₹30 electricity and water, ₹10 cleaning, ₹20 + ₹10 packing, 30% rounded
 *  to ₹10, at least ₹70 a box, off sale at 60 g a tray or less. */
const OWNERS: VarietyCosting = {
  cocopeatBlockCost: 300,
  traysPerBlock: 12,
  overheadPerTray: 30,
  cleaningPerTray: 10,
  packingPer100g: 20,
  packingPerBox: 10,
  minProfitPerBox: 70,
  minYieldPerTray: 60,
  margin: { markupPercent: 30, roundUpToNearest: 10 },
};

describe("microgreens pricing", () => {
  it("costs a tray as seed + cocopeat + power and water + cleaning", () => {
    const r = varietyCost(cabbage, 225, DEFAULT_COSTING);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cost.seed).toBeCloseTo(40.5);
    expect(r.cost.cocopeat).toBeCloseTo(18.75); // ₹300 ÷ 16 trays
    expect(r.cost.overhead).toBe(30);
    expect(r.cost.cleaning).toBe(10);
    expect(r.cost.tray).toBeCloseTo(99.25);
  });

  it("shares a tray out over its yield at 100 g or more, then packs the box once", () => {
    const one = varietyCost(cabbage, 225, DEFAULT_COSTING);
    const radish = varietyCost(grown(33, 330), 50, DEFAULT_COSTING);
    expect(one.ok && one.cost.traysPerBox).toBe(1);
    expect(one.ok && one.cost.packing).toBe(30);
    expect(one.ok && one.cost.per100g).toBeCloseTo(129.25);
    /* 16.5 + 18.75 + 30 + 10 = 75.25 a tray, cut into 3.3 boxes, + 30. */
    expect(radish.ok && radish.cost.per100g).toBeCloseTo(52.8, 2);
  });

  it("charges whole trays under 100 g a tray — every tray in full, packing once", () => {
    /* 80 g a tray: a box takes two, and both are paid for. */
    const r = varietyCost(grown(20, 80), 100, DEFAULT_COSTING);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cost.traysPerBox).toBe(2);
    expect(r.cost.grown).toBeCloseTo(r.cost.tray * 2);
    expect(r.cost.per100g).toBeCloseTo(r.cost.tray * 2 + 30);
  });

  it("does not pay for a phantom tray when 100 g divides exactly", () => {
    expect(traysPerBox(50)).toBe(2);
    expect(traysPerBox(100 / 3)).toBe(3);
    expect(traysPerBox(99)).toBe(2);
    expect(traysPerBox(150)).toBeCloseTo(2 / 3);
  });

  it("takes the higher of the markup and cost plus the minimum profit", () => {
    /* ₹54.70 × 1.3 = ₹71.11 → ₹80, but ₹54.70 + ₹70 = ₹124.70 → ₹130. */
    expect(boxPrice(54.7, OWNERS)).toBe(130);
    /* ₹300 × 1.3 = ₹390 → ₹399 beats ₹300 + ₹70 → ₹379. */
    expect(boxPrice(300, OWNERS)).toBe(399);
    /* The floor rounds like the markup: ₹250 + ₹70 = ₹320 → ₹329. */
    expect(boxPrice(250, { ...OWNERS, margin: { markupPercent: 0, roundUpToNearest: 10 } })).toBe(329);
    /* No minimum: the markup alone. */
    expect(boxPrice(54.7, { ...OWNERS, minProfitPerBox: 0 })).toBe(80);
  });

  it("prices the owner's table of 7 Nov 2026 from the sowing log", () => {
    /* Radish: 33 g at ₹50 → ₹81.50 a tray, 330 g → ₹24.70 + ₹30 = ₹54.70. */
    expect(varietyPrice(grown(33, 330), 50, OWNERS)).toEqual({ pricePer100g: 130, costPer100g: 54.7 });
    /* Broccoli: 32 g at ₹230 → ₹138.60 a tray, 110 g → ₹126 + ₹30 = ₹156. */
    expect(varietyPrice(grown(32, 110), 230, OWNERS)).toEqual({ pricePer100g: 230, costPer100g: 156 });
    /* Sunflower: two trays, 150 g of seed, 600 g cut — per tray 75 g → 300 g. */
    const sunflower: LoggedGrowth = { harvests: 1, trays: 2, seedGramsPerTray: 75, gramsPerTray: 300 };
    expect(varietyPrice(sunflower, 35, OWNERS)).toEqual({ pricePer100g: 140, costPer100g: 60.42 });
  });

  it("takes a variety off sale at the yield cutoff or under it", () => {
    /* Spinach at 60 g a tray, beetroot at 10 g — the owner's cutoff is 60. */
    expect(varietyCost(grown(42.5, 60), 15, OWNERS)).toEqual({ ok: false, reason: "lowYield" });
    expect(varietyCost(grown(42, 10), 100, OWNERS)).toEqual({ ok: false, reason: "lowYield" });
    /* A tray that failed outright is the lowest yield of all. */
    expect(varietyCost(grown(20, 0), 100, OWNERS)).toEqual({ ok: false, reason: "lowYield" });
    expect(varietyPrice(grown(42.5, 60), 15, OWNERS)).toEqual({ pricePer100g: 0 });
    /* Just over the line sells, two trays to the box. */
    expect(varietyCost(grown(42.5, 61), 15, OWNERS).ok).toBe(true);
  });

  it("follows the costing — a dearer block, more trays to it, more power, more cleaning", () => {
    expect(cocopeatPerTray({ ...DEFAULT_COSTING, cocopeatBlockCost: 320 })).toBe(20);
    expect(cocopeatPerTray({ ...DEFAULT_COSTING, traysPerBlock: 20 })).toBe(15);
    const power = varietyCost(cabbage, 225, { ...DEFAULT_COSTING, overheadPerTray: 40 });
    expect(power.ok && power.cost.tray).toBeCloseTo(109.25);
    const cleaning = varietyCost(cabbage, 225, { ...DEFAULT_COSTING, cleaningPerTray: 15 });
    expect(cleaning.ok && cleaning.cost.tray).toBeCloseTo(104.25);
  });

  it("refuses a price it cannot work out, and says why", () => {
    expect(varietyCost(undefined, 225, DEFAULT_COSTING)).toEqual({ ok: false, reason: "noHarvest" });
    expect(varietyCost(cabbage, undefined, DEFAULT_COSTING)).toEqual({ ok: false, reason: "noSeedCost" });
    expect(varietyCost(cabbage, 0, DEFAULT_COSTING)).toEqual({ ok: false, reason: "noSeedCost" });
    /* And an unpriceable variety stores a price of 0 — off sale — with no cost. */
    expect(varietyPrice(undefined, 225, DEFAULT_COSTING)).toEqual({ pricePer100g: 0 });
  });
});
