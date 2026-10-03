import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidContentKey } from "@/lib/content/content-key";
import * as script from "../../../scripts/grow-media-fill.mjs";

/**
 * Ties `scripts/grow-media-fill.mjs` to `content/grow-media/` — the tray
 * parity test for this category. A key in one and not the other is a priced
 * row with no name, or copy nobody can buy.
 */
const DIR = path.join(process.cwd(), "content", "grow-media");

async function contentKeys() {
  const entries = await readdir(DIR);
  return entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

describe("grow-media-fill.mjs and content/grow-media agree", () => {
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
   *  page, and each row names the page it came from — see SPEC §24.6 on
   *  whether these are sell prices or costs. */
  it("holds whole-rupee costs, each with its source", () => {
    for (const { key, cost, source } of script.PRICE_LIST) {
      expect(Number.isInteger(cost) && cost > 0, `${key}: ${cost}`).toBe(true);
      expect(source, key).toBeTruthy();
    }
  });

  /** The supplier's quotation of 3 Oct 2026 — pinned because a transcription
   *  slip is invisible afterwards. */
  it("carries the quoted costs verbatim", () => {
    const byKey = Object.fromEntries(script.PRICE_LIST.map((r) => [r.key, r.cost]));
    expect(byKey).toEqual({
      "horti-coir": 300,
      "horti-coir-small": 70,
    });
  });

  /** Each row's own margin; a blank half prices at cost to the rupee — the
   *  admin screen's rule. */
  it("prices each row at its own margin, at cost where none is set", () => {
    expect(script.marginFrom(undefined)).toEqual({ markupPercent: 0, roundUpToNearest: 1 });
    expect(script.marginFrom({ markupPercent: 25, roundUpToNearest: 10, PK: "x" })).toEqual({
      markupPercent: 25,
      roundUpToNearest: 10,
    });
    expect(script.marginFrom({ markupPercent: 30 })).toEqual({ markupPercent: 30, roundUpToNearest: 1 });
  });
});
