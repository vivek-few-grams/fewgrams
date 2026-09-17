import { describe, expect, it } from "vitest";
import {
  PIPE_MAX_HEIGHT_FT,
  VENDOR_SEED,
  allAngleRackConfigs,
  allPipeRackConfigs,
  allRackConfigs,
  angleRackCost,
  angleRackFeet,
  angleRackSku,
  frameFeetPerShelf,
  pipeFeetPerShelf,
  pipeRackConnectors,
  pipeRackCost,
  pipeRackFeet,
  pipeRackLegs,
  pipeRackSku,
  rackCapacityKg,
  rackCost,
  rackSku,
  repricedRows,
  retailPrice,
  shelvesForHeight,
} from "./pricing";
import type { AngleRackConfig, PipeRackConfig, RackConfig } from "@/lib/types";

/**
 * The owner worked this out by hand on 16 Sep 2026 and asked whether it was
 * right. It was, and it is now the acceptance test for the whole rack feature:
 * if `rackCost` ever disagrees with their arithmetic, the disagreement is a
 * bug in the code and not a revision of the price list.
 *
 * 6 ft, 5 shelves, 1¼ × 3 ft plate, 1.4 mm powder-coated angle:
 *   shelves 5 × 250 = 1,250
 *   legs    4 × 6 × 40 = 960
 *   bolts   5 × 8 pairs × ₹2 = 80
 *   bushes  4 × ₹5 = 20   ← per rack, not per shelf
 *                     ------
 *                      2,310
 */
const OWNERS_RACK: RackConfig = {
  heightFt: 6,
  shelves: 5,
  plateId: "p-1.25x3",
  angleId: "a-1.4",
};

describe("rackCost", () => {
  it("reproduces the owner's hand calculation, line by line", () => {
    expect(rackCost(OWNERS_RACK, VENDOR_SEED)).toEqual({
      legs: 960,
      shelves: 1250,
      bolts: 80,
      bushes: 20,
      total: 2310,
    });
  });

  it("charges bushes once per rack, not once per shelf", () => {
    /* The distinction the owner corrected. Shelf count must not move the
       bush line at all — an earlier version had it at 4 per shelf and every
       price came out ₹80 high. */
    const one = rackCost({ ...OWNERS_RACK, shelves: 1 }, VENDOR_SEED);
    const five = rackCost(OWNERS_RACK, VENDOR_SEED);
    expect(one?.bushes).toBe(20);
    expect(five?.bushes).toBe(20);
  });

  it("prices the whole 6 ft five-shelf range", () => {
    /* The range the owner was shown. Pinned so a refactor of the formula
       cannot quietly move a published price list.
     *
     * Every line is at ₹40/ft, because 1.4 mm is the only gauge there is —
     * the 1 mm and 1.2 mm painted rows were removed on 17 Sep 2026 when the
     * owner confirmed the vendor never supplied them. */
    const at = (plateId: string) =>
      rackCost({ ...OWNERS_RACK, plateId, angleId: "a-1.4" }, VENDOR_SEED)?.total;

    expect(at("p-1x3")).toBe(2060);
    expect(at("p-1.25x3")).toBe(2310);
    expect(at("p-1.5x3")).toBe(2810);
    expect(at("p-2x3")).toBe(3810);
    expect(at("p-1x2")).toBe(1960);
  });

  it("returns null for a part that is no longer in the rate card", () => {
    /* Retiring a plate size is normal. A rack still referencing it must read
       as unpriceable, not silently reprice without its shelves. */
    expect(rackCost({ ...OWNERS_RACK, plateId: "gone" }, VENDOR_SEED)).toBeNull();
    expect(rackCost({ ...OWNERS_RACK, angleId: "gone" }, VENDOR_SEED)).toBeNull();
  });
});

describe("retailPrice", () => {
  const s = VENDOR_SEED.settings;

  it("rounds up, never down", () => {
    /* ₹2,310 at the nearest 50 would be ₹2,300 — under cost. */
    expect(retailPrice(2310, { ...s, markupPercent: 0 })).toBe(2350);
  });

  it("applies markup before rounding", () => {
    expect(retailPrice(2310, { ...s, markupPercent: 80 })).toBe(4200);
  });

  it("still rounds a fraction up when rounding is disabled", () => {
    expect(retailPrice(2310, { ...s, markupPercent: 1, roundUpToNearest: 1 })).toBe(2334);
  });
});

