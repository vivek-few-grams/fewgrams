import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidContentKey } from "@/lib/content/content-key";
import { isValidMediumLeadDays } from "./lead-time";
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

  /** The script writes `leadDays` straight onto the row, bypassing the form
   *  that validates it — so the figures in it have to satisfy the same rule
   *  the admin screen enforces, or the script could seed a row the owner
   *  cannot save an edit to. */
  it("only carries lead times the admin screen would accept", () => {
    for (const { key, leadDays } of script.PRICE_LIST) {
      expect(isValidMediumLeadDays(leadDays), `${key}: ${leadDays} days`).toBe(true);
    }
  });

  /** Every price is recorded as a whole rupee figure read off a supplier's
   *  page, and each row names the page it came from — see SPEC §24.6 on
   *  whether these are sell prices or costs. */
  it("holds whole-rupee prices, each with its source", () => {
    for (const { key, price, source } of script.PRICE_LIST) {
      expect(Number.isInteger(price) && price > 0, `${key}: ${price}`).toBe(true);
      expect(source, key).toBeTruthy();
    }
  });

  /** IFFCO Urban Gardens' listed prices on 24 Sep 2026 — pinned because a
   *  transcription slip is invisible afterwards. */
  it("carries the launch prices verbatim", () => {
    const byKey = Object.fromEntries(script.PRICE_LIST.map((r) => [r.key, r.price]));
    expect(byKey).toEqual({
      "horti-coir": 399,
      "horti-coir-bulk": 699,
    });
  });

  /** No arithmetic at zero markup — the launch state. A markup rounds up, so
   *  a marked-up price can never land below the figure it came from. */
  it("applies a markup and rounds up to the rupee", () => {
    expect(script.shelfPrice(399)).toBe(399);
    expect(script.shelfPrice(699, 10)).toBe(769); // 768.9
  });
});
