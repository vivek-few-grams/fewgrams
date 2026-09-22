import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_STORY_PARAGRAPHS,
  STORY_FIELDS,
  checkStoryBook,
} from "./story-contract";
import { getStoryBook } from "./story";

/**
 * The storybook guard — SPEC §18.5.
 *
 * Same job as the variety, seed and tray contract tests, with two extra
 * checks that only a book needs: that the running order is intact, and that
 * every page's illustration is actually on disk. A page whose image 404s is
 * invisible in a unit test and obvious to a visitor, which is exactly the
 * shape of bug worth spending a test on.
 */
const BOOK = path.join(process.cwd(), "content", "story", "book.json");
const IMAGES = path.join(process.cwd(), "public", "story");

const loadBook = async () =>
  JSON.parse(await readFile(BOOK, "utf8")) as Record<string, never>;

describe("story content template", () => {
  it("conforms, and reports every fault at once", async () => {
    const problems = checkStoryBook(await loadBook());
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("writes every page's English fields in the template's order", async () => {
    const raw = await loadBook();
    for (const [key, text] of Object.entries(raw.en as Record<string, object>)) {
      expect(Object.keys(text), key).toEqual([...STORY_FIELDS]);
    }
  });

  it("has the illustration every page names", async () => {
    const raw = await loadBook();
    const missing: string[] = [];
    for (const page of raw.pages as unknown as { key: string; image: string }[]) {
      await access(path.join(IMAGES, page.image)).catch(() =>
        missing.push(`${page.key} → public/story/${page.image}`),
      );
    }
    expect(missing, `\nmissing illustrations:\n  ${missing.join("\n  ")}\n`).toEqual([]);
  });

  /** Same reasoning as every other catalogue's version: a pasted English
   *  value satisfies a key-presence check while being no translation at all,
   *  and looks translated to everyone downstream. */
  it("writes every Kannada string in Kannada", async () => {
    const KANNADA = /[ಀ-೿]/;
    const raw = await loadBook();
    const offenders: string[] = [];

    const walk = (value: unknown, at: string) => {
      if (typeof value === "string") {
        const letters = value.replace(/[^\p{L}]/gu, "");
        if (letters.length > 0 && !KANNADA.test(value)) {
          offenders.push(`kn.${at} = ${JSON.stringify(value.slice(0, 50))}`);
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

    expect(offenders, `\nnot translated:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("copies no Kannada value verbatim from its English", async () => {
    const raw = await loadBook();
    const en = raw.en as Record<string, Record<string, unknown>>;
    const kn = raw.kn as Record<string, Record<string, unknown>>;
    const offenders: string[] = [];

    for (const [key, text] of Object.entries(en)) {
      for (const field of STORY_FIELDS) {
        if (JSON.stringify(text[field]) === JSON.stringify(kn[key]?.[field])) {
          offenders.push(`${key}.${field}`);
        }
      }
    }
    expect(offenders, `\nverbatim copies:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  /**
   * The same rule variety copy obeys, for the same reason: `growDays` is tuned
   * from the admin screen and printed on the variety page, so a grow duration
   * written into this book goes stale the first time the owner retunes it —
   * and this is the most-read prose on the site to be wrong in.
   *
   * Scoped to a **count** of days rather than the word, because "the same
   * day" and "every day" are claims about the operation, not about grow time,
   * and neither can drift. `\b` is ASCII-only even under `u`, so the Kannada
   * alternative is anchored on the numeral instead.
   */
  it("states no grow duration and no price", async () => {
    const DAYS =
      /\b(?:\d+|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)[\s-]*days?\b|(?:\d+|ಮೂರು|ನಾಲ್ಕು|ಐದು|ಆರು|ಏಳು|ಎಂಟು|ಒಂಬತ್ತು|ಹತ್ತು|ಹನ್ನೊಂದು|ಹನ್ನೆರಡು|ಹದಿನಾಲ್ಕು)\s*ದಿನ/iu;
    const MONEY = /₹\s*\d|\b(?:rs|inr)\b\s*\.?\s*\d/i;
    const raw = await loadBook();
    const offenders: string[] = [];

    const walk = (value: unknown, at: string) => {
      if (typeof value === "string") {
        if (DAYS.test(value)) offenders.push(`${at} states a day count`);
        if (MONEY.test(value)) offenders.push(`${at} states a price`);
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

    expect(offenders, `\n${offenders.join("\n")}\n`).toEqual([]);
  });
});

describe("getStoryBook", () => {
  it("returns the pages in the order the file lists them", async () => {
    const raw = await loadBook();
    const pages = await getStoryBook("en");
    expect(pages.map((p) => p.key)).toEqual(
      (raw.pages as unknown as { key: string }[]).map((p) => p.key),
    );
  });

  it("resolves every page's image through the image base", async () => {
    for (const page of await getStoryBook("en")) {
      expect(page.src).toMatch(
        new RegExp(`^/story/${page.image.replace(".", "\\.")}\\?v=\\d+$`),
      );
    }
  });

  /* The `?v=` is the whole reason a replaced illustration shows up at all —
     without it `next/image` answers the browser's revalidation with a 304 off
     an ETag that does not track the file, and the old picture stays on screen
     until someone hard-reloads. So it is asserted rather than tolerated, and
     it has to *change* when the file does. */
  it("versions every illustration by its own modification time", async () => {
    const pages = await getStoryBook("en");
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      const { mtimeMs } = await stat(
        path.join(process.cwd(), "public", "story", page.image),
      );
      expect(new URL(page.src, "https://x").searchParams.get("v"), page.key).toBe(
        String(Math.round(mtimeMs)),
      );
    }

    /* Two pages whose files were written at different moments must not share
       a version, or swapping one would quietly reuse the other's cache key. */
    const versions = pages.map((p) => p.src.split("?v=")[1]);
    expect(versions.every((v) => v && v !== "0")).toBe(true);
  });

  it("reads Kannada for a Kannada visitor", async () => {
    const [en, kn] = await Promise.all([getStoryBook("en"), getStoryBook("kn")]);
    expect(kn).toHaveLength(en.length);
    for (const [i, page] of kn.entries()) {
      expect(page.text.heading, page.key).not.toBe(en[i].text.heading);
      expect(page.text.body.length, page.key).toBeGreaterThanOrEqual(
        MIN_STORY_PARAGRAPHS,
      );
    }
  });

  /** An unknown locale is not an error state — it degrades to English rather
   *  than throwing, the same call `asLocale` makes everywhere else. */
  it("falls back to English for a locale it does not know", async () => {
    const [en, other] = await Promise.all([getStoryBook("en"), getStoryBook("fr")]);
    expect(other.map((p) => p.text.heading)).toEqual(en.map((p) => p.text.heading));
  });
});

describe("checkStoryBook", () => {
  const text = {
    eyebrow: "Step one",
    heading: "A heading.",
    body: ["First paragraph.", "Second paragraph."],
    caption: "Half a dozen words.",
    imageAlt: "alt",
  };
  const valid = {
    pages: [{ key: "one", image: "one.webp" }],
    en: { one: text },
    kn: { one: { ...text, heading: "ಒಂದು" } },
  };

  it("passes a conforming book", () => {
    expect(checkStoryBook(valid)).toEqual([]);
  });

  it("refuses a page key with a digit in it", () => {
    const book = { ...valid, pages: [{ ...valid.pages[0], key: "page-2" }] };
    expect(checkStoryBook(book).join()).toContain("kebab-case letters, no digits");
  });

  it("catches the same key used twice", () => {
    const book = {
      ...valid,
      pages: [valid.pages[0], { ...valid.pages[0] }],
    };
    expect(checkStoryBook(book).join()).toContain("is already used by an earlier page");
  });

  it("catches an image that skipped the webp pipeline", () => {
    const book = { ...valid, pages: [{ ...valid.pages[0], image: "one.png" }] };
    expect(checkStoryBook(book)).toContain("pages[0].image must be a .webp file");
  });

  /** The paper colour used to live here as `ground`. It is gone, so a file
   *  still carrying it is a stale edit rather than a harmless extra — and a
   *  value that silently does nothing is the thing the page-field check
   *  exists to catch. */
  it("refuses the retired ground field", () => {
    const book = { ...valid, pages: [{ ...valid.pages[0], ground: "dark" }] };
    expect(checkStoryBook(book)).toContain("pages[0].ground is not a page field");
  });

  it("catches a one-paragraph page", () => {
    const book = { ...valid, en: { one: { ...text, body: ["Only one."] } } };
    expect(checkStoryBook(book)).toContain(
      `en.one.body needs at least ${MIN_STORY_PARAGRAPHS} paragraphs`,
    );
  });

  it("catches words left behind for a page that was deleted", () => {
    const book = { ...valid, en: { ...valid.en, gone: text } };
    expect(checkStoryBook(book)).toContain('en.gone is not a page in "pages"');
  });

  it("requires Kannada to carry every page English carries", () => {
    expect(checkStoryBook({ ...valid, kn: {} })).toContain("kn.one is required");
    expect(checkStoryBook({ pages: valid.pages, en: valid.en })).toContain(
      'missing "kn" block',
    );
  });

  it("requires Kannada to carry every field English carries", () => {
    const book = { ...valid, kn: { one: { heading: "ಒಂದು" } } };
    const problems = checkStoryBook(book);
    expect(problems).toContain("kn.one.eyebrow must be a non-empty string");
    expect(problems).toContain("kn.one.caption must be a non-empty string");
    expect(problems).toContain(
      `kn.one.body needs at least ${MIN_STORY_PARAGRAPHS} paragraphs`,
    );
  });

  it("refuses a borrowed field from another template", () => {
    const book = { ...valid, en: { one: { ...text, tagline: "x" } } };
    expect(checkStoryBook(book)).toContain(
      "en.one.tagline is not a field in the template",
    );
  });
});