describe("shelvesForHeight", () => {
  it("is height minus one, the vendor's rule", () => {
    /* Confirmed 17 Sep 2026: 6 ft takes 5 shelves and 2 ft takes 1. A fixed
       count, not a ceiling — the vendor does not build a 6 ft frame with 2
       shelves. */
    expect([2, 3, 4, 5, 6].map(shelvesForHeight)).toEqual([1, 2, 3, 4, 5]);
  });

  it("floors a fractional height rather than half-shelving it", () => {
    expect(shelvesForHeight(4.5)).toBe(3);
  });

  it("never goes negative", () => {
    /* A height this short is rejected when the rates are saved, but the
       function must not be the thing that breaks if one gets through. */
    expect(shelvesForHeight(1)).toBe(0);
    expect(shelvesForHeight(0.5)).toBe(0);
  });
});

describe("rackCapacityKg", () => {
  it("is per-shelf capacity times the shelf count", () => {
    expect(rackCapacityKg(OWNERS_RACK, VENDOR_SEED)).toBe(100);
  });
});

describe("rackSku", () => {
  it("reads as a rack on a packing slip", () => {
    const plate = VENDOR_SEED.plates[1];
    const angle = VENDOR_SEED.angles[0];
    /* No colour segment: colour is chosen at purchase, not published, so it
       belongs on the order line rather than in the model's identifier. */
    expect(rackSku(OWNERS_RACK, plate, angle)).toBe("RK-6F-5S-1.25x3-1.4");
  });
});

describe("allRackConfigs", () => {
  it("is one rack per height, size and active gauge", () => {
    /* Five heights × five active plates × one active gauge. Not 75: shelves
       are `height − 1`, so there is no shelf count to enumerate. An earlier
       version ranged 1 to the cap and produced 50 frames the vendor does not
       build. */
    const card = {
      ...VENDOR_SEED,
      settings: { ...VENDOR_SEED.settings, heightsFt: [2, 3, 4, 5, 6] },
    };
    const all = allRackConfigs(card);
    expect(all).toHaveLength(25);
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBe(25);
  });

  it("gives every rack the shelf count its height dictates", () => {
    const card = {
      ...VENDOR_SEED,
      settings: { ...VENDOR_SEED.settings, heightsFt: [2, 3, 4, 5, 6] },
    };
    for (const c of allRackConfigs(card))
      expect(c.shelves).toBe(shelvesForHeight(c.heightFt));
  });

  it("leaves out inactive parts", () => {
    /* Built here rather than leaning on the seed: the seed has one gauge and
       no inactive rows in it since the painted grades were removed, so it can
       no longer prove this on its own. Retiring a size must not have it
       resurrected as a rack. */
    const card = {
      ...VENDOR_SEED,
      plates: VENDOR_SEED.plates.map((p) =>
        p.id === "p-2x3" ? { ...p, active: false } : p,
      ),
    };
    expect(allRackConfigs(card).some((c) => c.plateId === "p-2x3")).toBe(false);
    expect(allRackConfigs(card)).toHaveLength(VENDOR_SEED.settings.heightsFt.length * 4);
  });

  it("comes back shortest first", () => {
    const heights = allRackConfigs(VENDOR_SEED).map((c) => c.heightFt);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });


});

/**
 * Open-frame racks — SPEC §20.
 *
 * The owner's worked example, 17 Sep 2026: *"if a user is asking for four feet
 * length and one feet depth we will have 3 four ft slotted angles and two
 * 1 feet slotted angle."* That is the acceptance test for the whole category:
 * 14 running feet a shelf, and every price in the range follows from it.
 */
const OWNERS_FRAME: AngleRackConfig = {
  heightFt: 6,
  shelves: 5,
  frameId: "f-1x4",
  angleId: "a-1.4",
};

describe("frameFeetPerShelf", () => {
  it("is the owner's example: three lengths and two depths", () => {
    // 3 × 4 ft + 2 × 1 ft = 14 ft
    expect(frameFeetPerShelf({ depthFt: 1, lengthFt: 4 })).toBe(14);
  });

  it("counts the length three times, not twice", () => {
    /* The mid-rail is the third length — the brace, and the LED tube mount.
       Four pieces instead of five would under-price every rack in the range
       by a full length of angle a shelf. */
    const perimeterOnly = 2 * 4 + 2 * 1;
    expect(frameFeetPerShelf({ depthFt: 1, lengthFt: 4 })).toBe(perimeterOnly + 4);
  });

  it("is not a function of area", () => {
    /* 1 × 4 ft and 2 × 2 ft both cover 4 sq ft, and the long shallow one takes
       more angle: the mid-rail runs along the length. A frame priced by area
       would charge the same for both. */
    expect(frameFeetPerShelf({ depthFt: 1, lengthFt: 4 })).toBe(14);
    expect(frameFeetPerShelf({ depthFt: 2, lengthFt: 2 })).toBe(10);
  });
});

