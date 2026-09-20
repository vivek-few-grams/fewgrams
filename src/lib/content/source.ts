import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { isValidContentKey } from "./content-key";
import { routing, type Locale } from "@/i18n/routing";

/**
 * The content-file loader, shared by every catalogue that keeps its copy on
 * disk — SPEC §4.3.
 *
 * ## Why this is generic
 *
 * It was `varieties.ts` alone until seeds arrived (17 Sep 2026). A seed is the
 * same kind of record as a variety — numbers in DynamoDB, every word in one
 * file per item — so it wants the same loader: the same key rules, the same
 * field-by-field English fallback, the same "a missing file is a real state,
 * not an error", the same `cache()` so a page and its `generateMetadata` read
 * a file once.
 *
 * The alternative was a second copy of all of that, and the field-by-field
 * merge is exactly the kind of code that gets fixed in one copy. So the
 * mechanics live here and each catalogue declares only what differs: which
 * folder, and which URL its images resolve under.
 *
 * **What is deliberately NOT here:** the shape of the text. A variety has
 * flavour notes and a nutrition table; a seed has a germination spec and
 * sowing instructions. Those are different templates with different contracts
 * (`variety-contract.ts`, `seed-contract.ts`), and this module is parameterised
 * by the text type rather than pretending they are one thing.
 */

/** A two-column table row. Nutrition for a variety, the seed spec for a seed
 *  — same shape, rendered by the same component. */
export type ContentRow = { label: string; value: string };

/** One question and its answer, for a detail page's FAQ block. */
export type FaqEntry = { question: string; answer: string };

/**
 * Filenames only — never image data. See `imageUrl` below.
 *
 * `cutout` is a different kind of picture from `hero`, not a second one:
 * transparent background, product centred, no ground and no props, so a card
 * can scale and tilt it over a flat colour with a marquee running behind
 * (SPEC §17.4). A `hero` cropped square cannot do that job — it fills the
 * tile, so there is nothing for the type to show through. Optional, because
 * the grid falls back to `hero` until one is shot.
 */
export type ContentImages = { hero?: string; gallery?: string[]; cutout?: string };

/**
 * One content file as written on disk, for any text shape `T`.
 *
 * Language-independent facts (images, recipe links) sit at the top level;
 * anything a human reads is nested under its locale. `en` is required because
 * SPEC §4.4 makes English the fallback for everything.
 */
export type ContentFile<T> = {
  images?: ContentImages;
  recipeSlugs?: string[];
  en: T;
  kn?: Partial<T>;
};

/** A file resolved for one locale, with English already merged underneath. */
export type ResolvedContent<T> = {
  key: string;
  text: T;
  images: ContentImages;
  recipeSlugs: string[];
};

/** Everything a catalogue's text is read through. One instance per folder. */
export type ContentSource<T extends { name: string; imageAlt?: string }> = {
  listKeys: () => Promise<string[]>;
  resolveText: (file: ContentFile<T>, locale: Locale) => T;
  get: (key: string, locale: string) => Promise<ResolvedContent<T> | null>;
  list: (locale: string) => Promise<ResolvedContent<T>[]>;
  attach: <R extends { contentKey: string }>(
    rows: R[],
    locale: string,
  ) => Promise<Array<R & { content: ResolvedContent<T> | null }>>;
  nameMap: (locale: string) => Promise<Record<string, string>>;
  imageUrl: (key: string, filename: string) => string;
  hero: (content: ResolvedContent<T>) => { src: string; alt: string } | null;
  cutout: (content: ResolvedContent<T>) => { src: string; alt: string } | null;
};

/**
 * Page params arrive as `string`, so every public entry point takes a string
 * and narrows here. One place to do it beats a cast at each call site, and an
 * unknown locale degrades to English rather than throwing.
 */
function asLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export function createContentSource<T extends { name: string; imageAlt?: string }>({
  folder,
}: {
  /** Both the folder under `content/` and the folder under the image base, so
   *  `content/seeds/sunflower.json` pairs with `/seeds/sunflower/hero.jpg`.
   *  One name, so the two can never drift apart. */
  folder: string;
}): ContentSource<T> {
  const dir = path.join(process.cwd(), "content", folder);

  /**
   * Every key with a content file, sorted.
   *
   * This is the list of items that **could** exist; DynamoDB says which are
   * actually sold and at what price. Files starting with `_` are ignored, so a
   * template or a note can live in the folder without becoming an item.
   */
  const listKeys = cache(async (): Promise<string[]> => {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // No folder yet is a legitimate state on a fresh checkout, not an error.
      return [];
    }
    return entries
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -".json".length))
      .filter(isValidContentKey)
      .sort();
  });

  const readContentFile = cache(async (key: string): Promise<ContentFile<T> | null> => {
    if (!isValidContentKey(key)) return null;
    try {
      const raw = await readFile(path.join(dir, `${key}.json`), "utf8");
      const parsed = JSON.parse(raw) as ContentFile<T>;
      // A file with no English name cannot render a card or a title, so it is
      // treated as absent rather than as an item with a blank name.
      return parsed?.en?.name ? parsed : null;
    } catch {
      return null;
    }
  });

  /**
   * SPEC §4.4's resolution rule, per field: fall back to English on any
   * missing `kn` value, and never render an empty string.
   *
   * Applied field by field rather than whole-file, so a Kannada file that has
   * translated the name but not the growing tips renders the Kannada name and
   * the English tips — which is the point of progressive translation.
   */
  function resolveText(file: ContentFile<T>, locale: Locale): T {
    if (locale === routing.defaultLocale) return file.en;

    const override = file.kn ?? {};
    const merged: T = { ...file.en };
    for (const [field, value] of Object.entries(override)) {
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);
      if (!empty) Object.assign(merged, { [field]: value });
    }
    return merged;
  }

  async function get(key: string, locale: string): Promise<ResolvedContent<T> | null> {
    const file = await readContentFile(key);
    if (!file) return null;
    return {
      key,
      text: resolveText(file, asLocale(locale)),
      images: file.images ?? {},
      recipeSlugs: file.recipeSlugs ?? [],
    };
  }

  /** Every content file in the folder, resolved. Used by the admin picker. */
  async function list(locale: string): Promise<ResolvedContent<T>[]> {
    const keys = await listKeys();
    const all = await Promise.all(keys.map((key) => get(key, locale)));
    return all.filter((c): c is ResolvedContent<T> => c !== null);
  }

  /**
   * Joins DynamoDB rows to their content files.
   *
   * Takes the rows as an argument rather than fetching them, so this module
   * never imports a repository and the dependency runs one way: pages read
   * both, content knows nothing about the database.
   *
   * `content` is null when the file is missing. That is surfaced rather than
   * filtered here, because the two callers want opposite things: a public page
   * must skip an item it cannot name, and the admin must show it loudly so
   * somebody fixes it.
   */
  async function attach<R extends { contentKey: string }>(
    rows: R[],
    locale: string,
  ): Promise<Array<R & { content: ResolvedContent<T> | null }>> {
    return Promise.all(
      rows.map(async (row) => ({ ...row, content: await get(row.contentKey, locale) })),
    );
  }

  /**
   * `contentKey` → display name for every content file, in one locale.
   *
   * Exists because plan rotation weeks, sow plans and order lines reference
   * items by key and need to print a label, but have no business loading whole
   * content files to do it.
   */
  async function nameMap(locale: string): Promise<Record<string, string>> {
    const all = await list(locale);
    return Object.fromEntries(all.map((c) => [c.key, c.text.name]));
  }

  /**
   * Where a photo lives — SPEC §2.
   *
   * **Images are never stored in DynamoDB.** An item caps at 400 KB, which one
   * decent photograph exceeds; you would pay read capacity on every page view
   * for bytes a CDN serves for nothing; and base64 both inflates the payload
   * by about a third and defeats `next/image` resizing entirely.
   *
   * So the content file names the file and this resolves it. Today that is
   * `public/<folder>/<key>/<filename>`, served by Next itself. At launch
   * `NEXT_PUBLIC_IMAGE_BASE_URL` points at CloudFront and nothing else changes
   * — which is why every caller goes through this function rather than
   * building the path inline.
   */
  function imageUrl(key: string, filename: string): string {
    const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "";
    return `${base}/${folder}/${key}/${filename}`;
  }

  /** The hero photo, or null when the photography has not been shot yet — the
   *  grid falls back to the Sprout placeholder rather than a broken image. */
  function hero(content: ResolvedContent<T>) {
    if (!content.images.hero) return null;
    return {
      src: imageUrl(content.key, content.images.hero),
      alt: content.text.imageAlt ?? content.text.name,
    };
  }

  /**
   * The transparent cut-out for the card hover, or null when one has not been
   * made yet — the grid then renders the `hero` photo flat, without the tilt.
   *
   * Deliberately not falling back to `hero`: a photo with its own background
   * dropped into the media box would sit on the panel as a visible rectangle
   * and the tilt would read as a skewed picture rather than a tilted punnet.
   * Better to show the plain treatment than a broken version of the good one.
   */
  function cutout(content: ResolvedContent<T>) {
    if (!content.images.cutout) return null;
    return {
      src: imageUrl(content.key, content.images.cutout),
      alt: content.text.imageAlt ?? content.text.name,
    };
  }

  return { listKeys, resolveText, get, list, attach, nameMap, imageUrl, hero, cutout };
}
