import { describe, expect, it } from "vitest";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import {
  SEED_MIN_ORDER_GRAMS,
  SEED_VENDOR_LEAD_DAYS,
  seedReadyDate,
  seedSourcing,
  shelfGrams,
  shelfPacks,
} from "./stock";
import { istDateISO } from "@/lib/delivery-date";

/** A moment in IST, expressed as one. */
const ist = (local: string) => new Date(`${local}+05:30`);

describe("the minimum order and the cart unit", () => {
  /* See the note in stock.ts. The cart has no per-line minimum: "at least one
     unit" is the minimum, which only means 100 g while these agree. If a seed
     minimum of 250 g is ever set, this failing is the point — it names the
     work rather than letting a 100 g order through a 250 g rule. */
  it("are the same 100 g, which is what lets the cart enforce the minimum", () => {
    expect(SEED_MIN_ORDER_GRAMS).toBe(GRAMS_PER_UNIT);
  });
});

describe("seedSourcing — the shelf decides the speed, never the limit", () => {
  it.each([
    [100, 200, "shelf"],
    [200, 200, "shelf"],
    [300, 200, "vendor"],
    [100, 0, "vendor"],
    [2000, 5000, "shelf"],
  ] as const)("ordering %i g against %i g held is a %s order", (ordered, held, expected) => {
    expect(seedSourcing(ordered, held)).toBe(expected);
  });

  /* The owner's wording was "less than the amount that we are holding", and
     this is the reading of it: exactly what is on the shelf is a next-day
     order. The seed is there — holding it back for a vendor run because the
     shelf happens to end up empty would be a worse promise for no reason. */
  it("counts an order for exactly what is held as next day", () => {
    expect(seedSourcing(200, 200)).toBe("shelf");
    expect(seedSourcing(201, 200)).toBe("vendor");
  });

  /* Asymmetric on purpose. A bad stock figure must never produce "shelf",
     because that is a next-day delivery of seed that may not exist; "vendor"
     is a slower promise the business can always beat. */
  it.each([NaN, Infinity, -Infinity, -100, undefined as unknown as number])(
    "treats a stock figure of %p as nothing on the shelf",
    (bad) => {
      expect(seedSourcing(100, bad)).toBe("vendor");
    },
  );

  it("treats an unreadable quantity as a vendor order rather than a next-day one", () => {
    expect(seedSourcing(NaN, 5000)).toBe("vendor");
  });

  /* No quantity is ever refused — that is the whole point of the change. The
     function returns a sourcing for anything it is handed, including far more
     than the business has ever held. */
  it("never refuses a quantity, however large", () => {
    expect(seedSourcing(1_000_000, 200)).toBe("vendor");
  });
});

describe("seedReadyDate — next day off the shelf, the lead time otherwise", () => {
  const now = ist("2026-09-17T14:00:00"); // Thursday

  it("promises tomorrow for what is on the shelf", () => {
    expect(istDateISO(seedReadyDate("shelf", now))).toBe("2026-09-18");
  });

  it("promises the lead time for anything bought in", () => {
    expect(istDateISO(seedReadyDate("vendor", now))).toBe("2026-09-27");
  });

  /* Day-granular in IST, so the hour someone clicks cannot move the promise.
     Both of these are still "tomorrow", and both cross a UTC day boundary. */
  it.each(["2026-09-17T00:05:00", "2026-09-17T23:55:00"])(
    "gives the same next day at %s IST",
    (when) => {
      expect(istDateISO(seedReadyDate("shelf", ist(when)))).toBe("2026-09-18");
    },
  );

  it("is ten days, as the owner stated it", () => {
    expect(SEED_VENDOR_LEAD_DAYS).toBe(10);
  });

  /* A vendor order is always the slower of the two, whatever the constants
     are set to later — which is what the cart's "one trip, latest date" rule
     depends on. */
  it("is always later than the shelf date", () => {
    expect(seedReadyDate("vendor", now).getTime()).toBeGreaterThan(
      seedReadyDate("shelf", now).getTime(),
    );
  });
});

describe("shelfPacks — operator-facing, and rounds down", () => {
  it.each([
    [0, 0],
    [99, 0],
    [100, 1],
    [250, 2],
    [5000, 50],
  ])("fills %i g as %i packs from the shelf", (grams, packs) => {
    expect(shelfPacks(grams)).toBe(packs);
  });

  it.each([NaN, Infinity, -1])("reads %p as an empty shelf", (bad) => {
    expect(shelfPacks(bad)).toBe(0);
  });

  it("states the same figure in grams", () => {
    expect(shelfGrams(250)).toBe(200);
    expect(shelfGrams(99)).toBe(0);
  });

  /* The admin column and the sourcing rule must not disagree about a row.
     They round differently on purpose — sourcing compares raw grams, the
     column shows whole packs — so this pins the one relationship that
     matters: anything the column says can go out next day, does. */
  it.each([0, 40, 100, 250, 999, 5000])(
    "never claims a next-day pack the sourcing rule would send to the vendor (%i g)",
    (held) => {
      const packs = shelfPacks(held);
      if (packs > 0) {
        expect(seedSourcing(packs * GRAMS_PER_UNIT, held)).toBe("shelf");
      }
      /* And one pack more than the column claims is always a vendor order. */
      expect(seedSourcing((packs + 1) * GRAMS_PER_UNIT, held)).toBe("vendor");
    },
  );
});