describe("angleRackCost", () => {
  it("prices the owner's 6 ft 1 × 4 ft frame line by line", () => {
    /* legs    4 × 6 ft × ₹40   = 960
       framing 5 × 14 ft × ₹40  = 2,800
       bolts   5 × 8 pairs × ₹2 = 80
       bushes  4 × ₹5           = 20      ← per rack, not per shelf
                                  -----
                                  3,860 */
    expect(angleRackCost(OWNERS_FRAME, VENDOR_SEED)).toEqual({
      legs: 960,
      shelves: 2800,
      bolts: 80,
      bushes: 20,
      total: 3860,
    });
  });

  it("differs from a plated rack in the shelf line and nothing else", () => {
    /* The whole reason both categories share this module. If a future edit
       moves the legs, bolts or bushes on one and not the other, this fails. */
    const plated = rackCost(
      { heightFt: 6, shelves: 5, plateId: "p-1x3", angleId: "a-1.4" },
      VENDOR_SEED,
    );
    const open = angleRackCost(
      { heightFt: 6, shelves: 5, frameId: "f-1x3", angleId: "a-1.4" },
      VENDOR_SEED,
    );
    expect(open?.legs).toBe(plated?.legs);
    expect(open?.bolts).toBe(plated?.bolts);
    expect(open?.bushes).toBe(plated?.bushes);
    expect(open?.shelves).not.toBe(plated?.shelves);
  });

  it("charges the bushes per rack, whatever the shelf count", () => {
    const one = angleRackCost({ ...OWNERS_FRAME, shelves: 1 }, VENDOR_SEED);
    const five = angleRackCost(OWNERS_FRAME, VENDOR_SEED);
    expect(one?.bushes).toBe(five?.bushes);
  });

  it("is unpriceable, not zero, when a part has been retired", () => {
    expect(angleRackCost({ ...OWNERS_FRAME, frameId: "gone" }, VENDOR_SEED)).toBeNull();
    expect(angleRackCost({ ...OWNERS_FRAME, angleId: "gone" }, VENDOR_SEED)).toBeNull();
  });

  it("costs more than the plated rack of the same footprint", () => {
    /* Worth pinning because it is counter-intuitive and the owner expected the
       opposite: dropping the steel deck saves the plate's ₹200 but buys 11 ft
       of angle at ₹40 to replace it. The figures are the vendor's, so if this
       ever flips it is because a rate moved and not because the model changed. */
    const plated = rackCost(
      { heightFt: 6, shelves: 5, plateId: "p-1x3", angleId: "a-1.4" },
      VENDOR_SEED,
    )!;
    const open = angleRackCost(
      { heightFt: 6, shelves: 5, frameId: "f-1x3", angleId: "a-1.4" },
      VENDOR_SEED,
    )!;
    expect(open.total).toBeGreaterThan(plated.total);
  });
});

describe("angleRackFeet", () => {
  it("is the legs plus the framing", () => {
    // 4 × 6 ft of leg + 5 × 14 ft of framing
    expect(angleRackFeet(OWNERS_FRAME, VENDOR_SEED)).toBe(24 + 70);
  });

  it("is null when the footprint has been retired", () => {
    expect(angleRackFeet({ ...OWNERS_FRAME, frameId: "gone" }, VENDOR_SEED)).toBeNull();
  });
});

describe("angleRackSku", () => {
  it("cannot be mistaken for a plated rack of the same size", () => {
    const frame = VENDOR_SEED.frames.find((f) => f.id === "f-1x4")!;
    const angle = VENDOR_SEED.angles[0];
    expect(angleRackSku(OWNERS_FRAME, frame, angle)).toBe("AR-6F-5S-1x4-1.4");
  });
});

