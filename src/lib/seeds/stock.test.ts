import { describe, expect, it } from "vitest";
import { GRAMS_PER_UNIT, MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { SEED_MIN_ORDER_GRAMS, seedMaxUnits, seedReadyDate, seedSoldOut, shelfPacks } from "./stock";
import { istDateISO } from "@/lib/delivery-date";

/** A moment in IST, expressed as one. */
const ist = (local: string) => new Date(`${local}+05:30`);

describe("the minimum order and the cart unit", () => {
  /* See the note in stock.ts. The cart has no per-line minimum: "at least one
     unit" is the minimum, which only means 50 g while these agree. */
  it("are the same 50 g, which is what lets the cart enforce the minimum", () => {
    expect(SEED_MIN_ORDER_GRAMS).toBe(50);
    expect(GRAMS_PER_UNIT).toBe(SEED_MIN_ORDER_GRAMS);
  });
});

describe("seedMaxUnits — the shelf is the limit (the owner, 25 Sep 2026)", () => {
  it.each([
    [0, 0],
    [49, 0],
    [50, 1],
    [120, 2],
    [500, 10],
  ])("%i g on the shelf allows %i units of 50 g", (held, units) => {
    expect(seedMaxUnits(held)).toBe(units);
  });

  it("never passes the per-line cap", () => {
    expect(seedMaxUnits(1_000_000)).toBe(MAX_UNITS_PER_LINE);
  });

  /* A bad stock figure must never allow an order: that would sell seed that
     may not exist. */
  it.each([NaN, Infinity, -Infinity, -100, undefined as unknown as number])("reads %p as nothing held", (bad) => {
    expect(seedMaxUnits(bad)).toBe(0);
  });
});

describe("seedSoldOut", () => {
  it("is sold out under one 50 g unit, and not from there", () => {
    expect(seedSoldOut(0)).toBe(true);
    expect(seedSoldOut(49)).toBe(true);
    expect(seedSoldOut(50)).toBe(false);
  });
});

describe("seedReadyDate — next day, off our shelf", () => {
  it("promises tomorrow in IST, whatever the hour", () => {
    expect(istDateISO(seedReadyDate(ist("2026-09-17T14:00:00")))).toBe("2026-09-18");
    expect(istDateISO(seedReadyDate(ist("2026-09-17T23:59:00")))).toBe("2026-09-18");
    expect(istDateISO(seedReadyDate(ist("2026-09-17T00:01:00")))).toBe("2026-09-18");
  });
});

describe("shelfPacks — the admin's derived column", () => {
  it("counts whole 50 g packs", () => {
    expect(shelfPacks(120)).toBe(2);
    expect(shelfPacks(0)).toBe(0);
    expect(shelfPacks(-5)).toBe(0);
  });
});
