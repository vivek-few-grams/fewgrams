import { describe, expect, it } from "vitest";
import {
  parcelGrams,
  rackBox,
  trayStack,
  travelsOnOwnRun,
  type PackingRules,
  type RackPacking,
  type TrayPacking,
} from "./parcel";

const rules: PackingRules = { seedPackingGrams: 50, shelfStackCm: 2 };

/* The owner's own example: a tray is 60 × 30 × 3 cm and each stacked tray
   adds 3 cm. Sold two to a pack. */
const tray: TrayPacking = {
  packPieces: 2,
  pieceLengthCm: 60,
  pieceWidthCm: 30,
  pieceHeightCm: 3,
  pieceStackCm: 3,
  pieceGrams: 400,
};

/* The owner's own worked rack: 6 ft, 5 shelves, 1.25 × 3 ft plate. */
const rack: RackPacking = { heightFt: 6, shelves: 5, depthFt: 1.25, lengthFt: 3, gramsPerShelf: 2500 };

describe("travelsOnOwnRun", () => {
  it("is true as soon as one line is a green, whatever rides with it", () => {
    expect(travelsOnOwnRun([{ kind: "seed" }, { kind: "variety" }])).toBe(true);
  });

  it("is false for seeds, trays and racks alone", () => {
    expect(travelsOnOwnRun([{ kind: "seed" }, { kind: "tray" }, { kind: "rack" }])).toBe(false);
  });
});

describe("trayStack", () => {
  it("adds the stacking height for every piece after the first", () => {
    expect(trayStack(tray, 1)).toEqual({ grams: 800, box: { length: 60, width: 30, height: 6 } });
  });

  it("stacks every pack of one product together", () => {
    // 3 packs × 2 trays = 6 trays: 3 + 5 × 3 = 18 cm.
    expect(trayStack(tray, 3).box.height).toBe(18);
    expect(trayStack(tray, 3).grams).toBe(2400);
  });

  it("treats a drainage set of five as one piece", () => {
    const mats: TrayPacking = { ...tray, packPieces: 1, pieceHeightCm: 10, pieceGrams: 900 };
    expect(trayStack(mats, 2)).toEqual({ grams: 1800, box: { length: 60, width: 30, height: 13 } });
  });
});

describe("rackBox", () => {
  it("lets the legs set the length and stacks the shelves", () => {
    const r = rackBox(rack, 2);
    expect(r.grams).toBe(12500);
    expect(r.box.length).toBeCloseTo(182.88);
    expect(r.box.width).toBeCloseTo(38.1);
    expect(r.box.height).toBe(10);
  });

  it("uses the shelf length when it is longer than the rack is tall", () => {
    expect(rackBox({ ...rack, heightFt: 2, lengthFt: 4 }, 2).box.length).toBeCloseTo(121.92);
  });
});

describe("parcelGrams", () => {
  it("prices seeds by their grams, with the padding once", () => {
    expect(
      parcelGrams(
        [
          { kind: "seed", units: 2, grams: 200 },
          { kind: "seed", units: 1, grams: 100 },
        ],
        rules,
      ),
    ).toBe(350);
  });

  it("bills a light tray stack by its size", () => {
    // 60 × 30 × 6 ÷ 5000 = 2.16 kg, against 0.8 kg of trays.
    expect(parcelGrams([{ kind: "tray", units: 1, packing: tray }], rules)).toBe(2160);
  });

  it("bills a rack by the larger of its weight and its box", () => {
    // 182.88 × 38.1 × 10 ÷ 5000 = 13.94 kg, against 12.5 kg of shelves.
    expect(parcelGrams([{ kind: "rack", units: 1, packing: rack }], rules)).toBe(13936);
  });

  it("refuses an order with an item nobody has measured", () => {
    expect(parcelGrams([{ kind: "tray", units: 1, packing: null }], rules)).toBeNull();
    expect(parcelGrams([{ kind: "rack", units: 1, packing: null }], rules)).toBeNull();
  });

  it("refuses to weigh a green as a courier parcel", () => {
    expect(() => parcelGrams([{ kind: "variety", units: 1 }], rules)).toThrow(/own run/);
  });
});
