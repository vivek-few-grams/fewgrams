import {
  createContentSource,
  type ContentFile,
  type ContentImages,
  type ContentRow,
  type FaqEntry,
  type ResolvedContent,
} from "./source";
import type { Locale } from "@/i18n/routing";

/**
 * Seed content — SPEC §22.4.
 *
 * Same rule as varieties, for the same reasons (SPEC §4.3): **no seed text is
 * entered in the admin UI.** `/admin/seeds` owns two numbers — what 100 g
 * costs and how many grams are on the shelf — and every word a buyer reads
 * lives in `content/seeds/<key>.json`.
 *
 * ## Seed keys and variety keys are separate namespaces, on purpose
 *
 * `content/varieties/radish.json` and `content/seeds/radish.json` are two
 * different files describing two different things to buy: a punnet of cut
 * radish microgreens, and a bag of radish seed to sow yourself. They get two
 * pages (`/microgreens/radish` and `/seeds/radish`), two prices and two
 * records.
 *
 * The one place that has to know they can collide is the cart, which
 * therefore keys a line on **kind plus content key** rather than the key alone
 * — see `src/lib/cart/cart.ts`. Everything else reads one catalogue at a time
 * and cannot confuse them.
 *
 * The loader itself is `./source.ts`; what is specific to a seed is the shape
 * of its text, below, and the contract in `./seed-contract.ts`.
 */

/** A row of the seed's spec table — germination, sow rate, harvest window. */
export type SeedSpecRow = ContentRow;

/** The editorial text for one seed in one language. */
export type SeedText = {
  /** Short form — used in lists, the cart and order snapshots, so it doubles
   *  as the page title. Say which seed it is, including the type where that
   *  matters to a grower: "Sunflower (black oil)". */
  name: string;
  shortDescription?: string;
  description?: string;
  /** How to sow it: soak time, sow density, blackout, when to uncover. For a
   *  seed this is the main event rather than an aside, which is why it is its
   *  own field and not the variety template's `growingTips`. */
  sowing?: string;
  /** What you are buying, as a table: germination, purity, sow rate per tray,
   *  harvest window. The same two-column shape as a variety's nutrition, and
   *  rendered by the same component. */
  specs?: SeedSpecRow[];
  /** How firm those figures are. A germination rate is a lot-by-lot fact, and
   *  a buyer is entitled to know that before they read the number. */
  specsNote?: string;
  /** What the seed is for — microgreens, sprouting, wheatgrass juice, sowing
   *  on to full size. Deliberately **not** nutrient claims: those belong to
   *  the green you eat (`VarietyText.benefits`), which carries the FSSAI
   *  constraint with it. */
  uses?: string[];
  /** Storage, allergens, and the honest warnings — seed sold for sowing is
   *  not treated as food, and that has to be said plainly. */
  cautions?: string[];
  faq?: FaqEntry[];
  /** Falls back to the name, because an empty `alt` on a product photo is an
   *  accessibility failure, not a neutral default. */
  imageAlt?: string;
};

/** Filenames only — never image data. See `seedImageUrl`. */
export type SeedImages = ContentImages;

/** One `content/seeds/<key>.json` file, as written on disk. */
export type SeedContentFile = ContentFile<SeedText>;

/** A file resolved for one locale, with English already merged underneath. */
export type SeedContent = ResolvedContent<SeedText>;

const source = createContentSource<SeedText>({ folder: "seeds" });

/** Every seed with a content file, sorted. The list of seeds that *could*
 *  exist; DynamoDB says which are priced and in stock. */
export const listSeedKeys = source.listKeys;

export function resolveSeedText(file: SeedContentFile, locale: Locale): SeedText {
  return source.resolveText(file, locale);
}

export const getSeedContent = source.get;
export const listSeedContent = source.list;

/** Joins DynamoDB rows to their content files. `content` is null when the
 *  file is missing — the admin flags it, the public pages skip it. */
export const attachSeedContent = source.attach;
export const seedNameMap = source.nameMap;
export const seedImageUrl = source.imageUrl;
export const seedHero = source.hero;
export const seedCutout = source.cutout;
