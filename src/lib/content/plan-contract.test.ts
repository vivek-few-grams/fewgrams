import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EN_REQUIRED, KN_REQUIRED, MIN_HIGHLIGHTS, checkPlanFile } from "./plan-contract";

/**
 * The plan template guard — the sibling of `variety-contract.test.ts`.
 *
 * Reads the real folder, so adding a plan is enough to bring it under the
 * contract; there is no list here to remember to update.
 */
const DIR = path.join(process.cwd(), "content", "plans");

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

describe("plan content template", () => {
  it("every file conforms, and reports all faults at once", async () => {
    const files = await loadAll();
    expect(files.length, "no plan content files found").toBeGreaterThan(0);

    const problems = files.flatMap(({ key, raw }) => checkPlanFile(key, raw));
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("every file writes its English fields in the template's order", async () => {
    for (const { key, raw } of await loadAll()) {
      const written = Object.keys(raw.en);
      const expected = EN_REQUIRED.filter((f) => written.includes(f));
      expect(written, key).toEqual([...expected]);
    }
  });

  /**
   * Parity with teeth. A key-presence contract is satisfied by pasting the
   * English value into `kn`, which is worse than a gap: the fallback would at
   * least have rendered English knowingly, whereas a pasted value looks
   * translated to everyone downstream.
   */
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
    // It must NOT pass the contract — the fields are intentionally blank, and
    // a stub that validated would mean the contract accepts empty copy.
    expect(checkPlanFile("_template", raw).length).toBeGreaterThan(0);
  });
});

describe("checkPlanFile", () => {
  const valid = {
    en: {
      name: "Essential",
      badge: "Recommended",
      tagline: "The everyday greens.",
      description: "The basics, on rotation.",
      highlights: ["Sown to order", "Cut that morning", "Delivery included"],
    },
    kn: {
      name: "ಅಗತ್ಯ",
      badge: "ಶಿಫಾರಸು",
      tagline: "ದಿನನಿತ್ಯದ ಸೊಪ್ಪು.",
      description: "ಮೂಲಭೂತ ಸೊಪ್ಪುಗಳು.",
      highlights: ["ಆರ್ಡರ್ ನಂತರ ಬಿತ್ತನೆ", "ಅದೇ ಬೆಳಿಗ್ಗೆ ಕತ್ತರಿಸಿದ್ದು", "ಡೆಲಿವರಿ ಸೇರಿದೆ"],
    },
  };

  it("passes a conforming file", () => {
    expect(checkPlanFile("ok", valid)).toEqual([]);
  });

  it("catches a renamed field rather than silently ignoring it", () => {
    const rest = { ...valid.en } as Record<string, unknown>;
    delete rest.tagline;
    const problems = checkPlanFile("bad", { ...valid, en: { ...rest, blurb: "oops" } });
    expect(problems).toContain("bad: en.blurb is not a field in the template");
    expect(problems).toContain("bad: en.tagline is required");
  });

  it("catches present-but-empty copy", () => {
    const problems = checkPlanFile("bad", {
      ...valid,
      en: { ...valid.en, description: "   ", highlights: ["only one"] },
    });
    expect(problems).toContain("bad: en.description must be a non-empty string");
    expect(problems).toContain(
      `bad: en.highlights needs at least ${MIN_HIGHLIGHTS} entries`,
    );
  });

  it("requires Kannada to carry every field English carries", () => {
    const noKn = { ...valid } as Record<string, unknown>;
    delete noKn.kn;
    expect(checkPlanFile("bad", noKn).some((p) => p.includes("missing"))).toBe(true);

    const partial = { ...valid, kn: { name: "ಅಗತ್ಯ" } };
    const problems = checkPlanFile("bad", partial);
    expect(problems).toContain("bad: kn.badge is required");
    expect(problems).toContain("bad: kn.tagline is required");
    expect(problems).toContain("bad: kn.description is required");
    expect(problems).toContain("bad: kn.highlights is required");
  });

  /**
   * The rule that caught real drift on varieties, applied to the two figures a
   * plan owns. Both live in DynamoDB, are printed on the card by the
   * component, and are expected to be tuned — so copy that restates them
   * contradicts the card a few pixels away the first time they move.
   */
  it("refuses copy that restates the price", () => {
    for (const bad of ["₹1,200 a month", "Just 1200 rupees", "Rs 1200 monthly"]) {
      const problems = checkPlanFile("bad", {
        ...valid,
        en: { ...valid.en, tagline: bad },
      });
      expect(problems.some((p) => p.includes("states a price")), bad).toBe(true);
    }
    // Kannada too, in Kannada digits and its own currency word.
    const kn = checkPlanFile("bad", {
      ...valid,
      kn: { ...valid.kn, tagline: "ತಿಂಗಳಿಗೆ ೧೨೦೦ ರೂ" },
    });
    expect(kn.some((p) => p.includes("states a price"))).toBe(true);
  });

  it("refuses copy that restates the box weight", () => {
    for (const bad of ["400 g every Saturday", "500g a week", "400 grams a box"]) {
      const problems = checkPlanFile("bad", {
        ...valid,
        en: { ...valid.en, highlights: [bad, "b", "c"] },
      });
      expect(problems.some((p) => p.includes("states a gram weight")), bad).toBe(true);
    }
    const kn = checkPlanFile("bad", {
      ...valid,
      kn: { ...valid.kn, description: "ವಾರಕ್ಕೆ ೪೦೦ ಗ್ರಾಂ" },
    });
    expect(kn.some((p) => p.includes("states a gram weight"))).toBe(true);
  });

  /** The guard must not fire on ordinary copy that happens to contain a word
   *  starting with "g", or on the real files' phrasing. */
  it("leaves figure-free copy alone", () => {
    const ok = checkPlanFile("ok", {
      ...valid,
      en: {
        ...valid.en,
        description: "Priced by weight, so a box of wheatgrass and a box of amaranth differ.",
        highlights: ["Enough greens for a salad a day", "Grown to order", "Delivery included"],
      },
    });
    expect(ok).toEqual([]);
  });
});
