import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_TRAY_SPEC_ROWS,
  TRAY_EN_REQUIRED,
  TRAY_KN_REQUIRED,
  checkTrayFile,
} from "./tray-contract";

/**
 * The tray template guard — the same contract test varieties and seeds have,
 * run over `content/trays/`.
 *
 * Reads the real folder, so adding an item is enough to bring it under the
 * contract: there is no list here to remember to update. That matters here for
 * the same reason as for seeds — an item can be *priced* from the admin screen
 * in seconds while its copy is written later, and this is what stops "later"
 * becoming "never, and half-written".
 */
const DIR = path.join(process.cwd(), "content", "trays");

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

describe("tray content template", () => {
  it("every file conforms, and reports all faults at once", async () => {
    const files = await loadAll();
    expect(files.length, "no tray content files found").toBeGreaterThan(0);

    const problems = files.flatMap(({ key, raw }) => checkTrayFile(key, raw));
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("every file writes its English fields in the template's order", async () => {
    for (const { key, raw } of await loadAll()) {
      const written = Object.keys(raw.en);
      const expected = TRAY_EN_REQUIRED.filter((f) => written.includes(f));
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
      for (const field of TRAY_EN_REQUIRED) {
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
    expect(Object.keys(raw.en)).toEqual([...TRAY_EN_REQUIRED]);
    expect(Object.keys(raw.kn)).toEqual([...TRAY_KN_REQUIRED]);
    expect(raw.en.specs).toHaveLength(MIN_TRAY_SPEC_ROWS);
    // It must NOT pass the contract — the fields are intentionally blank, and
    // a stub that validated would mean the contract accepts empty content.
    expect(checkTrayFile("_template", raw).length).toBeGreaterThan(0);
  });
});

describe("checkTrayFile", () => {
  const text = {
    name: "Test tray",
    shortDescription: "One line of judgement.",
    specs: Array.from({ length: MIN_TRAY_SPEC_ROWS }, (_, i) => ({
      label: `l${i}`,
      value: "v",
    })),
    imageAlt: "alt",
  };
  const valid = { en: text, kn: { ...text } };

  it("passes a conforming file", () => {
    expect(checkTrayFile("ok", valid)).toEqual([]);
  });

  /** Optional, like seeds: the photography does not exist and the grid falls
   *  back to the Sprout mark. Failing on it would block the copy being
   *  written at all — the wrong order of work. */
  it("accepts a file with no images at all", () => {
    expect(checkTrayFile("ok", { ...valid, images: {} })).toEqual([]);
  });

  it("still checks images once a file declares them", () => {
    expect(checkTrayFile("bad", { ...valid, images: { hero: "  " } })).toContain(
      "bad: images.hero is required",
    );
  });

  /**
   * The fields a borrowed seed template would have brought with it. A tray has
   * no description, no FAQ and no sowing guide, and the contract has to refuse
   * them rather than ignore them — an unknown field is a typo or a
   * copy-and-paste from the wrong template, and both are worth failing on.
   */
  it.each(["description", "faq", "sowing", "specsNote", "uses", "cautions"])(
    "refuses a borrowed %s field",
    (field) => {
      const problems = checkTrayFile("bad", {
        ...valid,
        en: { ...text, [field]: "x" },
      });
      expect(problems).toContain(`bad: en.${field} is not a field in the template`);
    },
  );

  it("catches a spec table that is present but thin", () => {
    const problems = checkTrayFile("bad", {
      ...valid,
      en: { ...text, specs: text.specs.slice(0, 2) },
    });
    expect(problems).toContain(`bad: en.specs needs at least ${MIN_TRAY_SPEC_ROWS} rows`);
  });

  it("catches a spec row missing its value", () => {
    const problems = checkTrayFile("bad", {
      ...valid,
      en: { ...text, specs: [...text.specs.slice(1), { label: "Size", value: "" }] },
    });
    expect(problems).toContain("bad: en.specs rows each need a label and a value");
  });

  it("requires Kannada to carry every field English carries", () => {
    expect(checkTrayFile("bad", { en: text }).some((p) => p.includes("missing"))).toBe(true);

    const problems = checkTrayFile("bad", { ...valid, kn: { name: "n" } });
    expect(problems).toContain("bad: kn.shortDescription is required");
    expect(problems).toContain("bad: kn.specs is required");
  });
});
