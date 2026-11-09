import { describe, expect, it } from "vitest";
import { retailPrice } from "./margin";
import * as script from "../../../scripts/racks-fill.mjs";

/* The charm rule and "never below cost" are pinned in racks/pricing.test.ts;
   this file pins the floating-point case found 8 Nov 2026. */
describe("retailPrice takes the marked-up figure to the paisa", () => {
  const cases: [cost: number, markupPercent: number, step: number, price: number][] = [
    /* `100 * 1.1` is 110.00000000000001, which `Math.ceil` put a step up. */
    [100, 10, 10, 110],
    [50, 10, 5, 55],
    [200, 10, 5, 220],
    /* Step 1 is the same sliver, a rupee over. */
    [100, 10, 1, 110],
    /* Over ₹300 the charm rule still lands on the 9 at or above. */
    [300, 10, 10, 339],
    /* A genuine fraction still rounds up. */
    [100.01, 10, 10, 120],
    [2577.6, 0, 100, 2599],
  ];

  it.each(cases)("₹%d at %d%% to the nearest %d is ₹%d", (cost, markupPercent, step, price) => {
    const margin = { markupPercent, roundUpToNearest: step };
    expect(retailPrice(cost, margin)).toBe(price);
    /* scripts/racks-fill.mjs holds a copy (script-parity.test.ts). */
    expect(script.retailPrice(cost, margin)).toBe(price);
  });

  it("never prices under the marked-up figure", () => {
    for (let cost = 1; cost < 3000; cost += 3.7) {
      for (const markupPercent of [0, 5, 10, 12.5, 30, 80]) {
        for (const step of [1, 5, 10, 50, 100]) {
          const p = retailPrice(cost, { markupPercent, roundUpToNearest: step });
          expect(p).toBeGreaterThanOrEqual(Math.round(cost * (100 + markupPercent)) / 100);
        }
      }
    }
  });
});