describe("allAngleRackConfigs", () => {
  it("is one rack per height, footprint and active gauge", () => {
    // Five heights × six active footprints × one active gauge.
    const card = {
      ...VENDOR_SEED,
      settings: { ...VENDOR_SEED.settings, heightsFt: [2, 3, 4, 5, 6] },
    };
    const all = allAngleRackConfigs(card);
    expect(all).toHaveLength(30);
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBe(30);
  });

  it("gives every rack the shelf count its height dictates", () => {
    const card = {
      ...VENDOR_SEED,
      settings: { ...VENDOR_SEED.settings, heightsFt: [2, 3, 4, 5, 6] },
    };
    for (const c of allAngleRackConfigs(card))
      expect(c.shelves).toBe(shelvesForHeight(c.heightFt));
  });

  it("leaves out inactive parts", () => {
    const card = {
      ...VENDOR_SEED,
      frames: VENDOR_SEED.frames.map((f) =>
        f.id === "f-1x4" ? { ...f, active: false } : f,
      ),
    };
    expect(allAngleRackConfigs(card).some((c) => c.frameId === "f-1x4")).toBe(false);
  });

  it("comes back shortest first", () => {
    const heights = allAngleRackConfigs(VENDOR_SEED).map((c) => c.heightFt);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });
});

describe("the frame seed", () => {
  it("carries no price and no capacity", () => {
    /* Both absences are the design (see `FrameSize`): a frame is angle by the
       foot, and it has no deck to rate for load. A price here would be a
       stored answer to a sum. */
    for (const f of VENDOR_SEED.frames) {
      expect(f).not.toHaveProperty("price");
      expect(f).not.toHaveProperty("capacityKg");
    }
  });

  it("covers every plated footprint, so the two ranges are comparable", () => {
    const frames = new Set(
      VENDOR_SEED.frames.map((f) => `${f.depthFt}x${f.lengthFt}`),
    );
    for (const p of VENDOR_SEED.plates)
      expect(frames.has(`${p.depthFt}x${p.lengthFt}`)).toBe(true);
  });
});

describe("the angle seed", () => {
  it("has one grade, 1.4 mm powder coat", () => {
    /* The owner, 17 Sep 2026: *"we dont have 1 and 1.2 mm painted slotted
       angles, its only 1.4 mm different colored combination."* Pinned because
       a second grade creeping back in would quietly halve every leg price and
       put a rack on sale that the vendor cannot build. */
    expect(VENDOR_SEED.angles).toHaveLength(1);
    expect(VENDOR_SEED.angles[0]).toMatchObject({
      id: "a-1.4",
      thicknessMm: 1.4,
      ratePerFt: 40,
      active: true,
    });
  });

  it("varies only by colour within that grade", () => {
    expect(VENDOR_SEED.angles[0].colours).toEqual(["orange", "green", "purple"]);
  });
});

/* ────────────────────────── UPVC pipe racks ─────────────────────────── */

/**
 * 6 ft, 5 shelves, 1½ × 3 ft of 1 inch UPVC pipe, from the owner's rates of
 * 17 Sep 2026 — ₹25 a foot, ₹110 a four-way connector, ₹10 a bottom bush:
 *
 *   legs        4 × 6 ft = 24 ft × 25 = 600
 *   shelves     5 × 2 × (3 + 1.5) = 45 ft × 25 = 1,125
 *   connectors  4 legs × 5 levels = 20 × 110 = 2,200   ← the biggest line
 *   bushes      4 × 10 = 40                            ← per LEG, not per rack
 *                                                      -------
 *                                                       3,965
 */
const OWNERS_PIPE_RACK: PipeRackConfig = {
  heightFt: 6,
  shelves: 5,
  pipeSizeId: "pp-1.5x3",
};

describe("pipeFeetPerShelf", () => {
  it("is the perimeter and nothing else", () => {
    expect(pipeFeetPerShelf({ depthFt: 1.5, lengthFt: 3 })).toBe(9);
    expect(pipeFeetPerShelf({ depthFt: 1, lengthFt: 2.5 })).toBe(7);
  });

  it("has no mid-rail, unlike an angle shelf", () => {
    /* The one thing that separates the two open ranges: an angle shelf gets a
       third length down the middle for the LED tube, a pipe shelf braces from
       underneath with a leg instead. Four pieces against five. */
    const size = { depthFt: 1, lengthFt: 4 };
    expect(pipeFeetPerShelf(size)).toBe(10);
    expect(frameFeetPerShelf(size)).toBe(14);
  });

  it("weighs length and depth equally, which the angle frame does not", () => {
    /* So unlike the angle range, pipe cost per shelf *is* a function of
       perimeter — 1 × 4 and 2 × 3 come out the same. */
    expect(pipeFeetPerShelf({ depthFt: 1, lengthFt: 4 })).toBe(
      pipeFeetPerShelf({ depthFt: 2, lengthFt: 3 }),
    );
    expect(frameFeetPerShelf({ depthFt: 1, lengthFt: 4 })).not.toBe(
      frameFeetPerShelf({ depthFt: 2, lengthFt: 3 }),
    );
  });
});

