/**
 * The template every `content/plans/<key>.json` file must follow.
 *
 * Same decision as `./variety-contract.ts`, for the same reason: without a
 * contract each file drifts into its own shape — one calls it `tagline`, the
 * next `blurb`, a third omits the highlights — and the card has to defend
 * against every variation. A template written only in a README is a
 * suggestion; `plan-contract.test.ts` makes this one a rule.
 *
 * ## The shape
 *
 * - `en` carries the full set and is required, because SPEC §4.4 makes English
 *   the fallback for everything.
 * - `kn` carries **the same full set**. The field-by-field fallback means a gap
 *   renders English silently, so a Kannada reader hits an English bullet list
 *   with nothing to tell them the translation was never written. The fallback
 *   is the right runtime behaviour and the wrong thing to rely on.
 * - No top-level block: a plan has no photography of its own.
 *
 * Deliberately *not* enforced: prose length, or the wording of any field.
 */

/** Every field an `en` block must carry. Order is the order they are written. */
export const EN_REQUIRED = [
  "name",
  "badge",
  "tagline",
  "description",
  "highlights",
] as const;

/** Derived rather than restated, so adding a field to the template cannot add
 *  it to English only. */
export const KN_REQUIRED = EN_REQUIRED;

const ALLOWED_TEXT_FIELDS = new Set<string>([...EN_REQUIRED]);
const ALLOWED_TOP_LEVEL = new Set(["en", "kn"]);

/** Three is what the card's tick list is laid out for, and fewer reads as an
 *  unfinished plan rather than a short one. */
export const MIN_HIGHLIGHTS = 3;

const isFilledString = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Prose must not restate the price or the box weight.
 *
 * Exactly the rule `variety-contract.ts` applies to `growDays`, and for the
 * same reason. `monthlyPrice` and `gramsPerBox` live in DynamoDB, are shown on
 * the card by the component, and are the two figures the owner is expected to
 * tune — so "₹1,200 a month for 400 g" written into a highlight goes stale the
 * first time either moves, and then the card contradicts itself in two places
 * a few pixels apart.
 *
 * Say what the plan *is* instead. "Enough for a salad a day" survives a price
 * change; "₹1,200 a month" does not.
 *
 * `\d+ g` deliberately also catches "500g" and the Kannada "೫೦೦ ಗ್ರಾಂ".
 *
 * No `\b` around the Kannada markers: `\b` is defined on `[A-Za-z0-9_]` even
 * under the `u` flag, so `ರೂ\b` never matches — it was the one case that got
 * through the first version of this. A digit on one side or the other is the
 * boundary instead, which is also what keeps the guard off ordinary words that
 * merely start with ರೂ, like ರೂಪುಗೊಳ್ಳುತ್ತದೆ.
 */
const MONEY =
  /(?:₹|\brs\.?|\brupees?\b|ರೂ\.?)\s*[\d೦-೯]|[\d೦-೯][\d,.]*\s*(?:rupees?\b|ರೂ)/iu;
const WEIGHT = /[\d೦-೯][\d,.]*\s*(?:g\b|gm\b|grams?\b|ಗ್ರಾಂ|ಗ್ರಾಮ್)/iu;

/**
 * Returns a list of problems, empty when the file conforms.
 *
 * Returns rather than throws so the test can report every fault in every file
 * at once.
 */
export function checkPlanFile(key: string, raw: unknown): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(`${key}: ${msg}`);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${key}: file must contain a JSON object`];
  }
  const file = raw as Record<string, unknown>;

  for (const field of Object.keys(file)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  checkText(file.en, "en", EN_REQUIRED, at);
  if (file.kn !== undefined) checkText(file.kn, "kn", KN_REQUIRED, at);
  else at('missing "kn" block — translate ' + KN_REQUIRED.join(", "));

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

    if (field === "highlights") {
      if (!Array.isArray(value) || value.length < MIN_HIGHLIGHTS) {
        at(`${locale}.highlights needs at least ${MIN_HIGHLIGHTS} entries`);
      } else if (!value.every(isFilledString)) {
        at(`${locale}.highlights entries must be non-empty strings`);
      } else {
        value.forEach((h, i) => checkFigures(h as string, `${locale}.highlights[${i}]`, at));
      }
    } else if (!isFilledString(value)) {
      at(`${locale}.${field} must be a non-empty string`);
    } else {
      checkFigures(value as string, `${locale}.${field}`, at);
    }
  }
}

function checkFigures(value: string, where: string, at: (msg: string) => void) {
  if (MONEY.test(value)) {
    at(
      `${where} states a price — monthlyPrice lives in DynamoDB and is printed ` +
        `on the card. Say what the plan is worth, not what it costs.`,
    );
  }
  if (WEIGHT.test(value)) {
    at(
      `${where} states a gram weight — gramsPerBox lives in DynamoDB and is ` +
        `printed on the card. Describe the portion instead.`,
    );
  }
}
