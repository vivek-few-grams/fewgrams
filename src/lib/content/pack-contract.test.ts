import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EN_REQUIRED, KN_REQUIRED, MIN_HIGHLIGHTS, checkPackFile } from "./pack-contract";

/**
 * The pack template guard — the sibling of `plan-contract.test.ts`, reading
 * the real folder so a new pack is under the contract the moment it exists.
 */
const DIR = path.join(process.cwd(), "content", "packs");

async function loadAll() {
  const entries = await readdir(DIR);
  const keys = entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
  return Promise.all(
    keys.map(async (key) => ({
      key,
      raw: JSON.parse(await readFile(path.join(DIR, `${key}.json`), "utf8")),
    })),
  );
}

describe("pack content template", () => {
  it("every file conforms, and reports all faults at once", async () => {
    const files = await loadAll();
    expect(files.length, "no pack content files found").toBeGreaterThan(0);

    const problems = files.flatMap(({ key, raw }) => checkPackFile(key, raw));
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("every file writes its English fields in the template's order", async () => {
    for (const { key, raw } of await loadAll()) {
      const written = Object.keys(raw.en);
      const expected = EN_REQUIRED.filter((f) => written.includes(f));
      expect(written, key).toEqual([...expected]);
    }
  });

  it("every Kannada string is actually in Kannada", async () => {
    const KANNADA = /[ಀ-೿]/;
    const offenders: string[] = [];
    for (const { key, raw } of await loadAll()) {
      const walk = (value: unknown, at: string) => {
        if (typeof value === "string") {
          const letters = value.replace(/[^\p{L}]/gu, "");
          if (letters.length > 0 && !KANNADA.test(value)) {
            offenders.push(`${key}.kn.${at} = ${JSON.stringify(value.slice(0, 50))}`);
          }
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((v, i) => walk(v, `${at}[${i}]`));
          return;
        }
        if (typeof value === "object" && value !== null) {
          for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k);
        }
      };
      walk(raw.kn, "");
    }
    expect(offenders, `\nnot translated:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("no Kannada value is a verbatim copy of its English", async () => {
    const offenders: string[] = [];
    for (const { key, raw } of await loadAll()) {
      for (const field of EN_REQUIRED) {
        if (JSON.stringify(raw.en[field]) === JSON.stringify(raw.kn[field])) {
          offenders.push(`${key}.${field}`);
        }
      }
    }
    expect(offenders, `\nverbatim copies:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("the _template.json stub is itself the right shape, minus the prose", async () => {
    const raw = JSON.parse(await readFile(path.join(DIR, "_template.json"), "utf8"));
    expect(Object.keys(raw.en)).toEqual([...EN_REQUIRED]);
    expect(Object.keys(raw.kn)).toEqual([...KN_REQUIRED]);
    expect(raw.en.highlights).toHaveLength(MIN_HIGHLIGHTS);
    expect(checkPackFile("_template", raw).length).toBeGreaterThan(0);
  });
});

describe("checkPackFile", () => {
  const ok = {
    name: "Single Rack Pack",
    badge: "Start here",
    tagline: "One rack, a tray on every shelf.",
    description: "A rack sized for our trays.",
    highlights: ["One", "Two", "Three"],
  };
  const kn = {
    name: "ಒಂದು ರ್ಯಾಕ್ ಪ್ಯಾಕ್",
    badge: "ಇಲ್ಲಿಂದ",
    tagline: "ಒಂದು ರ್ಯಾಕ್.",
    description: "ರ್ಯಾಕ್.",
    highlights: ["ಒಂದು", "ಎರಡು", "ಮೂರು"],
  };

  it("accepts a complete file", () => {
    expect(checkPackFile("x", { en: ok, kn })).toEqual([]);
  });

  it("refuses a price, a weight and the city, in either language", () => {
    const problems = checkPackFile("x", {
      en: { ...ok, tagline: "Only ₹9,999", description: "With 100 g of each seed" },
      kn: { ...kn, badge: "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಭೇಟಿ" },
    });
    expect(problems.some((p) => p.includes("en.tagline") && p.includes("price"))).toBe(true);
    expect(problems.some((p) => p.includes("en.description") && p.includes("weight"))).toBe(true);
    expect(problems.some((p) => p.includes("kn.badge") && p.includes("city"))).toBe(true);
  });

  it("refuses a missing Kannada block and an unknown field", () => {
    expect(checkPackFile("x", { en: ok })).toEqual([expect.stringContaining('missing "kn"')]);
    expect(checkPackFile("x", { en: { ...ok, price: "1" }, kn })).toEqual([
      expect.stringContaining("en.price is not a field"),
    ]);
  });
});
