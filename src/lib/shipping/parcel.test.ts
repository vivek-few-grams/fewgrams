import { volumetricGrams } from "./weight";
import { describe, expect, it } from "vitest";
import {
  parcelGrams,
  pipeLines,
  rackBox,
  trayStack,
  travelsOnOwnRun,
  type PackingRules,
  type RackPacking,
  type TrayPacking,
} from "./parcel";

const rules: PackingRules = { seedPackingGrams: 50 };

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
const rack: RackPacking = {
  heightFt: 6,
  shelves: 5,
  depthFt: 1.25,
  lengthFt: 3,
  gramsPerShelf: 2500,
  stack: { kind: "plates", shelfCm: 2 },
};

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
  it("lets the legs set the length and stacks the plates", () => {
    const r = rackBox(rack);
    expect(r.grams).toBe(12500);
    expect(r.box.length).toBeCloseTo(182.88);
    expect(r.box.width).toBeCloseTo(38.1);
    expect(r.box.height).toBe(10);
  });

  it("uses the shelf length when it is longer than the rack is tall", () => {
    expect(rackBox({ ...rack, heightFt: 2, lengthFt: 4 }).box.length).toBeCloseTo(121.92);
  });

  /* The owner's numbers, 24 Sep 2026: 2 in slotted angle, 1 cm a piece.
     A 6 ft, 5-shelf open-frame rack is 4 legs + 5 × 5 frame pieces = 29. */
  it("packs an angle rack as a bundle of pieces, not a stack of shelves", () => {
    const angle: RackPacking = { ...rack, depthFt: 1, lengthFt: 4, stack: { kind: "bundle", pieces: 29, widthCm: 5, stackCm: 1 } };
    const r = rackBox(angle);
    expect(r.box).toEqual({ length: expect.closeTo(182.88), width: 5, height: 29 });
    /* 182.88 × 5 × 29 ÷ 5000 = 5.3 kg — against 111 kg as a box of shelves. */
    expect(volumetricGrams(r.box)).toBe(5304);
  });

  /* The owner's rule for pipe: it does not nest, and cut pieces lie end to
     end. Four 4 ft legs of 1 in pipe are a 2 × 2 in bundle. */
  it("groups four legs of pipe two by two", () => {
    const pipe: RackPacking = { ...rack, heightFt: 4, lengthFt: 2, stack: { kind: "pipes", piecesFt: [4, 4, 4, 4], diameterCm: 2.54 } };
    expect(rackBox(pipe).box).toEqual({ length: expect.closeTo(121.92), width: 5.08, height: 5.08 });
  });

  it("lays two 2 ft pieces end to end in one 4 ft line", () => {
    expect(pipeLines([4, 2, 2], 4)).toBe(2);
    expect(pipeLines([2, 2, 2, 2, 2, 2], 6)).toBe(2);
    expect(pipeLines([6, 6, 6, 6, 1.5, 1.5, 1.5], 6)).toBe(5);
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

  /* A compressed coir block is dense — the opposite case to a tray. Figures
     are illustrative, not the supplier's: 30 × 30 × 15 cm at 5.1 kg. */
  it("bills a grow-media block by its weight, stacking several", () => {
    const block: TrayPacking = {
      packPieces: 1,
      pieceLengthCm: 30,
      pieceWidthCm: 30,
      pieceHeightCm: 15,
      pieceStackCm: 15,
      pieceGrams: 5100,
    };
    // 30 × 30 × 15 ÷ 5000 = 2.7 kg by size, against 5.1 kg of coir.
    expect(parcelGrams([{ kind: "media", units: 1, packing: block }], rules)).toBe(5100);
    expect(parcelGrams([{ kind: "media", units: 2, packing: block }], rules)).toBe(10200);
  });

  it("refuses an order with an item nobody has measured", () => {
    expect(parcelGrams([{ kind: "media", units: 1, packing: null }], rules)).toBeNull();
    expect(parcelGrams([{ kind: "tray", units: 1, packing: null }], rules)).toBeNull();
    expect(parcelGrams([{ kind: "rack", units: 1, packing: null }], rules)).toBeNull();
  });

  it("refuses to weigh a green as a courier parcel", () => {
    expect(() => parcelGrams([{ kind: "variety", units: 1 }], rules)).toThrow(/own run/);
  });
});
