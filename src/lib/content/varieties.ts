import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { isValidContentKey } from "./content-key";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Variety content — SPEC §4.3.
 *
 * DECISION (15 Sep 2026): **no variety text is entered in the admin UI.** The
 * admin owns only what is operational and changes with the business — price,
 * yield, grow days, seed rate, active. Every word a visitor reads about
 * a variety lives in one file per variety under `content/varieties/`.
 *
 * Why the split falls here:
 *
 * - Copy wants git history, review and a diff. A price does not.
 * - Copy is long and multilingual; typing a nutrition table into a web form
 *   twice is worse than editing a file once.
 * - The two change on completely different schedules. Yield gets tuned after
 *   every sow; a description is written once.
 *
 * ## Three identifiers, deliberately separate
 *
 * | | Changes? | Where |
 * |---|---|---|
 * | `id` | never | DynamoDB primary key, a UUID |
 * | `contentKey` | almost never | names the file, and is the URL segment |
 * | display name | whenever you like | inside the file only |
 *
 * That separation is the whole point. Renaming "Red Amaranth" to "Ruby
 * Amaranth" is an edit to one string in one file: the filename, the URL, the
 * DynamoDB id and every historical order line are untouched. A `name` column
 * in DynamoDB could not give you that, and a UUID-named file would make the
 * URL unreadable to buy it.
 *
 * Keys are plain kebab-case — `radish`, `red-amaranth`, `green-amaranth`. A
 * family of similar varieties is exactly the case where a descriptive key
 * beats a generated one: `red-amaranth` cannot be confused with anything,
 * where `amaranth-2` or `amaranth_8f3a2c91` can.
 */

export { isValidContentKey, sanitiseKey } from "./content-key";

const CONTENT_DIR = path.join(process.cwd(), "content", "varieties");

/** Nutrition is a table, so it is rows rather than prose. */
export type NutritionRow = { label: string; value: string };

/** One question and its answer, for the variety page's FAQ block. */
export type FaqEntry = { question: string; answer: string };

/** The editorial text for one variety in one language. */
export type VarietyText = {
  /** Short form — used in lists, the cart, sow plans and order snapshots, so
   *  it doubles as the page title. There is deliberately no separate `title`
   *  field: two names for one thing drift apart. */
  name: string;
  shortDescription?: string;
  description?: string;
  flavourNotes?: string;
  growingTips?: string;
  nutrition?: NutritionRow[];
  /** Why the nutrition rows are qualitative. Rendered with the table, because
   *  a reader is entitled to know how firm the numbers are. */
  nutritionNote?: string;
  /**
   * **Nutrient-function claims only — never disease claims.**
   *
   * India's Food Safety and Standards (Advertising and Claims) Regulations
   * 2018 prohibit stating or implying that a food prevents, treats or cures
   * any disease. "Vitamin C contributes to normal immune function" is a
   * permitted nutrient-function claim; "cures colds" is not, and on a
   * commercial site it is a regulatory problem as well as a false one.
   *
   * Keep every entry to what a nutrient *does* in the body.
   */
  benefits?: string[];
  /** Allergens, medication interactions and who should be careful. Honest
   *  disclosure, and cheaper to write now than after a complaint. */
  cautions?: string[];
  faq?: FaqEntry[];
  /** Falls back to the name, because an empty `alt` on a product photo is an
   *  accessibility failure, not a neutral default. */
  imageAlt?: string;
};

/** Filenames only — never image data. See `varietyImageUrl`. */
export type VarietyImages = { hero?: string; gallery?: string[] };

/**
 * One `content/varieties/<key>.json` file, as written on disk.
 *
 * Language-independent facts (images, recipe links) sit at the top level;
 * anything a human reads is nested under its locale. `en` is required because
 * SPEC §4.4 makes English the fallback for everything.
 */
export type VarietyContentFile = {
  images?: VarietyImages;
  recipeSlugs?: string[];
  en: VarietyText;
  kn?: Partial<VarietyText>;
};

/** A file resolved for one locale, with English already merged underneath. */
export type VarietyContent = {
  key: string;
  text: VarietyText;
  images: VarietyImages;
  recipeSlugs: string[];
};

/**
 * Every variety with a content file, sorted.
 *
 * This is the **list of varieties that could exist**; DynamoDB says which are
 * actually sold and at what price. Files starting with `_` are ignored, so a
 * template or a note can live in the folder without becoming a variety.
 */
