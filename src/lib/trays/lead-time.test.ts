import { describe, expect, it } from "vitest";
import { istDateISO } from "@/lib/delivery-date";
import { RESTOCK_EXTRA_DAYS, fromShelf, heldReadyDate, isValidStockPacks } from "./lead-time";

/** A moment in IST, expressed as one. */
const ist = (local: string) => new Date(`${local}+05:30`);
const now = ist("2026-09-25T15:00:00");

describe("heldReadyDate (the owner, 25 Sep 2026)", () => {
  it("ships what we hold the next day", () => {
    expect(istDateISO(heldReadyDate(2, 5, now))).toBe("2026-09-26");
    expect(istDateISO(heldReadyDate(5, 5, now))).toBe("2026-09-26");
  });

  it("adds a day when the order is bigger than what we hold", () => {
    expect(RESTOCK_EXTRA_DAYS).toBe(1);
    expect(istDateISO(heldReadyDate(6, 5, now))).toBe("2026-09-27");
    expect(istDateISO(heldReadyDate(1, 0, now))).toBe("2026-09-27");
  });

  it("never refuses a quantity", () => {
    expect(istDateISO(heldReadyDate(20, 0, now))).toBe("2026-09-27");
  });

  /* A bad count must never promise next day for packs that may not exist. */
  it.each([NaN, -3, undefined as unknown as number])("reads a count of %p as none held", (bad) => {
    expect(fromShelf(1, bad)).toBe(false);
  });
});

describe("isValidStockPacks", () => {
  it("takes whole packs, zero or more", () => {
    expect(isValidStockPacks(0)).toBe(true);
    expect(isValidStockPacks(12)).toBe(true);
    expect(isValidStockPacks(-1)).toBe(false);
    expect(isValidStockPacks(1.5)).toBe(false);
  });
});
