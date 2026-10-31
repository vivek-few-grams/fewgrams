import { describe, expect, it } from "vitest";
import type { OrderLine } from "./order";
import { stockMoves } from "./stock-moves";

const line = (over: Partial<OrderLine>): OrderLine => ({
  kind: "seed",
  key: "radish",
  name: "Radish",
  units: 1,
  unitPrice: 90,
  lineTotal: 90,
  grams: 100,
  readyDate: "2026-11-02",
  sourcing: "shelf",
  parts: null,
  ...over,
});

describe("stockMoves", () => {
  it("moves seed grams and tray and cocopeat packs, and nothing for greens or racks", () => {
    expect(
      stockMoves([
        line({ kind: "seed", key: "radish", grams: 200 }),
        line({ kind: "tray", key: "tray-pair", units: 3, grams: null }),
        line({ kind: "media", key: "horti-coir", units: 1, grams: null }),
        line({ kind: "variety", key: "radish", grams: 100 }),
        line({ kind: "rack", key: "ar-5f-4s-1.25x3-1.4-orange", grams: null }),
      ]),
    ).toEqual([
      { kind: "seed", key: "radish", grams: 200 },
      { kind: "tray", key: "tray-pair", units: 3 },
      { kind: "media", key: "horti-coir", units: 1 },
    ]);
  });

  /* A line of two packs takes everything in a pack twice — and 100 g of each
     seed per pack. The rack holds no count. */
  it("unpacks a starter pack's frozen parts, times its units", () => {
    expect(
      stockMoves([
        line({
          kind: "pack",
          key: "double-rack-pack~orange~dill.radish",
          units: 2,
          grams: null,
          sourcing: null,
          parts: [
            { kind: "rack", key: "ar-5f-4s-1.25x3-1.4-orange", units: 2 },
            { kind: "tray", key: "tray-pair", units: 8 },
            { kind: "seed", key: "dill", units: 1 },
            { kind: "seed", key: "radish", units: 1 },
            { kind: "media", key: "horti-coir", units: 1 },
          ],
        }),
      ]),
    ).toEqual([
      { kind: "tray", key: "tray-pair", units: 16 },
      { kind: "seed", key: "dill", grams: 200 },
      { kind: "seed", key: "radish", grams: 200 },
      { kind: "media", key: "horti-coir", units: 2 },
    ]);
  });
});
