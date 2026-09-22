/**
 * The storybook's shape checker — the same contract varieties, seeds, trays
 * and plans have, for `content/story/book.json`.
 *
 * It does **not** reuse `checkContentFile`. That engine is built for one file
 * per item: it validates a single `en` block against a field template. The
 * book is one file holding an ordered list of pages, so what has to be checked
 * is a level up — that the order is well formed, that every page named in it
 * has both languages, and that no page's words got left behind when the page
 * beside it was rewritten. Those are different rules, not a different template
 * for the same rules, which is why this is its own small checker rather than a
 * fourth `ContentTemplate`.
 *
 * Like the others it **returns** problems rather than throwing, so one test run
 * reports every fault in every page at once.
 */

/** Every field a page's `en` block must carry, in the order they are written. */
export const STORY_FIELDS = [
  "eyebrow",
  "heading",
  "body",
  "caption",
  "imageAlt",
] as const;

/** Two paragraphs is the floor. One is a caption, not a page of a book. */
export const MIN_STORY_PARAGRAPHS = 2;

const ALLOWED_TOP_LEVEL = new Set(["pages", "en", "kn"]);
const ALLOWED_PAGE_KEYS = new Set(["key", "image"]);

/** The same rule every content key obeys: kebab-case, no digits (CLAUDE.md). */
const KEY = /^[a-z]+(?:-[a-z]+)*$/;

const isFilledString = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

export function checkStoryBook(raw: unknown): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(msg);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["book.json must contain a JSON object"];
  }
  const file = raw as Record<string, unknown>;

  for (const field of Object.keys(file)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  if (!Array.isArray(file.pages) || file.pages.length === 0) {
    return [...problems, '"pages" must be a non-empty array'];
  }

  const keys = checkPageList(file.pages, at);
  checkTextBlock(keys, file.en, "en", at);
  /* Kannada carries the same full set, for the reason recorded in
     `content-contract.ts`: the field-by-field fallback means a gap renders
     English silently, so without this a Kannada reader turns a page and hits
     four paragraphs of English with nothing to tell them why. */
  if (file.kn === undefined) at('missing "kn" block');
  else checkTextBlock(keys, file.kn, "kn", at);

  return problems;
}

/** Validates the ordered list itself and returns the keys it names. */
function checkPageList(pages: unknown[], at: (msg: string) => void): string[] {
  const keys: string[] = [];

  pages.forEach((entry, i) => {
    const where = `pages[${i}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      at(`${where} must be an object`);
      return;
    }
    const page = entry as Record<string, unknown>;

    for (const field of Object.keys(page)) {
      if (!ALLOWED_PAGE_KEYS.has(field)) at(`${where}.${field} is not a page field`);
    }

    if (!isFilledString(page.key)) at(`${where}.key is required`);
    else if (!KEY.test(page.key as string)) {
      at(`${where}.key "${page.key}" must be kebab-case letters, no digits`);
    } else if (keys.includes(page.key as string)) {
      /* Two pages under one key would silently share one block of words —
         and the second would win, so a page would quietly render the wrong
         text rather than fail. */
      at(`${where}.key "${page.key}" is already used by an earlier page`);
    } else {
      keys.push(page.key as string);
    }

    if (!isFilledString(page.image)) at(`${where}.image is required`);
    else if (!/\.webp$/.test(page.image as string)) {
      /* Every other image in the repo goes through the webp pipeline; a `.png`
         here means somebody dropped a 2 MB export straight into `public/`. */
      at(`${where}.image must be a .webp file`);
    }
  });

  return keys;
}

function checkTextBlock(
  keys: string[],
  raw: unknown,
  locale: string,
  at: (msg: string) => void,
) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    at(`"${locale}" must be an object`);
    return;
  }
  const block = raw as Record<string, unknown>;

  /* A page of words with no page in the running order is dead weight: nothing
     renders it, so it is either a leftover from a deleted page or a typo in a
     key that is currently falling back to English. */
  for (const key of Object.keys(block)) {
    if (!keys.includes(key)) at(`${locale}.${key} is not a page in "pages"`);
  }

  for (const key of keys) {
    const page = block[key];
    if (typeof page !== "object" || page === null || Array.isArray(page)) {
      at(`${locale}.${key} is required`);
      continue;
    }
    const text = page as Record<string, unknown>;

    for (const field of Object.keys(text)) {
      if (!STORY_FIELDS.includes(field as (typeof STORY_FIELDS)[number])) {
        at(`${locale}.${key}.${field} is not a field in the template`);
      }
    }

    for (const field of STORY_FIELDS) {
      const value = text[field];
      if (field === "body") {
        if (!Array.isArray(value) || value.length < MIN_STORY_PARAGRAPHS) {
          at(`${locale}.${key}.body needs at least ${MIN_STORY_PARAGRAPHS} paragraphs`);
        } else if (!value.every(isFilledString)) {
          at(`${locale}.${key}.body paragraphs must be non-empty strings`);
        }
      } else if (!isFilledString(value)) {
        at(`${locale}.${key}.${field} must be a non-empty string`);
      }
    }
  }
}
