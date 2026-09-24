import { checkContentFile, type ContentTemplate } from "./content-contract";

/**
 * The template every `content/grow-media/<key>.json` file must follow — SPEC
 * §24.2.
 *
 * The tray template (`tray-contract.ts`) plus **one field, `howToUse`**, and
 * the addition is the whole argument for this being a template of its own
 * rather than a borrowed one. A tray is ready the moment it is unpacked; a
 * compressed coir block is not usable until it has been soaked and broken up,
 * and a buyer who has never done it needs the steps before they buy — the
 * water it takes is how big a bucket they need.
 *
 * | Tray | Grow medium | Why |
 * |---|---|---|
 * | `specs` | `specs` | pack weight, form, what it is made of, the supplier's grade |
 * | — | `howToUse` | a block has to be prepared; a tray does not |
 *
 * **`ourNote` is required, and that is a business rule, not a copy rule**
 * (the owner, 24 Sep 2026): this category holds only what we grow our own
 * microgreens in, and every card carries a "Recommended by Fewgrams" badge
 * on that basis. A file without the note cannot pass, so an item cannot get
 * the badge without saying how we use it.
 *
 * Still no `description` and no `faq`. The supplier's own page carries a
 * paragraph of praise, and none of it is a fact a buyer can act on.
 */

/** Every field an `en` block must carry. Order is the order they are written. */
export const GROW_MEDIUM_EN_REQUIRED = [
  "name",
  "shortDescription",
  "specs",
  "howToUse",
  "whyTitle",
  "why",
  "ourNote",
  "imageAlt",
] as const;

/** Kannada must translate everything English has — derived, never restated. */
export const GROW_MEDIUM_KN_REQUIRED = GROW_MEDIUM_EN_REQUIRED;

/** What is in the pack, its form, what it is made of, and its grade — the four
 *  questions asked of every bag of substrate. */
export const MIN_GROW_MEDIUM_SPEC_ROWS = 4;

/** Soak, wait, break up, use. Fewer than three is not a method. */
export const MIN_GROW_MEDIUM_STEPS = 3;

export const GROW_MEDIUM_TEMPLATE: ContentTemplate = {
  fields: GROW_MEDIUM_EN_REQUIRED,
  images: "optional",
  rules: {
    specs: { kind: "rows", min: MIN_GROW_MEDIUM_SPEC_ROWS },
    howToUse: { kind: "list", min: MIN_GROW_MEDIUM_STEPS },
    /* What the grade does for a plant — for Horti-Coir, why low EC matters.
       A heading and prose, so a future medium explains its own grade. No day
       count: grow time is tuned in admin, never restated in copy. */
    why: { kind: "prose", noDayCount: true },
    /* Our own experience, never the maker's claims — no day count either. */
    ourNote: { kind: "prose", noDayCount: true },
  },
};

/** Returns a list of problems, empty when the file conforms. */
export function checkGrowMediumFile(key: string, raw: unknown): string[] {
  return checkContentFile(GROW_MEDIUM_TEMPLATE, key, raw);
}
