import { describe, expect, it } from "vitest";
import { exoticGap } from "./rotation";

describe("Rare & Exotic is Everyday Essentials plus more", () => {
  it("holds when every Essentials green is in the month and one more besides", () => {
    expect(exoticGap(["radish", "pea"], ["pea", "radish", "red-amaranth"])).toBeNull();
  });

  it("names the Essentials greens Exotic never grows", () => {
    expect(exoticGap(["radish", "pea", "mustard"], ["radish", "red-amaranth"])).toEqual({
      missing: ["pea", "mustard"],
      nothingMore: false,
    });
  });

  it("flags an Exotic month with nothing beyond Essentials", () => {
    expect(exoticGap(["radish", "pea"], ["pea", "radish"])).toEqual({ missing: [], nothingMore: true });
    expect(exoticGap(["radish", "pea"], ["pea"])).toEqual({ missing: ["radish"], nothingMore: true });
  });

  it("counts a green once however many weeks carry it", () => {
    expect(exoticGap(["radish", "radish"], ["radish", "kale", "radish"])).toBeNull();
  });

  it("says nothing until both plans have a rotation", () => {
    expect(exoticGap([], ["radish"])).toBeNull();
    expect(exoticGap(["radish"], [])).toBeNull();
  });
});