export const listVarietyKeys = cache(async (): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(CONTENT_DIR);
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

const readVarietyFile = cache(
  async (key: string): Promise<VarietyContentFile | null> => {
    if (!isValidContentKey(key)) return null;
    try {
      const raw = await readFile(path.join(CONTENT_DIR, `${key}.json`), "utf8");
      const parsed = JSON.parse(raw) as VarietyContentFile;
      // A file with no English name cannot render a card or a title, so it is
      // treated as absent rather than as a variety with a blank name.
      return parsed?.en?.name ? parsed : null;
    } catch {
      return null;
    }
  },
);

/**
 * SPEC §4.4's resolution rule, per field: fall back to English on any missing
 * `kn` value, and never render an empty string.
 *
 * Applied field by field rather than whole-file, so a Kannada file that has
 * translated the name but not the growing tips renders the Kannada name and
 * the English tips — which is the point of progressive translation.
 */
/**
 * Page params arrive as `string`, so every public entry point takes a string
 * and narrows here. One place to do it beats a cast at each call site, and an
 * unknown locale degrades to English rather than throwing.
 */
function asLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export function resolveVarietyText(
  file: VarietyContentFile,
  locale: Locale,
): VarietyText {
  if (locale === routing.defaultLocale) return file.en;

  const override = file.kn ?? {};
  const merged: VarietyText = { ...file.en };
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

export async function getVarietyContent(
  key: string,
  locale: string,
): Promise<VarietyContent | null> {
  const file = await readVarietyFile(key);
  if (!file) return null;
  return {
    key,
    text: resolveVarietyText(file, asLocale(locale)),
    images: file.images ?? {},
    recipeSlugs: file.recipeSlugs ?? [],
  };
}

/** Every content file, resolved. Used by the admin picker. */
export async function listVarietyContent(locale: string): Promise<VarietyContent[]> {
  const keys = await listVarietyKeys();
  const all = await Promise.all(keys.map((key) => getVarietyContent(key, locale)));
  return all.filter((c): c is VarietyContent => c !== null);
}

/**
 * Joins DynamoDB rows to their content files.
 *
 * Takes the rows as an argument rather than fetching them, so this module
 * never imports the repository and the dependency runs one way: pages read
 * both, content knows nothing about the database.
 *
 * `content` is null when the file is missing. That is surfaced rather than
 * filtered here, because the two callers want opposite things: a public page
 * must skip a variety it cannot name, and the admin must show it loudly so
 * somebody fixes it.
 */
export async function attachContent<T extends { contentKey: string }>(
  rows: T[],
  locale: string,
): Promise<Array<T & { content: VarietyContent | null }>> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      content: await getVarietyContent(row.contentKey, locale),
    })),
  );
}

/**
 * Where a variety photo lives — SPEC §2.
 *
 * **Images are never stored in DynamoDB.** An item caps at 400 KB, which one
 * decent photograph exceeds; you would pay read capacity on every page view
 * for bytes a CDN serves for nothing; and base64 both inflates the payload by
 * about a third and defeats `next/image` resizing entirely.
 *
 * So the content file names the file and this resolves it. Today that is
 * `public/varieties/<key>/<filename>`, served by Next itself. At launch
 * `NEXT_PUBLIC_IMAGE_BASE_URL` points at CloudFront and nothing else changes —
 * which is why every caller goes through this function rather than building
 * the path inline.
 */
export function varietyImageUrl(key: string, filename: string): string {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "";
  return `${base}/varieties/${key}/${filename}`;
}

/** The hero photo, or null when the photography has not been shot yet — the
 *  grid falls back to the Sprout placeholder rather than a broken image. */
export function varietyHero(content: VarietyContent): { src: string; alt: string } | null {
  if (!content.images.hero) return null;
  return {
    src: varietyImageUrl(content.key, content.images.hero),
    alt: content.text.imageAlt ?? content.text.name,
  };
}

/**
 * `contentKey` → display name for every content file, in one locale.
 *
 * Exists because plan rotation weeks and sow plans reference varieties by key
 * and need to print a label, but have no business loading whole content files
 * to do it. Built from the files rather than from DynamoDB, which no longer
 * holds a name at all.
 */
export async function varietyNameMap(locale: string): Promise<Record<string, string>> {
  const all = await listVarietyContent(locale);
  return Object.fromEntries(all.map((c) => [c.key, c.text.name]));
}
