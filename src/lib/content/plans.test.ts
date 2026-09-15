import { describe, expect, it } from "vitest";
import {
  getPlanContent,
  listPlanKeys,
  resolvePlanText,
  type PlanContentFile,
} from "./plans";

/**
 * The plan content loader — SPEC §4.3 / §4.4.
 *
 * `resolvePlanText` is pure, so most of this needs no filesystem. What it
 * guards is the resolution rule: a Kannada page must never show an empty
 * string or a raw key, and a partially translated file must render the parts
 * that *are* translated rather than falling back wholesale.
 */
const file: PlanContentFile = {
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

describe("resolvePlanText", () => {
  it("returns English as written for the default locale", () => {
    expect(resolvePlanText(file, "en")).toEqual(file.en);
  });

  it("returns Kannada when it is there", () => {
    expect(resolvePlanText(file, "kn").name).toBe("ಅಗತ್ಯ");
    expect(resolvePlanText(file, "kn").highlights[0]).toBe("ಆರ್ಡರ್ ನಂತರ ಬಿತ್ತನೆ");
  });

  /* Field by field, not whole-file: the point of progressive translation. */
  it("falls back per field, so a half-translated file renders both", () => {
    const text = resolvePlanText({ en: file.en, kn: { name: "ಅಗತ್ಯ" } }, "kn");
    expect(text.name).toBe("ಅಗತ್ಯ");
    expect(text.tagline).toBe("The everyday greens.");
    expect(text.highlights).toEqual(file.en.highlights);
  });

  /* An empty string and an empty array are gaps, not translations. Left as-is
     they would render as blank space on the card, which is worse than English
     because nothing on screen says anything is missing. */
  it("treats blank and empty values as missing", () => {
    const text = resolvePlanText(
      { en: file.en, kn: { name: "   ", tagline: "", highlights: [] } },
      "kn",
    );
    expect(text.name).toBe("Essential");
    expect(text.tagline).toBe("The everyday greens.");
    expect(text.highlights).toEqual(file.en.highlights);
  });

  it("falls back to English for a file with no kn block at all", () => {
    expect(resolvePlanText({ en: file.en }, "kn")).toEqual(file.en);
  });
});

describe("getPlanContent", () => {
  /* Asserts the *shape* of a real file, never its wording. An earlier version
     expected `name` to be "Essential" and broke the day the plan was renamed
     to "Everyday Essentials" — which is a copy edit in a content file, i.e.
     exactly the thing this design is meant to make free. A test that fails on
     an editorial change is a test that discourages editing. */
  it("reads a real file from content/plans", async () => {
    const content = await getPlanContent("essential", "en");
    expect(content?.key).toBe("essential");
    expect(content?.text.name.trim().length).toBeGreaterThan(0);
    expect(content?.text.tagline.trim().length).toBeGreaterThan(0);
    expect(content?.text.highlights.length).toBeGreaterThanOrEqual(3);
  });

  it("resolves that same file in Kannada", async () => {
    const content = await getPlanContent("essential", "kn");
    expect(content?.text.name).toMatch(/[ಀ-೿]/);
  });

  /* A missing file is null rather than a throw: the home page skips the plan
     and the admin row flags it. A malformed key is null too — the same
     validation that keeps a key out of a path traversal. */
  it("returns null for an unknown key and refuses a malformed one", async () => {
    expect(await getPlanContent("no-such-plan", "en")).toBeNull();
    expect(await getPlanContent("../varieties/broccoli", "en")).toBeNull();
  });

  it("degrades an unknown locale to English rather than throwing", async () => {
    const [fr, en] = await Promise.all([
      getPlanContent("essential", "fr"),
      getPlanContent("essential", "en"),
    ]);
    // Compared against the English file rather than a hardcoded name, for the
    // same reason as above.
    expect(fr?.text).toEqual(en?.text);
  });
});

describe("listPlanKeys", () => {
  it("lists the real folder and hides the template", async () => {
    const keys = await listPlanKeys();
    expect(keys).toContain("essential");
    expect(keys).not.toContain("_template");
  });
});
