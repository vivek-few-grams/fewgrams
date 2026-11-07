import { describe, expect, it } from "vitest";
import { overStockLines, type ShelfSeed, type StockLine } from "./over-stock";

/**
 * Which line the cart highlights when the shelf is short. The case that
 * prompted this (the audit, 31 Oct 2026): spinach 115 g held, a starter pack
 * with spinach in it, and a separate 100 g of spinach. The pack was flagged
 * at quantity 1; the line to take out was the seed.
 */

const shelf = (held: Record<string, number>): ShelfSeed[] =>
  Object.entries(held).map(([contentKey, stockGrams]) => ({
    contentKey,
    stockGrams,
    name: contentKey[0].toUpperCase() + contentKey.slice(1),
  }));

const seedLine = (key: string, units: number, maxUnits = 20): StockLine => ({
  kind: "seed",
  key,
  units,
  maxUnits,
  grams: units * 100,
});

const packLine = (key: string, seeds: string[], units = 1, maxUnits = 20): StockLine => ({
  kind: "pack",
  key,
  units,
  maxUnits,
  grams: null,
  pack: { parts: seeds.map((s) => ({ kind: "seed" as const, key: s, units: 1 })) },
});

const PACK = "single-rack-pack~orange~dill.spinach";

describe("overStockLines", () => {
  it("flags the seed line, not the pack, when the seed line is what to take out", () => {
    const items = [packLine(PACK, ["dill", "spinach"]), seedLine("spinach", 1, 1)];
    const result = overStockLines(items, shelf({ spinach: 115, dill: 900 }));
    expect(result.lines).toEqual(["seed:spinach"]);
    expect(result.seeds).toEqual({ "seed:spinach": ["Spinach"] });
  });

  it("flags nothing when the pack and the seed line fit together", () => {
    const items = [packLine(PACK, ["dill", "spinach"]), seedLine("spinach", 1, 2)];
    expect(overStockLines(items, shelf({ spinach: 200, dill: 900 }))).toEqual({ lines: [], seeds: {} });
  });

  it("flags the packs and names the seed when the packs alone want more than is held", () => {
    const other = "tray-pack~spinach";
    const items = [packLine(PACK, ["dill", "spinach"]), packLine(other, ["spinach"]), seedLine("spinach", 1)];
    const result = overStockLines(items, shelf({ spinach: 150, dill: 900 }));
    expect(result.lines.sort()).toEqual([`pack:${PACK}`, `pack:${other}`].sort());
    expect(result.seeds).toEqual({ [`pack:${PACK}`]: ["Spinach"], [`pack:${other}`]: ["Spinach"] });
  });

  it("names every short seed a pack holds", () => {
    const items = [packLine(PACK, ["dill", "spinach"], 2, 1)];
    const result = overStockLines(items, shelf({ spinach: 150, dill: 150 }));
    expect(result.lines).toEqual([`pack:${PACK}`]);
    expect(result.seeds[`pack:${PACK}`].sort()).toEqual(["Dill", "Spinach"]);
  });

  /* A seed line over the shelf by itself keeps its own "reduce it" message:
     the pack beside it is not what makes it wrong. */
  it("leaves a seed line that is over on its own to its own message", () => {
    const items = [packLine(PACK, ["dill", "spinach"]), seedLine("spinach", 3, 1)];
    const result = overStockLines(items, shelf({ spinach: 150, dill: 900 }));
    expect(result.lines).toEqual(["seed:spinach"]);
    expect(result.seeds).toEqual({});
  });

  it("is the per-line rule alone when there is no pack", () => {
    const items = [seedLine("radish", 3, 2), seedLine("dill", 1, 0), seedLine("kale", 1, 5)];
    expect(overStockLines(items, shelf({ radish: 250, dill: 40, kale: 900 }))).toEqual({
      lines: ["seed:radish", "seed:dill"],
      seeds: {},
    });
  });

  it("measures a seed the shelf does not list as unlimited, as before", () => {
    const items = [packLine(PACK, ["dill", "spinach"]), seedLine("spinach", 1)];
    expect(overStockLines(items, shelf({ dill: 900 })).lines).toEqual([]);
  });
});
