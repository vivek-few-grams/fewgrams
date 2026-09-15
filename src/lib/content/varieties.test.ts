import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getVarietyContent,
  isValidContentKey,
  listVarietyKeys,
  resolveVarietyText,
  varietyHero,
  varietyImageUrl,
  type VarietyContentFile,
} from "./varieties";

const file: VarietyContentFile = {
  images: { hero: "hero.jpg" },
  en: {
    name: "Radish",
    shortDescription: "Peppery and fast.",
    growingTips: "Soak 6 hours.",
    nutrition: [{ label: "Vitamin C", value: "High" }],
  },
  kn: { name: "ಮೂಲಂಗಿ" },
};

describe("content keys", () => {
  it("accepts plain kebab-case, which is what a family of varieties needs", () => {
    for (const key of ["radish", "red-amaranth", "green-amaranth", "pea-shoots"]) {
      expect(isValidContentKey(key)).toBe(true);
    }
  });

  /**
   * Digits are refused by decision, not by oversight. A numbered key is the
   * failure mode the whole content-file design exists to avoid: `amaranth-2`
   * says nothing about which amaranth, and once one exists the next person
   * adds `amaranth-3` rather than naming it.
   */
  it("refuses digits", () => {
    for (const key of ["amaranth-2", "radish2", "2-radish", "pea-shoots-2"]) {
      expect(isValidContentKey(key), key).toBe(false);
    }
  });

  /**
   * The key is both a filename and a URL segment, so anything that could
   * escape a path or change meaning after encoding is refused rather than
   * sanitised — silently rewriting a key would break the link between the
   * DynamoDB row and its file.
   */
  it("refuses anything that is not a safe filename or URL segment", () => {
    for (const key of [
      "Radish", // uppercase
      "red amaranth", // space
      "red_amaranth", // underscore
      "-radish",
      "radish-",
      "red--amaranth",
      "../secrets",
      "radish.json",
      "",
      "a".repeat(61),
    ]) {
      expect(isValidContentKey(key), key).toBe(false);
    }
  });
});

describe("English fallback — SPEC §4.4", () => {
  it("returns English untouched for the default locale", () => {
    expect(resolveVarietyText(file, "en")).toEqual(file.en);
  });

  /**
   * The point of merging field by field: a part-translated file should render
   * the Kannada name *and* the English growing tips, rather than forcing a
   * choice between an all-or-nothing translation and a half-empty page.
   */
  it("merges field by field, so a part-translated file is useful", () => {
    const kn = resolveVarietyText(file, "kn");
    expect(kn.name).toBe("ಮೂಲಂಗಿ");
    expect(kn.growingTips).toBe("Soak 6 hours.");
    expect(kn.nutrition).toEqual([{ label: "Vitamin C", value: "High" }]);
  });

  it("treats a blank or empty Kannada value as missing, not as an override", () => {
    const kn = resolveVarietyText(
      { ...file, kn: { name: "   ", shortDescription: "", nutrition: [] } },
      "kn",
    );
    // Never render an empty string or drop a table — SPEC §4.4.
    expect(kn.name).toBe("Radish");
    expect(kn.shortDescription).toBe("Peppery and fast.");
    expect(kn.nutrition).toEqual([{ label: "Vitamin C", value: "High" }]);
  });
});

describe("images", () => {
  it("builds a path under the variety's own folder", () => {
    expect(varietyImageUrl("red-amaranth", "hero.jpg")).toBe(
      "/varieties/red-amaranth/hero.jpg",
    );
  });

  it("falls back to the name for alt text rather than leaving it empty", () => {
    const hero = varietyHero({
      key: "radish",
      text: { name: "Radish" },
      images: { hero: "hero.jpg" },
      recipeSlugs: [],
    });
    expect(hero).toEqual({ src: "/varieties/radish/hero.jpg", alt: "Radish" });
  });

  it("returns null when the photography has not been shot", () => {
    expect(
      varietyHero({ key: "radish", text: { name: "Radish" }, images: {}, recipeSlugs: [] }),
    ).toBeNull();
  });
});

/**
 * Reads through the real filesystem, but against a fixture it writes itself.
 *
 * Deliberately NOT asserting on a real variety: the catalogue is the owner's
 * to rename, add to and delete from, and a test that knew `radish` existed
 * would fail the day they renamed it — a false alarm about their data, not
 * about this code.
 */
describe("reading the content directory", () => {
  const key = "zz-test-fixture";
  const dir = path.join(process.cwd(), "content", "varieties");
  const file = path.join(dir, `${key}.json`);

  beforeAll(async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(
      file,
      JSON.stringify({ en: { name: "Test Green" }, kn: { name: "ಪರೀಕ್ಷೆ" } }),
    );
  });
  afterAll(async () => {
    await rm(file, { force: true });
  });

  it("lists a key that has a file", async () => {
    expect(await listVarietyKeys()).toContain(key);
  });

  it("resolves it in both locales", async () => {
    expect((await getVarietyContent(key, "en"))?.text.name).toBe("Test Green");
    expect((await getVarietyContent(key, "kn"))?.text.name).toBe("ಪರೀಕ್ಷೆ");
  });

  /**
   * The null here is what the admin screen turns into a red "no copy yet"
   * flag, and what makes the public pages skip a variety rather than render a
   * nameless card.
   */
  it("returns null for a key with no file", async () => {
    expect(await getVarietyContent("no-such-variety", "en")).toBeNull();
  });

  it("refuses a traversal attempt before it reaches the filesystem", async () => {
    expect(await getVarietyContent("../../package", "en")).toBeNull();
  });
});
