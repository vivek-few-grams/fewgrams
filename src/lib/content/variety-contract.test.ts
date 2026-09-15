import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EN_REQUIRED,
  FAQ_COUNT,
  KN_REQUIRED,
  checkVarietyFile,
} from "./variety-contract";

/**
 * The template guard.
 *
 * Every variety content file must follow one fixed shape, so the variety page
 * does not have to defend against a different structure per green. A template
 * documented only in a README is a suggestion; this makes it a test that fails
 * the build.
 *
 * Reads the real folder, so adding a variety is enough to bring it under the
 * contract — there is no list here to remember to update.
 */
const DIR = path.join(process.cwd(), "content", "varieties");

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

describe("variety content template", () => {
  it("every file conforms, and reports all faults at once", async () => {
    const files = await loadAll();
    expect(files.length, "no content files found").toBeGreaterThan(0);

    const problems = files.flatMap(({ key, raw }) => checkVarietyFile(key, raw));
    // Printed as a list so one run tells you everything to fix.
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("every file writes its English fields in the template's order", async () => {
    // Order is not a correctness issue, but a consistent order is what makes
    // two files diffable against each other, which is the point of a template.
    for (const { key, raw } of await loadAll()) {
      const written = Object.keys(raw.en);
      const expected = EN_REQUIRED.filter((f) => written.includes(f));
      expect(written, key).toEqual([...expected]);
    }
  });

  /**
   * The parity check with teeth.
   *
   * A key-presence contract is satisfied by pasting the English value into the
   * `kn` block, which is worse than a gap: the fallback would at least have
   * rendered English knowingly, whereas a pasted value looks translated to
   * everyone downstream. Every Kannada string must therefore contain Kannada
   * script.
   *
   * Nutrition *labels* are exempt by shape, not by name: "ವಿಟಮಿನ್ C" keeps its
   * Latin letter, and a value like "70%" has no letters at all.
   */
  it("every Kannada string is actually in Kannada", async () => {
    const KANNADA = /[\u0C80-\u0CFF]/;
    const offenders: string[] = [];

    for (const { key, raw } of await loadAll()) {
      const walk = (value: unknown, path: string) => {
        if (typeof value === "string") {
          const letters = value.replace(/[^\p{L}]/gu, "");
          if (letters.length > 0 && !KANNADA.test(value)) {
            offenders.push(`${key}.kn.${path} = ${JSON.stringify(value.slice(0, 50))}`);
          }
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((v, i) => walk(v, `${path}[${i}]`));
          return;
        }
        if (typeof value === "object" && value !== null) {
          for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
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
        const en = JSON.stringify(raw.en[field]);
        const kn = JSON.stringify(raw.kn[field]);
        if (en === kn) offenders.push(`${key}.${field}`);
      }
    }
    expect(offenders, `\nverbatim copies:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("the _template.json stub is itself the right shape, minus the prose", async () => {
    const raw = JSON.parse(await readFile(path.join(DIR, "_template.json"), "utf8"));
    expect(Object.keys(raw.en)).toEqual([...EN_REQUIRED]);
    expect(Object.keys(raw.kn)).toEqual([...KN_REQUIRED]);
    expect(raw.en.faq).toHaveLength(FAQ_COUNT);
    // It must NOT pass the contract — the fields are intentionally blank, and
    // a stub that validated would mean the contract accepts empty content.
    expect(checkVarietyFile("_template", raw).length).toBeGreaterThan(0);
  });
});

describe("checkVarietyFile", () => {
  const valid = {
    images: { hero: "hero.jpg", gallery: ["bunch.jpg"] },
    en: {
      name: "Test",
      shortDescription: "s",
      description: "d",
      flavourNotes: "f",
      growingTips: "g",
      nutrition: Array.from({ length: 5 }, (_, i) => ({ label: `l${i}`, value: "High" })),
      nutritionNote: "n",
      benefits: ["a", "b", "c"],
      cautions: ["x"],
      faq: Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: "a" })),
      imageAlt: "alt",
    },
    kn: {
      name: "n",
      shortDescription: "s",
      description: "d",
      flavourNotes: "f",
      growingTips: "g",
      nutrition: Array.from({ length: 5 }, (_, i) => ({ label: `l${i}`, value: "ಅಧಿಕ" })),
      nutritionNote: "n",
      benefits: ["a", "b", "c"],
      cautions: ["x"],
      faq: Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: "a" })),
      imageAlt: "a",
    },
  };

  it("passes a conforming file", () => {
    expect(checkVarietyFile("ok", valid)).toEqual([]);
  });

  it("catches a renamed field rather than silently ignoring it", () => {
    const rest = { ...valid.en };
    delete (rest as Record<string, unknown>).flavourNotes;
    const bad = { ...valid, en: { ...rest, taste: "peppery" } };
    const problems = checkVarietyFile("bad", bad);
    expect(problems).toContain("bad: en.taste is not a field in the template");
    expect(problems).toContain("bad: en.flavourNotes is required");
  });

  it("catches four or six FAQs", () => {
    for (const n of [4, 6]) {
      const bad = { ...valid, en: { ...valid.en, faq: valid.en.faq.slice(0, n) } };
      const problems = checkVarietyFile("bad", { ...bad, en: { ...bad.en, faq: Array.from({ length: n }, () => ({ question: "q", answer: "a" })) } });
      expect(problems.some((p) => p.includes("exactly 5")), `n=${n}`).toBe(true);
    }
  });

  it("catches present-but-empty content", () => {
    const bad = { ...valid, en: { ...valid.en, description: "   ", benefits: [] } };
    const problems = checkVarietyFile("bad", bad);
    expect(problems).toContain("bad: en.description must be a non-empty string");
    expect(problems).toContain("bad: en.benefits needs at least 3 entries");
  });

  it("requires Kannada to carry every field English carries", () => {
    const noKn = { ...valid };
    delete (noKn as Record<string, unknown>).kn;
    expect(checkVarietyFile("bad", noKn).some((p) => p.includes("missing"))).toBe(true);

    // A partial Kannada block used to pass. It must not: the English
    // fallback would render paragraphs of English on a Kannada page with
    // nothing to signal that the translation was never written.
    const partial = { ...valid, kn: { name: "n", shortDescription: "s", flavourNotes: "f" } };
    const problems = checkVarietyFile("bad", partial);
    expect(problems).toContain("bad: kn.description is required");
    expect(problems).toContain("bad: kn.faq is required");
    expect(problems).toContain("bad: kn.nutrition is required");

    // A Kannada block that is present but short is caught too — the shape
    // checks run once the field exists.
    const short = {
      ...valid,
      kn: { ...valid.kn, faq: valid.kn.faq.slice(0, 3), benefits: ["only-one"] },
    };
    const shortProblems = checkVarietyFile("bad", short);
    expect(shortProblems).toContain("bad: kn.faq must have exactly 5 entries");
    expect(shortProblems).toContain("bad: kn.benefits needs at least 3 entries");
  });

  it("requires a hero image and at least one gallery shot", () => {
    const problems = checkVarietyFile("bad", { ...valid, images: { gallery: [] } });
    expect(problems).toContain("bad: images.hero is required");
    expect(problems).toContain("bad: images.gallery needs at least one filename");
  });
});
