import { checkContentFile, type ContentTemplate } from "./content-contract";

/**
 * The template every `content/varieties/<key>.json` file must follow.
 *
 * DECISION (15 Sep 2026): variety content files share **one fixed shape**.
 * Without this, each file drifts into its own structure — one has
 * `flavourNotes`, the next calls it `taste`, a third omits cautions — and the
 * variety page has to defend against every variation. A template that is only
 * written down in a README is a suggestion; this makes it a test.
 *
 * `src/lib/content/variety-contract.test.ts` runs `checkVarietyFile` over
 * every file in the folder and fails on any deviation, so a new variety cannot
 * be added half-finished and a field cannot be quietly renamed.
 *
 * The **rules** live in `./content-contract.ts` and are shared with the seed
 * template (17 Sep 2026); this file is the declaration of what a variety is.
 *
 * ## The shape
 *
 * - Language-independent facts (`images`) at the top level, and a variety
 *   **must** have photography: the grid's card treatment is built on it.
 * - `en` carries the full set and is required, because SPEC §4.4 makes English
 *   the fallback for everything.
 * - `kn` carries the same full set — see `checkContentFile` for why parity
 *   rather than a high-intent subset.
 */

/** Every field an `en` block must carry. Order is the order they are written. */
export const EN_REQUIRED = [
  "name",
  "shortDescription",
  "description",
  "flavourNotes",
  "growingTips",
  "nutrition",
  "nutritionNote",
  "benefits",
  "cautions",
  "faq",
  "imageAlt",
] as const;

/**
 * Kannada must translate everything English has.
 *
 * Derived from EN_REQUIRED rather than restated, so adding a field to the
 * template cannot add it to English only — the parity is structural, not a
 * second list somebody has to remember to update.
 */
export const KN_REQUIRED = EN_REQUIRED;

/** Minimums, so "present but empty" does not pass as done. */
export const MIN_NUTRITION_ROWS = 5;
export const MIN_BENEFITS = 3;
export const MIN_CAUTIONS = 1;
/** Exactly five, so every variety page has the same weight of FAQ. */
export const FAQ_COUNT = 5;

export const VARIETY_TEMPLATE: ContentTemplate = {
  fields: EN_REQUIRED,
  images: "required",
  rules: {
    /* The three prose fields where a written day count would contradict
       `growDays` in DynamoDB. Not the FAQ, where "five to seven days"
       legitimately means fridge life — a deliberate gap in coverage. */
    shortDescription: { kind: "prose", noDayCount: true },
    description: { kind: "prose", noDayCount: true },
    growingTips: { kind: "prose", noDayCount: true },
    nutrition: { kind: "rows", min: MIN_NUTRITION_ROWS },
    benefits: { kind: "list", min: MIN_BENEFITS },
    cautions: { kind: "list", min: MIN_CAUTIONS },
    faq: { kind: "faq", count: FAQ_COUNT },
  },
};

/** Returns a list of problems, empty when the file conforms. */
export function checkVarietyFile(key: string, raw: unknown): string[] {
  return checkContentFile(VARIETY_TEMPLATE, key, raw);
}
