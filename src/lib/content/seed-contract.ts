import { checkContentFile, type ContentTemplate } from "./content-contract";

/**
 * The template every `content/seeds/<key>.json` file must follow — SPEC §22.4.
 *
 * Same idea as the variety template and the same engine, **different fields**,
 * and the differences are the interesting part. The owner's instruction was
 * *"each seed will have its own description like microgreens. We can reuse the
 * entire template of microgreen details page to show the seeds information"* —
 * so the *page* is reused, and the fields are the ones a seed actually has.
 *
 * | Variety | Seed | Why |
 * |---|---|---|
 * | `flavourNotes` | — | a seed is not tasted before it is sown |
 * | `growingTips` | `sowing` | for a seed this is the main event, not an aside — soak, sow rate, blackout, when to uncover |
 * | `nutrition` | `specs` | the same two-column table, holding what you are buying: germination, purity, sow rate, harvest window |
 * | `nutritionNote` | `specsNote` | the same honesty about how firm those figures are |
 * | `benefits` | `uses` | what the seed is *for* (microgreens, sprouts, wheatgrass), not what a nutrient does in the body |
 *
 * `uses` replacing `benefits` also drops a regulatory constraint rather than
 * inheriting it: nutrient-function claims are the FSSAI-sensitive text
 * (`VarietyText.benefits`), and a seed sold for sowing makes none.
 *
 * Two structural differences from the variety template:
 *
 * 1. **`images` is optional.** The packet photography does not exist yet, and
 *    the detail page already falls back to the Sprout mark. A contract that
 *    failed on it would block the copy being written at all, which is the
 *    wrong order of work — copy first, photographs when they are shot.
 * 2. **No day-count ban.** It exists for varieties because `growDays` is in
 *    DynamoDB and the copy would contradict it. A seed has no such field, and
 *    "soak six to eight hours, uncover on day three" is exactly the advice a
 *    buyer needs.
 */

/** Every field an `en` block must carry. Order is the order they are written. */
export const SEED_EN_REQUIRED = [
  "name",
  "shortDescription",
  "description",
  "sowing",
  "specs",
  "specsNote",
  "uses",
  "cautions",
  "faq",
  "imageAlt",
] as const;

/** Kannada must translate everything English has — derived, never restated. */
export const SEED_KN_REQUIRED = SEED_EN_REQUIRED;

/** Minimums, so "present but empty" does not pass as done. */
export const MIN_SPEC_ROWS = 4;
export const MIN_USES = 2;
export const MIN_SEED_CAUTIONS = 1;
/** Exactly five, so every seed page has the same weight of FAQ — the same
 *  figure as a variety, because it is the same page. */
export const SEED_FAQ_COUNT = 5;

export const SEED_TEMPLATE: ContentTemplate = {
  fields: SEED_EN_REQUIRED,
  images: "optional",
  rules: {
    specs: { kind: "rows", min: MIN_SPEC_ROWS },
    uses: { kind: "list", min: MIN_USES },
    cautions: { kind: "list", min: MIN_SEED_CAUTIONS },
    faq: { kind: "faq", count: SEED_FAQ_COUNT },
  },
};

/** Returns a list of problems, empty when the file conforms. */
export function checkSeedFile(key: string, raw: unknown): string[] {
  return checkContentFile(SEED_TEMPLATE, key, raw);
}