describe("pipeRackLegs", () => {
  const s = VENDOR_SEED.settings;

  it("is the four corners on anything under 4 ft long", () => {
    expect(pipeRackLegs({ lengthFt: 2.5 }, s)).toBe(4);
    expect(pipeRackLegs({ lengthFt: 3 }, s)).toBe(4);
  });

  it("adds the middle support from 4 ft, one to each long side", () => {
    expect(pipeRackLegs({ lengthFt: 4 }, s)).toBe(6);
    expect(pipeRackLegs({ lengthFt: 5 }, s)).toBe(6);
  });
});

describe("pipeRackCost", () => {
  it("reproduces the bill line by line", () => {
    const cost = pipeRackCost(OWNERS_PIPE_RACK, VENDOR_SEED)!;
    expect(cost.legs).toBe(600);
    expect(cost.shelves).toBe(1125);
    expect(cost.connectors).toBe(2200);
    expect(cost.bushes).toBe(40);
    expect(cost.total).toBe(3965);
  });

  it("charges the bushes per leg, not four per rack", () => {
    /* Where this range parts company with the other two. A 4 ft rack carries
       its middle support, so six legs and six bushes. */
    const long = { ...OWNERS_PIPE_RACK, pipeSizeId: "pp-1.5x4" };
    expect(pipeRackCost(long, VENDOR_SEED)!.bushes).toBe(60);
    /* And still once per rack, whatever the shelf count. */
    const short = { heightFt: 2, shelves: 1, pipeSizeId: "pp-1.5x3" };
    expect(pipeRackCost(short, VENDOR_SEED)!.bushes).toBe(40);
  });

  it("buys a connector for every leg at every level", () => {
    expect(pipeRackConnectors(OWNERS_PIPE_RACK, VENDOR_SEED)).toBe(20);
    /* Six legs, five levels — thirty fittings, ₹3,300 of them. */
    const long = { ...OWNERS_PIPE_RACK, pipeSizeId: "pp-2x4" };
    expect(pipeRackConnectors(long, VENDOR_SEED)).toBe(30);
    expect(pipeRackCost(long, VENDOR_SEED)!.connectors).toBe(3300);
  });

  it("spends more on fittings than on pipe", () => {
    /* The finding worth knowing before quoting: at ₹110 against ₹25 a foot,
       the connectors outweigh every foot of pipe in the rack. If a requote
       ever flips this, the pricing has changed character and the copy on the
       screen needs rewriting — so it is pinned rather than assumed. */
    const cost = pipeRackCost(OWNERS_PIPE_RACK, VENDOR_SEED)!;
    expect(cost.connectors).toBeGreaterThan(cost.legs + cost.shelves);
  });

  it("is the dearest of the three ranges on the same footprint", () => {
    /* The owner reached for pipe for stability, not for price — "in this the
       stability is a bit important" — but both other ranges have already
       surprised them in this direction, so the order is pinned. A flip means
       a rate moved, not that the model changed. */
    const config = { heightFt: 6, shelves: 5 };
    const plated = rackCost(
      { ...config, plateId: "p-1.5x3", angleId: "a-1.4" },
      VENDOR_SEED,
    )!.total;
    const angle = angleRackCost(
      { ...config, frameId: "f-1.5x3", angleId: "a-1.4" },
      VENDOR_SEED,
    )!.total;
    const pipe = pipeRackCost({ ...config, pipeSizeId: "pp-1.5x3" }, VENDOR_SEED)!.total;

    expect(plated).toBe(2810);
    expect(angle).toBe(3460);
    expect(pipe).toBe(3965);
    expect(plated).toBeLessThan(angle);
    expect(angle).toBeLessThan(pipe);
  });

  it("is unpriceable, not zero, when the footprint has been retired", () => {
    const gone = { ...OWNERS_PIPE_RACK, pipeSizeId: "pp-gone" };
    expect(pipeRackCost(gone, VENDOR_SEED)).toBeNull();
    expect(pipeRackFeet(gone, VENDOR_SEED)).toBeNull();
  });

  it("is unpriceable before the pipe rates are entered", () => {
    /* A real state on a fresh install, and it must not stop the other two
       ranges pricing — which is why `pipeSettings` is nullable on the card
       rather than required. */
    const card = { ...VENDOR_SEED, pipeSettings: null };
    expect(pipeRackCost(OWNERS_PIPE_RACK, card)).toBeNull();
    expect(rackCost(OWNERS_RACK, card)!.total).toBe(2310);
  });
});

