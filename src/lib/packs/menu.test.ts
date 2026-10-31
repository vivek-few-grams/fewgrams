import { describe, expect, it } from "vitest";
import { packSeedMenu } from "./menu";

const seed = (contentKey: string, costPer100g: number | undefined, stockGrams = 500, pricePer100g = 100) => ({
  contentKey,
  costPer100g,
  stockGrams,
  pricePer100g,
});

describe("packSeedMenu", () => {
  it("offers the cheapest seeds by our cost, cheapest first", () => {
    const menu = packSeedMenu(
      [
        seed("basil", 210),
        seed("spinach", 15),
        seed("radish", 50),
        seed("red-cabbage", 360),
        seed("mustard", 25),
      ],
      3,
    );
    expect(menu.map((s) => s.contentKey)).toEqual(["spinach", "mustard", "radish"]);
  });

  it("leaves out a seed under 100 g, an unpriced one and one with no cost", () => {
    const menu = packSeedMenu(
      [seed("spinach", 15, 90), seed("mustard", 25, 500, 0), seed("dill", undefined), seed("radish", 50)],
      15,
    );
    expect(menu.map((s) => s.contentKey)).toEqual(["radish"]);
  });

  it("breaks a tie on cost by key, so the menu does not reshuffle", () => {
    const menu = packSeedMenu([seed("dill", 80), seed("alfalfa", 80), seed("amaranth", 80)], 2);
    expect(menu.map((s) => s.contentKey)).toEqual(["alfalfa", "amaranth"]);
  });
});
