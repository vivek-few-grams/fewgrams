import { checkContentFile, type ContentTemplate } from "./content-contract";

/**
 * The template every `content/trays/<key>.json` file must follow — SPEC §23.2.
 *
 * Third template on the shared engine (`content-contract.ts`), and the
 * smallest. The reasoning for its size is on `TrayText`: a tray is bought on
 * four facts and one sentence, so a template borrowed from seeds would have
 * demanded a description, five FAQs and a sowing guide for a sheet of moulded
 * plastic — and the way that request gets met is with padding.
 *
 * | Seed | Tray | Why |
 * |---|---|---|
 * | `description` | — | the detail page is four facts and a buy box (SPEC §23.3) |
 * | `sowing` | — | you do not sow a tray |
 * | `specs`, `specsNote` | `specs` | the figures are the supplier's, not ours, so there is nothing to qualify |
 * | `uses`, `cautions`, `faq` | — | a card cannot carry them, and an unread field is worse than an absent one |
 *
 * **`specsNote` is the interesting omission.** A seed has one because
 * germination is a lot-by-lot fact and a buyer is entitled to know how firm
 * the number is. A tray's 60 × 30 cm is 60 × 30 cm. Adding the field would
 * invite a hedge where there is nothing to hedge.
 *
 * Images are optional, as for seeds: the photography does not exist and the
 * grid falls back to the Sprout mark. A contract that failed on it would block
 * the copy being written, which is the wrong order of work.
 */

/** Every field an `en` block must carry. Order is the order they are written. */
export const TRAY_EN_REQUIRED = [
  "name",
  "shortDescription",
  "specs",
  "imageAlt",
] as const;

/** Kannada must translate everything English has — derived, never restated. */
export const TRAY_KN_REQUIRED = TRAY_EN_REQUIRED;

/**
 * Four rows, so "present but empty" does not pass as done — and four is not
 * arbitrary: it is what the pack contains, how big it is, how thick, and what
 * it is made of. Those are the four questions asked about every item in this
 * category, and an answer missing one of them is not a spec table.
 */
export const MIN_TRAY_SPEC_ROWS = 4;

export const TRAY_TEMPLATE: ContentTemplate = {
  fields: TRAY_EN_REQUIRED,
  images: "optional",
  rules: {
    specs: { kind: "rows", min: MIN_TRAY_SPEC_ROWS },
  },
};

/** Returns a list of problems, empty when the file conforms. */
export function checkTrayFile(key: string, raw: unknown): string[] {
  return checkContentFile(TRAY_TEMPLATE, key, raw);
}
