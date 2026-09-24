import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROW_MEDIUM_EN_REQUIRED,
  GROW_MEDIUM_KN_REQUIRED,
  MIN_GROW_MEDIUM_SPEC_ROWS,
  MIN_GROW_MEDIUM_STEPS,
  checkGrowMediumFile,
} from "./grow-media-contract";

/**
 * The grow-media template guard — the tray contract test run over
 * `content/grow-media/`, plus the `howToUse` steps. Reads the real folder, so
 * adding a file brings it under the contract with nothing to update here.
 */
const DIR = path.join(process.cwd(), "content", "grow-media");

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

describe("grow media content template", () => {
  it("every file conforms, and reports all faults at once", async () => {
    const files = await loadAll();
    expect(files.length, "no grow media content files found").toBeGreaterThan(0);

    const problems = files.flatMap(({ key, raw }) => checkGrowMediumFile(key, raw));
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("every file writes its English fields in the template's order", async () => {
    for (const { key, raw } of await loadAll()) {
      const written = Object.keys(raw.en);
      const expected = GROW_MEDIUM_EN_REQUIRED.filter((f) => written.includes(f));
      expect(written, key).toEqual([...expected]);
    }
  });

  /** Same reasoning as the variety and seed versions: a pasted English value
   *  satisfies a key-presence check while being no translation at all, and
   *  looks translated to everyone downstream. */
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
      for (const field of GROW_MEDIUM_EN_REQUIRED) {
        if (JSON.stringify(raw.en[field]) === JSON.stringify(raw.kn[field])) {
          offenders.push(`${key}.${field}`);
        }
      }
    }
    expect(offenders, `\nverbatim copies:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  /**
   * The rule that keeps the card from contradicting itself. Price and lead
   * time are both printed from DynamoDB and both get tuned — the price when a
   * supplier's does, the lead time when a supplier gets slower — so copy that
   * restates either goes stale the first time the owner edits a row. Same
   * reasoning as the `growDays` ban on variety copy, enforced here as a scan
   * rather than as a template rule, because it is about *values* appearing in
   * prose rather than about a field existing.
   */
  it("no copy states a rupee price or a day count", async () => {
    const MONEY = /₹\s*\d|\b(?:rs|inr)\b\s*\.?\s*\d/i;
    /* `\b` is ASCII-only even under `u`, so the Kannada alternative carries
       no boundaries — `\bದಿನ\b` would never match anything. */
    const DAYS = /\b\d+\s*(?:working\s+)?days?\b|ದಿನ/iu;
    const offenders: string[] = [];

    for (const { key, raw } of await loadAll()) {
      const walk = (value: unknown, at: string) => {
        if (typeof value === "string") {
          if (MONEY.test(value)) offenders.push(`${key}.${at} states a price`);
          if (DAYS.test(value)) offenders.push(`${key}.${at} states a day count`);
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
      walk(raw.en, "en");
      walk(raw.kn, "kn");
    }

    expect(offenders, `\n${offenders.join("\n")}\n`).toEqual([]);
  });

  it("the _template.json stub is itself the right shape, minus the prose", async () => {
    const raw = JSON.parse(await readFile(path.join(DIR, "_template.json"), "utf8"));
    expect(Object.keys(raw.en)).toEqual([...GROW_MEDIUM_EN_REQUIRED]);
    expect(Object.keys(raw.kn)).toEqual([...GROW_MEDIUM_KN_REQUIRED]);
    expect(raw.en.specs).toHaveLength(MIN_GROW_MEDIUM_SPEC_ROWS);
    expect(raw.en.howToUse).toHaveLength(MIN_GROW_MEDIUM_STEPS);
    // It must NOT pass the contract — the fields are intentionally blank, and
    // a stub that validated would mean the contract accepts empty content.
    expect(checkGrowMediumFile("_template", raw).length).toBeGreaterThan(0);
  });
});

describe("checkGrowMediumFile", () => {
  const text = {
    name: "Test block",
    shortDescription: "One line of judgement.",
    specs: Array.from({ length: MIN_GROW_MEDIUM_SPEC_ROWS }, (_, i) => ({
      label: `l${i}`,
      value: "v",
    })),
    howToUse: Array.from({ length: MIN_GROW_MEDIUM_STEPS }, (_, i) => `step ${i}`),
    whyTitle: "Why it matters",
    why: "Because it does.",
    ourNote: "We grow in this ourselves.",
    imageAlt: "alt",
  };
  const valid = { en: text, kn: { ...text } };

  it("passes a conforming file", () => {
    expect(checkGrowMediumFile("ok", valid)).toEqual([]);
  });

  it("accepts a file with no images at all", () => {
    expect(checkGrowMediumFile("ok", { ...valid, images: {} })).toEqual([]);
  });

  /** The field that makes this its own template: a block has to be prepared,
   *  and fewer than three steps is not a method. */
  it("requires the preparation steps", () => {
    const { howToUse: _omit, ...noSteps } = text;
    void _omit;
    expect(checkGrowMediumFile("bad", { ...valid, en: noSteps })).toContain(
      "bad: en.howToUse is required",
    );
    expect(
      checkGrowMediumFile("bad", { ...valid, en: { ...text, howToUse: ["soak"] } }).length,
    ).toBeGreaterThan(0);
  });

  /** The badge stands on it, so an item without one cannot be listed. */
  it("requires our own note", () => {
    const { ourNote: _omit, ...noNote } = text;
    void _omit;
    expect(checkGrowMediumFile("bad", { ...valid, en: noNote })).toContain(
      "bad: en.ourNote is required",
    );
  });

  it.each(["description", "faq", "sowing", "specsNote", "cautions"])(
    "refuses a borrowed %s field",
    (field) => {
      const problems = checkGrowMediumFile("bad", {
        ...valid,
        en: { ...text, [field]: "x" },
      });
      expect(problems).toContain(`bad: en.${field} is not a field in the template`);
    },
  );

  it("catches a spec table that is present but thin", () => {
    const problems = checkGrowMediumFile("bad", {
      ...valid,
      en: { ...text, specs: text.specs.slice(0, 2) },
    });
    expect(problems).toContain(`bad: en.specs needs at least ${MIN_GROW_MEDIUM_SPEC_ROWS} rows`);
  });
});
