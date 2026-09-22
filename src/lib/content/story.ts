import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";

/**
 * The "How we grow" storybook — SPEC §4.3 and §18.5.
 *
 * ## Why this is one file and not one file per page
 *
 * Every other catalogue here is `content/<type>/<key>.json`, one file per
 * item, because the items are a **set**: varieties are added and retired
 * independently, and nothing about radish implies anything about sunflower.
 *
 * A book is not a set, it is a **sequence**. Page four only makes sense after
 * page three, and the single most likely edit is reordering or inserting a
 * page rather than adding an unrelated one. Split across thirteen files that
 * order has to be re-stated as a `sortOrder` field in each of them, which is
 * the classic way to end up with two pages numbered 7 and nobody noticing. So
 * the order lives where it is obvious and can only be written once: the
 * `pages` array at the top of `book.json`.
 *
 * Everything else follows the house rules exactly — the language-independent
 * facts at the top level, every readable word under `en` / `kn`,
 * field-by-field English fallback (SPEC §4.4), and a contract test
 * (`story-contract.test.ts`) that fails on a gap rather than letting the
 * fallback hide it.
 *
 * ## What is deliberately not here
 *
 * No DynamoDB, and no admin screen. There is no number on this page that the
 * business tunes — no price, no lead time, no count — so there is nothing for
 * a database row to hold. The book is edited in git, reviewed in a diff, and
 * that is the whole of it.
 */

/**
 * One page's language-independent facts, in reading order.
 *
 * **No paper colour.** There used to be a `ground` of `light | dark`, set to
 * `dark` on the two pages where the story drops its voice. The book settled
 * on one paper (22 Sep 2026), so the field had exactly one reachable value —
 * which is worse than no field at all, because a schema that offers a choice
 * nobody can make invites the next person to set it and wonder why nothing
 * happened. `story-contract.ts` therefore *rejects* a page still carrying it,
 * rather than ignoring it. Two papers again means putting the field, its
 * check and its branch back together.
 */
export type StoryPageMeta = {
  /** Kebab-case, and also the anchor id for the mobile stack. */
  key: string;
  /** Filename inside `public/story/`. */
  image: string;
};

/** One page's words, in one language. */
export type StoryPageText = {
  /** "The turning point". The small line above the heading. */
  eyebrow: string;
  heading: string;
  /** One entry per paragraph. A book page is two to four short ones. */
  body: string[];
  /**
   * The line under the illustration on the left leaf — the page's sentiment
   * in half a dozen words.
   *
   * Not decoration, and not a summary of the body. The illustration is a 3:2
   * landscape sitting on a leaf that is taller than it is wide, so there is
   * paper left over under every picture; this is what goes there instead of
   * a gap. Distil the page rather than restate it — the right leaf already
   * says the thing at length, and reading the same sentence twice across one
   * spread makes the book feel padded.
   */
  caption: string;
  /** Required on every page — the illustration carries half the story, so a
   *  screen reader that skips it reads half a book. */
  imageAlt: string;
};

/** `content/story/book.json` as written on disk. */
export type StoryBookFile = {
  pages: StoryPageMeta[];
  en: Record<string, StoryPageText>;
  kn?: Record<string, Partial<StoryPageText>>;
};

/** A page resolved for one locale, ready to render. */
export type StoryPage = StoryPageMeta & {
  src: string;
  text: StoryPageText;
  /** The illustration's real pixel size — see `readImageSize`. */
  width: number;
  height: number;
};

const BOOK_PATH = path.join(process.cwd(), "content", "story", "book.json");

function asLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/**
 * Where a story illustration lives.
 *
 * Flat rather than `story/<key>/<file>` like a variety, because a page has
 * exactly one picture and a folder per page would be thirteen folders holding
 * one file each. Still routed through `NEXT_PUBLIC_IMAGE_BASE_URL` so the move
 * to CloudFront stays one change (SPEC §2).
 *
 * ## `?v=` is not decoration, it is the only thing that makes a swap visible
 *
 * The artwork is replaced in place — a new `doubt.webp` over the old one,
 * same name — because the name is the page key and renaming it would mean
 * editing `book.json` for something that is not a content change. But an
 * unchanged URL means an unchanged cache key, and `next/image` answers the
 * browser's revalidation of `/_next/image?url=/story/doubt.webp` with a `304`
 * built from an ETag that does **not** track the source file. So the browser
 * keeps serving the previous picture, indefinitely, and only a hard reload
 * clears it. That cost two rounds of "I still see the old image" on 22 Sep
 * 2026 before the cause was found, with the correct bytes on disk the whole
 * time.
 *
 * The version is the file's modification time, so replacing a file is all it
 * takes — there is no number for anyone to remember to bump. It is *not* a
 * content hash: that would mean reading every illustration in full on every
 * request to save a cache miss on the handful of deploys where a picture
 * actually changed.
 */
