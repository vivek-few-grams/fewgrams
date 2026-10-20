import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TASTES, type Taste } from "./tastes";
import {
  distance,
  prepare,
  queryTokens,
  rank,
  SEARCH_KINDS,
  stem,
  tokens,
  type SearchKind,
  type SearchTerms,
} from "./match";

/**
 * Search matching — SPEC §27.
 *
 * The ranking tests run against the **real catalogue text**, read straight
 * from `content/` the way `catalogue.ts` assembles it, because the cases that
 * matter are about real names: "Radish" against "Radish (pink)", "Cabbage
 * (red)" against "Red Cabbage", Kannada names with a zero-width joiner in
 * them. A hand-made fixture would pass while the shelf it stands for failed.
 */

type Entry = { kind: SearchKind; key: string; name: string; terms: SearchTerms };

const ROOT = process.cwd();
const json = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
const kinds = (kind: SearchKind) =>
  ["en", "kn"].map((locale) => json(`messages/${locale}/search.json`).kinds[kind] as string);

const FOLDERS: Array<[SearchKind, string]> = [
  ["variety", "varieties"],
  ["seed", "seeds"],
  ["tray", "trays"],
  ["media", "grow-media"],
];

const catalogue: Entry[] = FOLDERS.flatMap(([kind, folder]) =>
  readdirSync(path.join(ROOT, "content", folder))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      const file = json(`content/${folder}/${f}`);
      return {
        kind,
        key: f.slice(0, -".json".length),
        name: file.en.name,
        terms: {
          names: [file.en.name, file.kn?.name].filter(Boolean),
          kind: kinds(kind),
          blurbs: [file.en.shortDescription, file.kn?.shortDescription].filter(Boolean),
        },
      };
    }),
);

const prepared = prepare(catalogue);
const search = (query: string, locale = "en") =>
  rank(prepared, query, locale).map((e) => `${e.kind}:${e.key}`);

describe("words", () => {
  it("splits on anything that is not a letter, mark or digit", () => {
    expect(tokens("Horti-Coir cocopeat — 5 kg block")).toEqual([
      "horti",
      "coir",
      "cocopeat",
      "5",
      "kg",
      "block",
    ]);
  });

  it("splits a figure off the unit, so 5kg meets 5 kg", () => {
    expect(tokens("5kg")).toEqual(["5", "kg"]);
  });

  it("keeps Kannada vowel signs, which are combining marks", () => {
    expect(tokens("ಮೂಲಂಗಿ (ಗುಲಾಬಿ)")).toEqual(["ಮೂಲಂಗಿ", "ಗುಲಾಬಿ"]);
  });

  it("ignores a zero-width joiner, typed or not", () => {
    expect(tokens("ಬೀಟ್‌ರೂಟ್")).toEqual(tokens("ಬೀಟ್ರೂಟ್"));
  });

  it("cuts an English plural back to its singular, and leaves the rest alone", () => {
    expect(["trays", "radishes", "microgreens", "seeds", "boxes"].map(stem)).toEqual([
      "tray",
      "radish",
      "microgreen",
      "seed",
      "box",
    ]);
    expect(["cress", "amaranthus", "swiss", "ಬೀಜಗಳು", "kg"].map(stem)).toEqual([
      "cress",
      "amaranthus",
      "swiss",
      "ಬೀಜಗಳು",
      "kg",
    ]);
  });

  it("drops stop words, unless they are the whole query", () => {
    expect(queryTokens("the radish")).toEqual(["radish"]);
    expect(queryTokens("the")).toEqual(["the"]);
  });

  it("counts an adjacent swap as one edit, and a Kannada letter as one step", () => {
    expect(distance("brocolli", "broccoli", 2)).toBe(2);
    expect(distance("sunflwoer", "sunflower", 2)).toBe(1);
    expect(distance("ಮೂಲಂಗಿ", "ಮೂಲಂಗ", 1)).toBe(1);
    expect(distance("radish", "spinach", 1)).toBe(2);
  });
});

