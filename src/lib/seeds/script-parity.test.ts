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
 * It also pins the 50 g → 100 g arithmetic, which is the only sum in the
 * script and the one that would quietly halve every price on the shelf.
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

  /** The list is quoted per 50 g and the column the site sells by is per 100 g
   *  (SPEC §22.2). Linear, because a 100 g pack is two 50 g packs. */
  it("doubles the 50 g list price", () => {
    expect(script.pricePer100g(40)).toBe(80);
    expect(script.pricePer100g(270)).toBe(540);
    expect(script.pricePer100g(15)).toBe(30);
  });

  /** Rounds up, so a marked-up price can never land below the list figure it
   *  was derived from — the same rule as rack retail pricing. */
  it("applies a markup and rounds up to the rupee", () => {
    expect(script.pricePer100g(15, 40)).toBe(42); // 30 × 1.4 = 42
    expect(script.pricePer100g(75, 33)).toBe(200); // 150 × 1.33 = 199.5
    expect(script.pricePer100g(40, 0)).toBe(80);
  });

  it("holds the stock figure the owner reported, not a guess", () => {
    expect(script.DEFAULT_STOCK_GRAMS).toBe(200);
  });
});
