import { describe, expect, it } from "vitest";
import { rankBySales, seedGramsByKey } from "./best-sellers";

const seeds = ["basil", "kale", "mustard", "radish", "rocket", "sunflower"].map((contentKey) => ({ contentKey }));
const keys = (xs: { contentKey: string }[]) => xs.map((x) => x.contentKey);

describe("rankBySales", () => {
  it("keeps the given order when nothing has sold", () => {
    expect(keys(rankBySales(seeds, {}, 5))).toEqual(["basil", "kale", "mustard", "radish", "rocket"]);
  });

  it("puts the most grams first and fills the rest in the given order", () => {
    expect(keys(rankBySales(seeds, { sunflower: 500, radish: 100 }, 5))).toEqual([
      "sunflower",
      "radish",
      "basil",
      "kale",
      "mustard",
    ]);
  });

  it("breaks a tie by the given order", () => {
    expect(keys(rankBySales(seeds, { rocket: 100, kale: 100 }, 2))).toEqual(["kale", "rocket"]);
  });

  it("ignores a sale of a seed that is not on the list", () => {
    expect(keys(rankBySales(seeds, { alfalfa: 9000 }, 1))).toEqual(["basil"]);
  });
});

describe("seedGramsByKey", () => {
  it("sums seed grams across orders and skips other kinds sharing the key", () => {
    const orders = [
      { lines: [{ kind: "seed", key: "radish", grams: 100 }, { kind: "variety", key: "radish", grams: 300 }] },
      { lines: [{ kind: "seed", key: "radish", grams: 50 }, { kind: "tray", key: "tray-pair", grams: null }] },
    ];
    expect(seedGramsByKey(orders)).toEqual({ radish: 150 });
  });
});
