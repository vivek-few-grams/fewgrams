/**
 * The template every `content/packs/<key>.json` file must follow — SPEC §29.2.
 *
 * The plan contract's shape and reasoning (`./plan-contract.ts`): a full `en`
 * block, the same full set in `kn`, nothing else at the top level, and at
 * least three highlights. `pack-contract.test.ts` makes it a rule.
 *
 * Three things the copy must not state, because something else prints them:
 *
 * - **A price.** Typed on admin → packs and printed on the card; a figure in
 *   the copy goes stale the first time it moves.
 * - **A weight.** "100 g of each" is printed from the cart's unit, and a
 *   cocopeat block's kilos are in its own name.
 * - **The city.** The pack page names it for the on-site consultation — the
 *   owner's exception to the no-city rule (30 Oct 2026) — and that line is
 *   chrome in `messages/<locale>/shop.json`, decided by the pack's `onSite`
 *   flag. A city in the copy would claim a visit for a pack that offers none.
 *
 * Counts are not policed by regex — "two racks" in a highlight is the pack's
 * nature, not a tuned figure — but the tray and seed counts are, and they are
 * printed from DynamoDB. Say what the pack is for, not how many of each.
 */

export const EN_REQUIRED = ["name", "badge", "tagline", "description", "highlights"] as const;

/** Derived, so a field added to the template cannot be added to English only. */
export const KN_REQUIRED = EN_REQUIRED;

const ALLOWED_TEXT_FIELDS = new Set<string>([...EN_REQUIRED]);
const ALLOWED_TOP_LEVEL = new Set(["en", "kn"]);

export const MIN_HIGHLIGHTS = 3;

const isFilledString = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/* The plan contract's two patterns — see its notes on the Kannada boundaries. */
const MONEY = /(?:₹|\brs\.?|\brupees?\b|ರೂ\.?)\s*[\d೦-೯]|[\d೦-೯][\d,.]*\s*(?:rupees?\b|ರೂ)/iu;
const WEIGHT = /[\d೦-೯][\d,.]*\s*(?:g\b|gm\b|grams?\b|kg\b|ಗ್ರಾಂ|ಗ್ರಾಮ್|ಕೆಜಿ)/iu;
/* The Kannada stem, not the word: the name is inflected — ಬೆಂಗಳೂರಿನಲ್ಲಿ,
   "in Bengaluru", does not contain ಬೆಂಗಳೂರು. */
const CITY = /bengaluru|bangalore|ಬೆಂಗಳೂರ/iu;

/** Every problem in one file, empty when it conforms. Returns rather than
 *  throws so the test reports every fault at once. */
export function checkPackFile(key: string, raw: unknown): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(`${key}: ${msg}`);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${key}: file must contain a JSON object`];
  }
  const file = raw as Record<string, unknown>;

  for (const field of Object.keys(file)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  checkText(file.en, "en", at);
  if (file.kn !== undefined) checkText(file.kn, "kn", at);
  else at('missing "kn" block — translate ' + KN_REQUIRED.join(", "));

  return problems;
}

function checkText(raw: unknown, locale: string, at: (msg: string) => void) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    at(`"${locale}" must be an object`);
    return;
  }
  const text = raw as Record<string, unknown>;

  for (const field of Object.keys(text)) {
    if (!ALLOWED_TEXT_FIELDS.has(field)) at(`${locale}.${field} is not a field in the template`);
  }

  for (const field of EN_REQUIRED) {
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
    at(`${where} states a price — the pack's price is typed in admin and printed on the card.`);
  }
  if (WEIGHT.test(value)) {
    at(`${where} states a weight — seed and cocopeat weights are printed from the catalogue.`);
  }
  if (CITY.test(value)) {
    at(
      `${where} names the city — the on-site consultation line is chrome, shown only for a ` +
        `pack whose onSite flag is set (shop.json).`,
    );
  }
}
