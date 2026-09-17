import {
  createContentSource,
  type ContentFile,
  type ContentImages,
  type ContentRow,
  type ResolvedContent,
} from "./source";
import type { Locale } from "@/i18n/routing";

/**
 * Tray and drainage content — SPEC §23.2.
 *
 * Same rule as varieties and seeds (SPEC §4.3): **no tray text is entered in
 * the admin UI.** `/admin/trays` owns the price and the lead time, and every
 * word a buyer reads lives in `content/trays/<key>.json`.
 *
 * ## The thinnest template in the repo, and deliberately so
 *
 * A variety has flavour notes, a nutrition table and five FAQs because a
 * person decides what to eat by reading. A tray is decided by four facts —
 * what is in the pack, how big it is, how thick, what it is made of — and one
 * sentence of judgement about which of the two tray kits to buy.
 *
 * There is no `description`, no `faq` and no `sowing`, and the detail page
 * built on 17 Sep 2026 (SPEC §23.3) did **not** change that: it renders these
 * same four spec rows as its headline facts and nothing more, because "very
 * minimal" was the instruction and a sheet of moulded plastic has no fifth
 * thing to say. Adding the fields would be met with padding.
 *
 * Fields that would restate DynamoDB are banned by the same logic that keeps
 * `growDays` out of variety copy: **never write the price or the lead time
 * into a spec row.** Both are printed on the card from the record and both get
 * tuned, so copy that repeats them makes the card contradict itself.
 */

/** A row of the spec table — pack contents, size, thickness, material. */
export type TraySpecRow = ContentRow;

/** The editorial text for one tray or mat in one language. */
export type TrayText = {
  /** Short form — used on the card and, later, in the cart and order
   *  snapshots. Say which one it is: two tray kits differ only by their
   *  plastic, and "Micro green trays" would not tell them apart. */
  name: string;
  /** One line of judgement, not a restatement of the specs: who should buy
   *  this one rather than the other. The specs are directly below it. */
  shortDescription: string;
  /** What you are buying, as a table: pack contents, size, thickness,
   *  material. The same two-column shape as a seed's specs, and the figures
   *  are the supplier's own. */
  specs: TraySpecRow[];
  /** Falls back to the name, because an empty `alt` on a product photo is an
   *  accessibility failure, not a neutral default. */
  imageAlt?: string;
};

/** Filenames only — never image data. See `trayImageUrl`. */
export type TrayImages = ContentImages;

/** One `content/trays/<key>.json` file, as written on disk. */
export type TrayContentFile = ContentFile<TrayText>;

/** A file resolved for one locale, with English already merged underneath. */
export type TrayContent = ResolvedContent<TrayText>;

const source = createContentSource<TrayText>({ folder: "trays" });

/** Every tray with a content file, sorted. The list of items that *could*
 *  exist; DynamoDB says which are priced and on sale. */
export const listTrayKeys = source.listKeys;

export function resolveTrayText(file: TrayContentFile, locale: Locale): TrayText {
  return source.resolveText(file, locale);
}

export const getTrayContent = source.get;
export const listTrayContent = source.list;

/** Joins DynamoDB rows to their content files. `content` is null when the
 *  file is missing — the admin flags it, the public page skips it. */
export const attachTrayContent = source.attach;
export const trayNameMap = source.nameMap;
export const trayImageUrl = source.imageUrl;
export const trayHero = source.hero;
export const trayCutout = source.cutout;
