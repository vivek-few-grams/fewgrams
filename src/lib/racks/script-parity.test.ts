import { describe, expect, it } from "vitest";
import {
  PIPE_MAX_HEIGHT_FT,
  PIPE_MID_SUPPORT_FROM_LENGTH_FT,
  PIPE_MID_SUPPORT_LEGS,
  VENDOR_SEED,
  allAngleRackConfigs,
  allPipeRackConfigs,
  allRackConfigs,
  angleRackCost,
  frameFeetPerShelf,
  pipeFeetPerShelf,
  pipeRackCost,
  pipeRackLegs,
  rackCost,
  retailPrice,
  shelvesForHeight,
} from "./pricing";
import * as script from "../../../scripts/racks-fill.mjs";

/**
 * `scripts/racks-fill.mjs` re-implements the pricing arithmetic, because it is
 * plain ESM and cannot import TypeScript on Node 20. That duplication is the
 * one genuinely dangerous thing about the script: a divergence would write
 * wrong *frozen* prices into DynamoDB, and a frozen price does not correct
 * itself — it sits there until someone notices the margin.
 *
 * So the two copies are compared here, over the whole range rather than at a
 * sample point. Anything that changes the formula in `pricing.ts` and not in
 * the script fails this file, which is the only reason the script is allowed
 * to hold a second copy at all.
 *
 * Importing the script must be side-effect free — it guards its entry point on
 * `process.argv[1]`, so this does not open a DynamoDB connection.
 */
describe("scripts/racks-fill.mjs agrees with pricing.ts", () => {
  /* Every height, including ones the seed does not list, so the comparison
     covers more than the current range. */
  const card = {
    ...VENDOR_SEED,
    settings: { ...VENDOR_SEED.settings, heightsFt: [2, 3, 4, 5, 6, 7, 8] },
  };

  it("derives the same shelf count", () => {
    for (const h of [0.5, 1, 2, 3, 4, 4.5, 5, 6, 10])
      expect(script.shelvesForHeight(h)).toBe(shelvesForHeight(h));
  });

  it("measures a frame the same way", () => {
    for (const f of card.frames)
      expect(script.frameFeetPerShelf(f)).toBe(frameFeetPerShelf(f));
  });

  it("enumerates the same plated range", () => {
    expect(script.allRackConfigs(card)).toEqual(allRackConfigs(card));
  });

  it("enumerates the same open-frame range", () => {
    expect(script.allAngleRackConfigs(card)).toEqual(allAngleRackConfigs(card));
  });

  it("costs and prices every plated rack identically", () => {
    for (const config of allRackConfigs(card)) {
      const total = rackCost(config, card)!.total;
      expect(script.rackCost(config, card)).toBe(total);
      expect(script.retailPrice(total, card.settings)).toBe(
        retailPrice(total, card.settings),
      );
    }
  });

  it("costs and prices every open-frame rack identically", () => {
    for (const config of allAngleRackConfigs(card)) {
      const total = angleRackCost(config, card)!.total;
      expect(script.angleRackCost(config, card)).toBe(total);
      expect(script.retailPrice(total, card.settings)).toBe(
        retailPrice(total, card.settings),
      );
    }
  });

  it("measures a pipe shelf the same way", () => {
    for (const p of card.pipes)
      expect(script.pipeFeetPerShelf(p)).toBe(pipeFeetPerShelf(p));
  });

  it("agrees on the pipe range's own three constants", () => {
    /* These are the one thing the script duplicates that is not a formula.
       A height cap that differed would have the script publish racks the
       screen refuses to build, and a mid-support threshold that differed
       would price every 4 ft rack wrong — by ₹710 on a 6 ft one. */
    expect(script.PIPE_MAX_HEIGHT_FT).toBe(PIPE_MAX_HEIGHT_FT);
    expect(script.PIPE_MID_SUPPORT_FROM_LENGTH_FT).toBe(
      PIPE_MID_SUPPORT_FROM_LENGTH_FT,
    );
    expect(script.PIPE_MID_SUPPORT_LEGS).toBe(PIPE_MID_SUPPORT_LEGS);
  });

  it("counts a pipe rack's legs the same way, either side of the threshold", () => {
    for (const lengthFt of [2, 2.5, 3, 3.9, 4, 4.1, 6])
      expect(script.pipeRackLegs({ lengthFt }, card.settings)).toBe(
        pipeRackLegs({ lengthFt }, card.settings),
      );
  });

  it("enumerates the same pipe range", () => {
    expect(script.allPipeRackConfigs(card)).toEqual(allPipeRackConfigs(card));
    /* And both stop at the cap, on a heights list that runs past it. */
    expect(script.allPipeRackConfigs(card).some((c) => c.heightFt > 6)).toBe(false);
  });

  it("costs and prices every pipe rack identically", () => {
    for (const config of allPipeRackConfigs(card)) {
      const total = pipeRackCost(config, card)!.total;
      expect(script.pipeRackCost(config, card)).toBe(total);
      expect(script.retailPrice(total, card.settings)).toBe(
        retailPrice(total, card.settings),
      );
    }
  });

  it("enumerates no pipe racks at all before the pipe rates exist", () => {
    const bare = { ...card, pipeSettings: null };
    expect(script.allPipeRackConfigs(bare)).toEqual([]);
    expect(allPipeRackConfigs(bare)).toEqual([]);
    /* And the two steel ranges are unaffected, which is the point of the
       pipe rates being a separate row. */
    expect(script.allRackConfigs(bare)).toEqual(allRackConfigs(bare));
  });

  it("reports a retired part as unpriceable rather than free", () => {
    const gone = { heightFt: 6, shelves: 5, plateId: "gone", angleId: "a-1.4" };
    expect(script.rackCost(gone, card)).toBeNull();
    expect(rackCost(gone, card)).toBeNull();

    const gonePipe = { heightFt: 6, shelves: 5, pipeSizeId: "gone" };
    expect(script.pipeRackCost(gonePipe, card)).toBeNull();
    expect(pipeRackCost(gonePipe, card)).toBeNull();
  });

  it("rounds a markup the same way, in both directions of the step", () => {
    /* Rounding is where two implementations of "the same" formula usually
       part company, so it gets its own sweep. */
    for (const markupPercent of [0, 7.5, 33, 80, 100]) {
      const settings = { ...card.settings, markupPercent };
      for (const cost of [676, 816, 1960, 2310, 3860, 3861, 3965, 5760])
        expect(script.retailPrice(cost, settings)).toBe(retailPrice(cost, settings));
    }
  });
});