describe("ranking the real catalogue", () => {
  it("puts the exact name first, then the same name as a seed", () => {
    expect(search("radish").slice(0, 2)).toEqual(["variety:radish", "seed:radish"]);
  });

  it("narrows by the category word", () => {
    const hits = search("radish seeds");
    expect(hits[0]).toBe("seed:radish");
    expect(hits).not.toContain("variety:radish");
  });

  it("finds a Kannada name from an English page", () => {
    expect(search("ಮೂಲಂಗಿ")).toEqual(expect.arrayContaining(["variety:radish", "seed:radish"]));
  });

  it("forgives a typo in a name, whole or half typed", () => {
    expect(search("brocoli")[0]).toMatch(/:broccoli$/);
    expect(search("brocol")[0]).toMatch(/:broccoli$/);
    expect(search("sunflwer")[0]).toMatch(/:sunflower$/);
  });

  it("still forgives a typo after the first letter", () => {
    expect(search("basl")[0]).toMatch(/:basil$/);
  });

  it("suggests while a word is still being typed", () => {
    expect(search("sunf")[0]).toMatch(/:sunflower$/);
    expect(search("cocop").every((hit) => hit.startsWith("media:"))).toBe(true);
  });

  it("lists a whole shelf for its category's name, that shelf first", () => {
    const seeds = catalogue.filter((e) => e.kind === "seed").length;
    expect(
      search("seeds")
        .slice(0, seeds)
        .every((hit) => hit.startsWith("seed:")),
    ).toBe(true);
    expect(
      search("ಬೀಜಗಳು")
        .slice(0, seeds)
        .every((hit) => hit.startsWith("seed:")),
    ).toBe(true);
  });

  it("needs every word to match — red cabbage is not every red thing", () => {
    const hits = search("red cabbage");
    expect(hits).toEqual(expect.arrayContaining(["variety:red-cabbage", "seed:red-cabbage"]));
    expect(hits).not.toContain("variety:red-onion");
  });

  it("finds a product by a word in its description", () => {
    expect(search("peppery")).toContain("variety:radish");
  });

  it("finds nothing for nonsense, and nothing for nothing", () => {
    expect(search("zzzzqx")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });
});

describe("a typo is never forgiven in the first letter", () => {
  /* "pack" is one edit from "rack", so before this rule a search for a pack
     of trays listed every rack range under the "Racks" category word. */
  const rack: Entry = {
    kind: "rack",
    key: "shelf",
    name: "Shelf racks",
    terms: { names: ["Shelf racks"], kind: ["Racks"], blurbs: [] },
  };

  it("does not let 'pack' match 'racks'", () => {
    expect(rank(prepare([rack]), "pack", "en")).toEqual([]);
    expect(rank(prepare([rack]), "rakcs", "en")).toEqual([rack]);
  });
});

describe("a description is matched exactly, never fuzzily", () => {
  const entry: Entry = {
    kind: "tray",
    key: "fixture",
    name: "Fixture",
    terms: { names: ["Fixture"], kind: ["Trays"], blurbs: ["Everything you need"] },
  };

  it("does not let 'seed' match 'need'", () => {
    expect(rank(prepare([entry]), "seed", "en")).toEqual([]);
    expect(rank(prepare([entry]), "need", "en")).toEqual([entry]);
  });
});

describe("taste chips", () => {
  /* A chip types its own label in, so the label has to be a word that
     language's descriptions use — see `tastes.ts`. A chip that found one
     product, or none, would be a dead end dressed as a suggestion. */
  it.each(["en", "kn"])("every %s chip finds at least two products", (locale) => {
    const labels = json(`messages/${locale}/search.json`).tastes as Record<Taste, string>;
    for (const taste of TASTES) {
      expect(search(labels[taste], locale).length, `${locale} "${labels[taste]}"`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("messages for every kind", () => {
  /* `search.kinds.<kind>` and `search.price.<kind>` are read with a template
     key, so a kind added to `SEARCH_KINDS` without its two messages would
     only fail at runtime. The en/kn parity test covers Kannada from here. */
  const en = json("messages/en/search.json");

  it.each(SEARCH_KINDS)("has a label and a typed price for %s", (kind) => {
    expect(en.kinds[kind]).toBeTruthy();
    expect(en.price[kind]).toContain("{price, number}");
  });
});
