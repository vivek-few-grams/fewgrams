import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEED_EN_REQUIRED,
  SEED_FAQ_COUNT,
  SEED_KN_REQUIRED,
  checkSeedFile,
} from "./seed-contract";

/**
 * The seed template guard — the same contract test the varieties have, run
 * over `content/seeds/`.
 *
 * Reads the real folder, so adding a seed is enough to bring it under the
 * contract: there is no list here to remember to update. That matters more for
 * seeds than for varieties, because a seed can be *priced and stocked* from
 * the admin screen in seconds while its copy is written later — this is what
 * stops "later" becoming "never, and half-written".
 */
const DIR = path.join(process.cwd(), "content", "seeds");

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

describe("seed content template", () => {
  it("every file conforms, and reports all faults at once", async () => {
    const files = await loadAll();
    expect(files.length, "no seed content files found").toBeGreaterThan(0);

    const problems = files.flatMap(({ key, raw }) => checkSeedFile(key, raw));
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("every file writes its English fields in the template's order", async () => {
    for (const { key, raw } of await loadAll()) {
      const written = Object.keys(raw.en);
      const expected = SEED_EN_REQUIRED.filter((f) => written.includes(f));
      expect(written, key).toEqual([...expected]);
    }
  });

  /** Same reasoning as the variety version: a pasted English value satisfies a
   *  key-presence check while being no translation at all, and looks
   *  translated to everyone downstream. */
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
      for (const field of SEED_EN_REQUIRED) {
        if (JSON.stringify(raw.en[field]) === JSON.stringify(raw.kn[field])) {
          offenders.push(`${key}.${field}`);
        }
      }
    }
    expect(offenders, `\nverbatim copies:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("the _template.json stub is itself the right shape, minus the prose", async () => {
    const raw = JSON.parse(await readFile(path.join(DIR, "_template.json"), "utf8"));
    expect(Object.keys(raw.en)).toEqual([...SEED_EN_REQUIRED]);
    expect(Object.keys(raw.kn)).toEqual([...SEED_KN_REQUIRED]);
    expect(raw.en.faq).toHaveLength(SEED_FAQ_COUNT);
    // It must NOT pass the contract — the fields are intentionally blank, and
    // a stub that validated would mean the contract accepts empty content.
    expect(checkSeedFile("_template", raw).length).toBeGreaterThan(0);
  });
});

describe("checkSeedFile", () => {
  const text = {
    name: "Test seed",
    shortDescription: "s",
    description: "d",
    sowing: "sow it",
    specs: Array.from({ length: 4 }, (_, i) => ({ label: `l${i}`, value: "90%" })),
    specsNote: "n",
    uses: ["a", "b"],
    cautions: ["x"],
    faq: Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: "a" })),
    imageAlt: "alt",
  };
  const valid = { en: text, kn: { ...text } };

  it("passes a conforming file", () => {
    expect(checkSeedFile("ok", valid)).toEqual([]);
  });

  /**
   * The one structural difference from the variety contract, and it is
   * deliberate: the seed packet photography does not exist yet, and the detail
   * page falls back to the Sprout mark. Failing on it would block the copy
   * being written at all — the wrong order of work.
   */
  it("accepts a file with no images at all", () => {
    expect(checkSeedFile("ok", valid)).toEqual([]);
    expect(checkSeedFile("ok", { ...valid, images: {} })).toEqual([]);
  });

  it("still checks images once a file declares them", () => {
    const problems = checkSeedFile("bad", { ...valid, images: { hero: "  " } });
    expect(problems).toContain("bad: images.hero is required");
    expect(checkSeedFile("bad", { ...valid, images: { cutout: true } })).toContain(
      "bad: images.cutout must be a filename when present",
    );
  });

  /**
   * The other deliberate difference. The day-count ban exists for varieties
   * because `growDays` lives in DynamoDB and prose would contradict it. A seed
   * has no such field, and "soak eight hours, uncover on day two" is exactly
   * the advice a grower needs.
   */
  it("allows a day count in the sowing instructions", () => {
    const sowing = "Soak 8 hours. Uncover on day 2. Cut 8 to 12 days from sowing.";
    expect(checkSeedFile("ok", { ...valid, en: { ...text, sowing } })).toEqual([]);
  });

  it("catches a field renamed from the variety template", () => {
    const rest = { ...text } as Record<string, unknown>;
    delete rest.sowing;
    const problems = checkSeedFile("bad", { ...valid, en: { ...rest, growingTips: "g" } });
    expect(problems).toContain("bad: en.growingTips is not a field in the template");
    expect(problems).toContain("bad: en.sowing is required");
  });

  it("catches a spec table or a use list that is present but thin", () => {
    const problems = checkSeedFile("bad", {
      ...valid,
      en: { ...text, specs: text.specs.slice(0, 2), uses: ["only one"] },
    });
    expect(problems).toContain("bad: en.specs needs at least 4 rows");
    expect(problems).toContain("bad: en.uses needs at least 2 entries");
  });

  it("requires Kannada to carry every field English carries", () => {
    const noKn = { en: text };
    expect(checkSeedFile("bad", noKn).some((p) => p.includes("missing"))).toBe(true);

    const partial = { ...valid, kn: { name: "n", shortDescription: "s" } };
    const problems = checkSeedFile("bad", partial);
    expect(problems).toContain("bad: kn.sowing is required");
    expect(problems).toContain("bad: kn.specs is required");
    expect(problems).toContain("bad: kn.faq is required");
  });
});
