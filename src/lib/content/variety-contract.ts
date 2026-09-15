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
 * ## The shape
 *
 * - Language-independent facts (`images`) at the top level.
 * - `en` carries the full set and is required, because SPEC §4.4 makes English
 *   the fallback for everything.
 * - `kn` carries **the same full set**. Changed 15 Sep 2026 from a high-intent
 *   subset to full parity: the field-by-field English fallback means a gap
 *   renders English silently, so a Kannada reader hits paragraphs of English
 *   with nothing to tell them a translation was never written. The fallback is
 *   the right runtime behaviour and the wrong thing to rely on.
 *
 * Deliberately *not* enforced: prose length, or the wording of any field.
 * A contract on structure is useful; a contract on style is a straitjacket.
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

/** Anything outside this is a typo or an invention — both worth failing on. */
const ALLOWED_TEXT_FIELDS = new Set<string>([...EN_REQUIRED]);
const ALLOWED_TOP_LEVEL = new Set(["images", "recipeSlugs", "en", "kn"]);

/** Minimums, so "present but empty" does not pass as done. */
export const MIN_NUTRITION_ROWS = 5;
export const MIN_BENEFITS = 3;
export const MIN_CAUTIONS = 1;
/** Exactly five, so every variety page has the same weight of FAQ. */
export const FAQ_COUNT = 5;

const isFilledString = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Prose must not restate `growDays`.
 *
 * `growDays` lives in DynamoDB and is shown on the card and the variety page,
 * and the admin screen explicitly tells the owner to revisit it after a few
 * sows. A day count written into the copy therefore goes stale the first time
 * they tune it — and it already had: red amaranthus carried `growDays: 7` in
 * the table, "14 days" in its growing tips and "ten days" in its description,
 * three different numbers for one green.
 *
 * Copy should name the **signal** instead — "cut when the first true leaves
 * appear" — which is better growing advice and cannot drift.
 *
 * Checked on the three prose fields only, not the FAQ, where "five to seven
 * days" legitimately means fridge life rather than grow time. That is a
 * deliberate gap in coverage, not an oversight.
 */
const PROSE_FIELDS = ["shortDescription", "description", "growingTips"] as const;
const DAY_COUNT =
  /\b(?:\d+|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)[\s-]*days?\b|\bday\s+(?:\d+|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\b|(?:\d+|ಏಳು|ಎಂಟು|ಒಂಬತ್ತು|ಹತ್ತು|ಹನ್ನೊಂದು|ಹನ್ನೆರಡು|ಹದಿನಾಲ್ಕು|ಏಳನೇ|ಎಂಟನೇ|ಒಂಬತ್ತನೇ|ಹತ್ತನೇ)\s*ದಿನ/iu;

/**
 * Returns a list of problems, empty when the file conforms.
 *
 * Returns rather than throws so the test can report every fault in every file
 * at once — fixing ten files one thrown error at a time is miserable.
 */
export function checkVarietyFile(key: string, raw: unknown): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(`${key}: ${msg}`);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${key}: file must contain a JSON object`];
  }
  const file = raw as Record<string, unknown>;

  for (const field of Object.keys(file)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  // --- images ---
  const images = file.images as Record<string, unknown> | undefined;
  if (!images || typeof images !== "object") {
    at('missing "images"');
  } else {
    if (!isFilledString(images.hero)) at("images.hero is required");
    if (!Array.isArray(images.gallery) || images.gallery.length < 1) {
      at("images.gallery needs at least one filename");
    }
  }

  // --- locales ---
  checkText(file.en, "en", EN_REQUIRED, at);
  if (file.kn !== undefined) checkText(file.kn, "kn", KN_REQUIRED, at);
  else at('missing "kn" block — translate at least ' + KN_REQUIRED.join(", "));

  return problems;
}

function checkText(
  raw: unknown,
  locale: string,
  required: readonly string[],
  at: (msg: string) => void,
) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    at(`"${locale}" must be an object`);
    return;
  }
  const text = raw as Record<string, unknown>;

  for (const field of Object.keys(text)) {
    if (!ALLOWED_TEXT_FIELDS.has(field)) {
      at(`${locale}.${field} is not a field in the template`);
    }
  }

  for (const field of required) {
    if (!(field in text)) {
      at(`${locale}.${field} is required`);
      continue;
    }
    const value = text[field];

    if (field === "nutrition") {
      if (!Array.isArray(value) || value.length < MIN_NUTRITION_ROWS) {
        at(`${locale}.nutrition needs at least ${MIN_NUTRITION_ROWS} rows`);
      } else if (
        !value.every(
          (r) =>
            typeof r === "object" &&
            r !== null &&
            isFilledString((r as Record<string, unknown>).label) &&
            isFilledString((r as Record<string, unknown>).value),
        )
      ) {
        at(`${locale}.nutrition rows each need a label and a value`);
      }
    } else if (field === "benefits" || field === "cautions") {
      const min = field === "benefits" ? MIN_BENEFITS : MIN_CAUTIONS;
      if (!Array.isArray(value) || value.length < min) {
        at(`${locale}.${field} needs at least ${min} entries`);
      } else if (!value.every(isFilledString)) {
        at(`${locale}.${field} entries must be non-empty strings`);
      }
    } else if (field === "faq") {
      if (!Array.isArray(value) || value.length !== FAQ_COUNT) {
        at(`${locale}.faq must have exactly ${FAQ_COUNT} entries`);
      } else if (
        !value.every(
          (f) =>
            typeof f === "object" &&
            f !== null &&
            isFilledString((f as Record<string, unknown>).question) &&
            isFilledString((f as Record<string, unknown>).answer),
        )
      ) {
        at(`${locale}.faq entries each need a question and an answer`);
      }
    } else if (!isFilledString(value)) {
      at(`${locale}.${field} must be a non-empty string`);
    } else if (
      (PROSE_FIELDS as readonly string[]).includes(field) &&
      DAY_COUNT.test(value as string)
    ) {
      at(
        `${locale}.${field} states a day count — growDays lives in DynamoDB ` +
          `and is shown on the page. Describe the signal to cut on instead.`,
      );
    }
  }
}