describe("pipeRackFeet", () => {
  it("is the uprights plus the frames", () => {
    expect(pipeRackFeet(OWNERS_PIPE_RACK, VENDOR_SEED)).toBe(24 + 45);
  });

  it("counts the middle support as two more uprights", () => {
    const long = { ...OWNERS_PIPE_RACK, pipeSizeId: "pp-1.5x4" };
    /* 6 legs × 6 ft = 36, plus 5 × 2 × (4 + 1.5) = 55. */
    expect(pipeRackFeet(long, VENDOR_SEED)).toBe(91);
  });
});

describe("allPipeRackConfigs", () => {
  it("is one rack per height and footprint — no gauge to vary", () => {
    const configs = allPipeRackConfigs(VENDOR_SEED);
    const heights = VENDOR_SEED.settings.heightsFt.filter(
      (h) => h <= PIPE_MAX_HEIGHT_FT,
    );
    expect(configs).toHaveLength(heights.length * VENDOR_SEED.pipes.length);
    expect(new Set(configs.map((c) => c.pipeSizeId)).size).toBe(
      VENDOR_SEED.pipes.length,
    );
  });

  it("stops at the height the pipe can carry", () => {
    /* The heights list is shared with two steel ranges. If 8 ft is ever added
       there, the pipe range must not follow it into something that wobbles. */
    const card = {
      ...VENDOR_SEED,
      settings: { ...VENDOR_SEED.settings, heightsFt: [3, 6, 8, 10] },
    };
    expect(allPipeRackConfigs(card).map((c) => c.heightFt)).toEqual(
      expect.arrayContaining([3, 6]),
    );
    expect(allPipeRackConfigs(card).some((c) => c.heightFt > 6)).toBe(false);
  });

  it("leaves out inactive footprints", () => {
    const card = {
      ...VENDOR_SEED,
      pipes: VENDOR_SEED.pipes.map((p) =>
        p.id === "pp-1x3" ? { ...p, active: false } : p,
      ),
    };
    expect(allPipeRackConfigs(card).some((c) => c.pipeSizeId === "pp-1x3")).toBe(
      false,
    );
  });

  it("enumerates nothing at all before the pipe rates exist", () => {
    expect(allPipeRackConfigs({ ...VENDOR_SEED, pipeSettings: null })).toEqual([]);
  });

  it("comes back shortest first", () => {
    const heights = allPipeRackConfigs(VENDOR_SEED).map((c) => c.heightFt);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });
});

describe("pipeRackSku", () => {
  it("cannot be mistaken for either steel range", () => {
    const size = VENDOR_SEED.pipes.find((p) => p.id === "pp-1.5x3")!;
    expect(pipeRackSku(OWNERS_PIPE_RACK, size)).toBe("PR-6F-5S-1.5x3");
  });
});

describe("the pipe seed", () => {
  it("is the owner's grid: three depths by three lengths", () => {
    expect(VENDOR_SEED.pipes).toHaveLength(9);
    expect([...new Set(VENDOR_SEED.pipes.map((p) => p.depthFt))].sort()).toEqual([
      1, 1.5, 2,
    ]);
    expect([...new Set(VENDOR_SEED.pipes.map((p) => p.lengthFt))].sort()).toEqual([
      2.5, 3, 4,
    ]);
  });

  it("drops the 1¼ ft depth the plated range offers", () => {
    /* The owner's exclusion, and the one size the two grids disagree on. */
    expect(VENDOR_SEED.pipes.some((p) => p.depthFt === 1.25)).toBe(false);
    expect(VENDOR_SEED.plates.some((p) => p.depthFt === 1.25)).toBe(true);
  });

  it("carries no price and no capacity", () => {
    for (const size of VENDOR_SEED.pipes) {
      expect(size).not.toHaveProperty("price");
      expect(size).not.toHaveProperty("capacityKg");
    }
  });

  it("holds the owner's three rates", () => {
    expect(VENDOR_SEED.pipeSettings).toEqual({
      ratePerFt: 25,
      connectorPrice: 110,
      bushPrice: 10,
    });
  });
});

