import {
  createContentSource,
  type ContentFile,
  type ContentImages,
  type ContentRow,
  type ResolvedContent,
} from "./source";
import type { Locale } from "@/i18n/routing";

/**
 * Grow media content — SPEC §24.2.
 *
 * Same rule as every other catalogue (SPEC §4.3): **no text is entered in the
 * admin UI.** `/admin/grow-media` owns the price, the lead time and the
 * packing; every word a buyer reads lives in `content/grow-media/<key>.json`.
 *
 * The figures in the copy are **the supplier's and do not change** — a 5 kg
 * block is 5 kg, and IFFCO's instruction of 4–5 litres of water per kilo is
 * theirs. What the copy must never carry is what the admin screen tunes: the
 * price and the lead time. The contract test scans for both.
 */

/** A row of the spec table — pack, form, material, grade. */
export type GrowMediumSpecRow = ContentRow;

/** The editorial text for one grow medium in one language. */
export type GrowMediumText = {
  /** Short form, used on the card, in the cart and in order snapshots. Two
   *  sizes of one block differ only by weight, so the name has to say it. */
  name: string;
  /** One line of judgement: who should buy this size rather than the other. */
  shortDescription: string;
  specs: GrowMediumSpecRow[];
  /** The preparation steps, in order. The supplier's method, restated. */
  howToUse: string[];
  /** The heading of the grade explainer — "Why low EC matters". */
  whyTitle: string;
  /** What the grade does for a plant and why it shows in a tray of
   *  microgreens. Paragraphs split on blank lines. Mechanism, not promise:
   *  no yield figure, no day count, nothing about the food. */
  why: string;
  /** Why we recommend it — how we use it ourselves, in the first person.
   *  Required: it is what the "Recommended by Fewgrams" badge stands on. */
  ourNote: string;
  /** Falls back to the name. */
  imageAlt?: string;
};

export type GrowMediumImages = ContentImages;
export type GrowMediumContentFile = ContentFile<GrowMediumText>;
export type GrowMediumContent = ResolvedContent<GrowMediumText>;

/** `content/grow-media/`, and so `/grow-media/<key>/…` for the photographs. */
const source = createContentSource<GrowMediumText>({ folder: "grow-media" });

export const listGrowMediumKeys = source.listKeys;

export function resolveGrowMediumText(
  file: GrowMediumContentFile,
  locale: Locale,
): GrowMediumText {
  return source.resolveText(file, locale);
}

export const getGrowMediumContent = source.get;
export const listGrowMediumContent = source.list;
export const attachGrowMediumContent = source.attach;
export const growMediumNameMap = source.nameMap;
export const growMediumImageUrl = source.imageUrl;
export const growMediumHero = source.hero;
export const growMediumCutout = source.cutout;