export function storyImageUrl(filename: string, version?: number): string {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "";
  const url = `${base}/story/${filename}`;
  return version ? `${url}?v=${version}` : url;
}

/**
 * The illustration's real pixel size and its version, from the file itself.
 *
 * Both come from the same read, because both answer the same question — what
 * is actually on disk right now — and neither can be trusted to a field
 * somebody has to remember to update. The version is `mtimeMs`; see
 * `storyImageUrl` for why the URL needs one at all.
 *
 * ## Why the size is measured rather than declared
 *
 * The page needs the true aspect of each picture, because the plate is
 * rendered at its natural size rather than stretched into a box. Inside one
 * fixed `aspect-[3/2]` frame the wide masters letterboxed and the tall ones
 * left cream bars down both sides, and the caption below ended up a
 * different distance from the picture on every page.
 *
 * It could have been two more fields in `book.json`. It is not, because a
 * declared dimension is a number that can disagree with the file — swap an
 * illustration for a differently shaped one and the copy says 1200×800 while
 * the pixels say 1200×400, and nothing fails. Read from the header there is
 * nothing to keep in sync.
 *
 * The thirteen masters really do vary, which is what makes this worth doing:
 * they run from 1.34 (`cover`) to 3.0 (`closing`).
 *
 * Only the header is parsed — the first thirty bytes — so this is cheap even
 * before `cache()` collapses it to one read per file per request. All three
 * WebP flavours are handled because `cwebp` picks between them per image
 * depending on whether the master carried an alpha channel.
 */
const readImageMeta = cache(
  async (
    filename: string,
  ): Promise<{ width: number; height: number; version: number }> => {
    /* No version on the fallback: a file we could not read has no modification
       time, and inventing one would put a `?v=0` on a URL that is already
       going to render broken. */
    const fallback = { width: 1200, height: 800, version: 0 };
    const file = path.join(process.cwd(), "public", "story", filename);
    try {
      const [b, info] = await Promise.all([readFile(file), stat(file)]);
      const version = Math.round(info.mtimeMs);
      const sized = (width: number, height: number) => ({ width, height, version });
      if (b.subarray(0, 4).toString() !== "RIFF") return { ...fallback, version };

      const chunk = b.subarray(12, 16).toString();
      if (chunk === "VP8X") {
        return sized(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
      }
      if (chunk === "VP8 ") {
        /* 14-bit dimensions live after the 3-byte start code in the key-frame
           header; the top two bits of each are the scale, not the size. */
        return sized(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      }
      if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return sized((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
      return { ...fallback, version };
    } catch {
      /* A missing or unreadable file is already a real state here — the page
         renders `next/image`'s broken state rather than throwing, and
         `story-contract.test.ts` is what makes it loud in CI. */
      return fallback;
    }
  },
);

const readBook = cache(async (): Promise<StoryBookFile | null> => {
  try {
    const parsed = JSON.parse(await readFile(BOOK_PATH, "utf8")) as StoryBookFile;
    return Array.isArray(parsed?.pages) ? parsed : null;
  } catch {
    // No book yet is a legitimate state — the page renders nothing rather
    // than throwing, and the contract test is what makes it loud in CI.
    return null;
  }
});

/**
 * SPEC §4.4's resolution rule, per field.
 *
 * Field by field rather than whole-page, so a page with the heading
 * translated but not the body renders the Kannada heading and the English
 * paragraphs. An empty string or an empty array counts as absent — a blank
 * translation must never beat real English.
 */
function resolveText(
  en: StoryPageText,
  kn: Partial<StoryPageText> | undefined,
  locale: Locale,
): StoryPageText {
  if (locale === routing.defaultLocale || !kn) return en;

  const merged: StoryPageText = { ...en };
  for (const [field, value] of Object.entries(kn)) {
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (!empty) Object.assign(merged, { [field]: value });
  }
  return merged;
}

/**
 * The whole book in reading order, resolved for one locale.
 *
 * A page listed in `pages` with no `en` block is **skipped** rather than
 * rendered blank — the same call every catalogue here makes for an item whose
 * content file is missing. It is a real state while a page is being written,
 * and `story-contract.test.ts` stops it becoming a permanent one.
 */
export async function getStoryBook(locale: string): Promise<StoryPage[]> {
  const file = await readBook();
  if (!file) return [];
  const resolved = asLocale(locale);

  const pages = await Promise.all(
    file.pages.map(async (page) => {
      const en = file.en?.[page.key];
      if (!en?.heading) return null;
      const { version, ...size } = await readImageMeta(page.image);
      return {
        ...page,
        src: storyImageUrl(page.image, version),
        text: resolveText(en, file.kn?.[page.key], resolved),
        ...size,
      };
    }),
  );
  return pages.filter((page): page is StoryPage => page !== null);
}
