import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidContentKey } from "@/lib/content/content-key";
import * as script from "../../../scripts/seeds-fill.mjs";

/**
 * Ties `scripts/seeds-fill.mjs` to the content folder it loads prices for.
 *
 * The script is the one place the owner's supplier list is written down, and
 * the content folder is the one place a seed's copy lives. A key in one and
 * not the other is a silent half-product: a priced row with no name (flagged
 * red in admin, invisible on the site) or a fully written page nobody can buy.
 * Both are easy to create, since the two halves are edited days apart, so the
 * pairing is pinned here rather than noticed later.
 *
 * It also pins the per-kg → per-100 g arithmetic and the invoice figures,
 * because a transcription slip there is invisible afterwards.
 */
const DIR = path.join(process.cwd(), "content", "seeds");

async function contentKeys() {
  const entries = await readdir(DIR);
  return entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

describe("seeds-fill.mjs and content/seeds agree", () => {
  it("every priced seed has copy, and every written seed has a price", async () => {
    const priced = script.PRICE_LIST.map((r) => r.key).sort();
    expect(priced).toEqual(await contentKeys());
  });

  it("every key is a usable content key and URL segment", () => {
    for (const { key } of script.PRICE_LIST) {
      expect(isValidContentKey(key), key).toBe(true);
    }
  });

  it("lists each seed exactly once", () => {
    const keys = script.PRICE_LIST.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /** The invoice quotes per kg; the site sells and costs per 100 g. */
  it("converts the per-kg price to a cost per 100 g", () => {
    expect(script.costPer100g(500)).toBe(50);
    expect(script.costPer100g(150)).toBe(15);
    expect(script.costPer100g(3600)).toBe(360);
  });

  /** The vendor's invoice of 26 Aug 2026, verbatim, and the owner's per-250 g
   *  figures for the four it left out (× 4). */
  it("carries the quoted per-kg prices verbatim", () => {
    const byKey = Object.fromEntries(script.PRICE_LIST.map((r) => [r.key, r.perKg]));
    expect(byKey).toEqual({
      alfalfa: 800,
      basil: 2100,
      beetroot: 1000,
      broccoli: 2300,
      cabbage: 2250,
      dill: 800,
      "garden-cress": 1600,
      kale: 1500,
      mustard: 250,
      "pak-choi": 600,
      radish: 500,
      "red-amaranthus": 800,
      "red-cabbage": 3600,
      "red-onion": 1000,
      rocket: 1200,
      spinach: 150,
      sunflower: 350,
      "swiss-chard": 1400,
    });
  });

  it("prices at cost when no margin has been saved", () => {
    expect(script.marginFrom(undefined)).toEqual({ markupPercent: 0, roundUpToNearest: 1 });
    expect(script.marginFrom({ markupPercent: 50, roundUpToNearest: 10 })).toEqual({
      markupPercent: 50,
      roundUpToNearest: 10,
    });
  });

  it("holds the stock figure the owner reported, not a guess", () => {
    expect(script.DEFAULT_STOCK_GRAMS).toBe(200);
  });
});