/* ─────────────────── repricing: rates cascade to prices ────────────── */

describe("repricedRows", () => {
  const settings = { ...VENDOR_SEED.settings, markupPercent: 0, roundUpToNearest: 1 };
  const card = { ...VENDOR_SEED, settings };
  const cost = (c: RackConfig) => rackCost(c, card);

  /** A published rack, priced consistently with the card above. */
  const published = (config: RackConfig, over?: Partial<{ price: number; costAtPublish: number }>) => {
    const total = rackCost(config, card)!.total;
    return {
      id: "m1",
      config,
      price: total,
      costAtPublish: total,
      publishedAt: "2026-09-16T00:00:00.000Z",
      active: true,
      ...over,
    };
  };

  it("returns nothing when no rate has moved", () => {
    /* The common case, and the one that matters most: a save that changes
       nothing must not write a hundred rows or restamp their dates. */
    expect(repricedRows([published(OWNERS_RACK)], cost, settings)).toEqual([]);
  });

  it("moves a price when a material rate moves", () => {
    const model = published(OWNERS_RACK);
    const dearer = { ...card, settings: { ...settings, boltSetPrice: 10 } };
    const rows = repricedRows(
      [model],
      (c: RackConfig) => rackCost(c, dearer),
      dearer.settings,
    );
    expect(rows).toHaveLength(1);
    /* 5 shelves × 8 pairs × (₹10 − ₹2) = ₹320 more. */
    expect(rows[0].costAtPublish).toBe(model.costAtPublish + 320);
    expect(rows[0].price).toBe(model.price + 320);
  });

  it("moves a price when only the markup moves", () => {
    /* The case a cost-only comparison would miss: the rack costs exactly what
       it did, and sells for 80% more. */
    const model = published(OWNERS_RACK);
    const marked = { ...settings, markupPercent: 80 };
    const rows = repricedRows([model], cost, marked);
    expect(rows).toHaveLength(1);
    expect(rows[0].costAtPublish).toBe(model.costAtPublish);
    expect(rows[0].price).toBe(Math.ceil(model.costAtPublish * 1.8));
  });

  it("leaves an unpriceable rack at its last good price", () => {
    /* A retired plate means the cost is unknown, not zero. Repricing to ₹0
       would put a free rack on sale. */
    const orphan = published(OWNERS_RACK, { price: 2310, costAtPublish: 2310 });
    orphan.config = { ...OWNERS_RACK, plateId: "gone" };
    expect(repricedRows([orphan], cost, settings)).toEqual([]);
  });

  it("still writes a row whose cost moved but whose rounded price did not", () => {
    /* The baseline has to follow the cost even when the price stands still,
       or the row reads as stale for ever. */
    const rounded = { ...settings, roundUpToNearest: 500 };
    const model = published(OWNERS_RACK, { price: 2500 });
    const dearer = { ...card, settings: rounded };
    const rows = repricedRows(
      [model],
      (c: RackConfig) => rackCost(c, { ...dearer, settings: { ...rounded, boltSetPrice: 3 } }),
      rounded,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(2500);
    expect(rows[0].costAtPublish).not.toBe(model.costAtPublish);
  });

  it("works the same for all three ranges", () => {
    /* It is generic so the three cascades cannot drift apart. Each range
       passes only its own cost function. */
    const angle: AngleRackConfig = { heightFt: 6, shelves: 5, frameId: "f-1x4", angleId: "a-1.4" };
    const pipe: PipeRackConfig = { heightFt: 6, shelves: 5, pipeSizeId: "pp-1.5x3" };
    const dear = { ...settings, markupPercent: 100 };

    const angleRows = repricedRows(
      [{ config: angle, price: 3860, costAtPublish: 3860 }],
      (c: AngleRackConfig) => angleRackCost(c, card),
      dear,
    );
    const pipeRows = repricedRows(
      [{ config: pipe, price: 3965, costAtPublish: 3965 }],
      (c: PipeRackConfig) => pipeRackCost(c, card),
      dear,
    );
    expect(angleRows[0].price).toBe(7720);
    expect(pipeRows[0].price).toBe(7930);
  });
});
