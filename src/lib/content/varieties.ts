import { createContentSource, type ContentFile, type ContentImages, type ContentRow, type ResolvedContent } from "./source";
import type { Locale } from "@/i18n/routing";

/**
 * Variety content — SPEC §4.3.
 *
 * DECISION (15 Sep 2026): **no variety text is entered in the admin UI.** The
 * admin owns only what is operational and changes with the business — price,
 * yield, grow days, seed rate, active. Every word a visitor reads about a
 * variety lives in one file per variety under `content/varieties/`.
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
 *
 * ## The mechanics live in ./source.ts
 *
 * Reading the folder, the field-by-field English fallback, the per-request
 * cache and the image URLs moved there on 17 Sep 2026 when seeds arrived and
 * wanted all of it (SPEC §22). What stays here is what is specific to a
 * variety: the **shape of its text**, and the names the rest of the app
 * already imports.
 */

export { isValidContentKey, sanitiseKey } from "./content-key";
export type { FaqEntry } from "./source";

/** Nutrition is a table, so it is rows rather than prose. */
export type NutritionRow = ContentRow;

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
  faq?: import("./source").FaqEntry[];
  /** Falls back to the name, because an empty `alt` on a product photo is an
   *  accessibility failure, not a neutral default. */
  imageAlt?: string;
};

/** Filenames only — never image data. See `varietyImageUrl`. */
export type VarietyImages = ContentImages;

/** One `content/varieties/<key>.json` file, as written on disk. */
export type VarietyContentFile = ContentFile<VarietyText>;

/** A file resolved for one locale, with English already merged underneath. */
export type VarietyContent = ResolvedContent<VarietyText>;

const source = createContentSource<VarietyText>({ folder: "varieties" });

/**
 * Every variety with a content file, sorted.
 *
 * This is the **list of varieties that could exist**; DynamoDB says which are
 * actually sold and at what price.
 */
export const listVarietyKeys = source.listKeys;

export function resolveVarietyText(file: VarietyContentFile, locale: Locale): VarietyText {
  return source.resolveText(file, locale);
}

export const getVarietyContent = source.get;
export const listVarietyContent = source.list;

/** Joins DynamoDB rows to their content files. `content` is null when the
 *  file is missing — surfaced rather than filtered, because the admin must
 *  show it loudly while a public page must skip it. */
export const attachContent = source.attach;
export const varietyNameMap = source.nameMap;
export const varietyImageUrl = source.imageUrl;
export const varietyHero = source.hero;
export const varietyCutout = source.cutout;
