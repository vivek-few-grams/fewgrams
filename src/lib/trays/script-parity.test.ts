import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidContentKey } from "@/lib/content/content-key";
import * as script from "../../../scripts/trays-fill.mjs";

/**
 * Ties `scripts/trays-fill.mjs` to the content folder it loads prices for.
 *
 * Same pairing as the seeds version, and for the same reason: the script is
 * the one place the suppliers' list is written down, the content folder is the
 * one place an item's copy lives, and a key in one and not the other is a
 * silent half-product — a priced row with no name (flagged red in admin,
 * invisible on the site) or written copy nobody can buy.
 *
 * With three items that is easy to eyeball; it is pinned anyway, because the
 * failure is invisible on the page rather than loud.
 */
const DIR = path.join(process.cwd(), "content", "trays");

async function contentKeys() {
  const entries = await readdir(DIR);
  return entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

describe("trays-fill.mjs and content/trays agree", () => {
  it("every priced item has copy, and every written item has a price", async () => {
    const priced = script.PRICE_LIST.map((r) => r.key).sort();
    expect(priced).toEqual(await contentKeys());
  });

  it("every key is a usable content key", () => {
    for (const { key } of script.PRICE_LIST) {
      expect(isValidContentKey(key), key).toBe(true);
    }
  });

  it("lists each item exactly once", () => {
    const keys = script.PRICE_LIST.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /** Every price is recorded as a whole rupee figure read off a supplier's
   *  page, and each row names the page it came from — see SPEC §23.6 on
   *  whether these are sell prices or costs. */
  it("holds whole-rupee prices, each with its source", () => {
    for (const { key, price, source } of script.PRICE_LIST) {
      expect(Number.isInteger(price) && price > 0, `${key}: ${price}`).toBe(true);
      expect(source, key).toBeTruthy();
    }
  });

  /** The three the owner supplied on 17 Sep 2026, at the prices their pages
   *  listed. Pinned because "add same price that is shown on the website" is
   *  the instruction, and a transcription slip is invisible afterwards. */
  it("carries the launch prices verbatim", () => {
    const byKey = Object.fromEntries(script.PRICE_LIST.map((r) => [r.key, r.price]));
    expect(byKey).toEqual({
      "tray-pair": 160,
      "tray-pair-food-grade": 270,
      "drain-cell-mat": 300,
    });
  });

  /** No arithmetic at zero markup — the launch state. A markup rounds up, so
   *  a marked-up price can never land below the figure it came from. */
  it("applies a markup and rounds up to the rupee", () => {
    expect(script.shelfPrice(160)).toBe(160);
    expect(script.shelfPrice(300, 40)).toBe(420);
    expect(script.shelfPrice(160, 33)).toBe(213); // 212.8
  });
});
