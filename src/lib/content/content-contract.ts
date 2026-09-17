/**
 * The shape checker every content template runs through — SPEC §4.3.
 *
 * DECISION (15 Sep 2026, generalised 17 Sep 2026): **content files share one
 * fixed shape per catalogue.** Without that, each file drifts into its own
 * structure — one has `flavourNotes`, the next calls it `taste`, a third omits
 * cautions — and the detail page has to defend against every variation. A
 * template that is only written down in a README is a suggestion; this makes
 * it a test.
 *
 * ## Why the engine is separate from the templates
 *
 * There are two templates — varieties (`variety-contract.ts`) and seeds
 * (`seed-contract.ts`) — and they have genuinely different fields: a variety
 * has a nutrition table and flavour notes, a seed has a germination spec and
 * sowing instructions. What they share is every *rule about* those fields:
 * English is required in full, Kannada must match it field for field, a table
 * needs a minimum number of rows with a label and a value each, an unknown
 * field is a typo worth failing on.
 *
 * So a template is a **declaration** — these fields, in this order, of these
 * kinds — and this file is the only implementation. A second copy of the
 * checker would be a second place for the next rule to be applied to half the
 * catalogue.
 *
 * Deliberately *not* enforced: prose length, or the wording of any field. A
 * contract on structure is useful; a contract on style is a straitjacket.
 */

/** What kind of value a field holds, and the minimum that counts as written. */
export type FieldRule =
  /** A paragraph or a sentence. `noDayCount` bans a written day count — see
   *  `DAY_COUNT`. */
  | { kind: "prose"; noDayCount?: boolean }
  /** A two-column table: `{ label, value }` rows. */
  | { kind: "rows"; min: number }
  /** A bullet list of plain strings. */
  | { kind: "list"; min: number }
  /** Question-and-answer pairs, a fixed number of them. */
  | { kind: "faq"; count: number };

export type ContentTemplate = {
  /** Every field an `en` block must carry, in the order they are written. */
  fields: readonly string[];
  /** Anything not named here is `{ kind: "prose" }`. */
  rules: Readonly<Record<string, FieldRule>>;
  /**
   * Whether a hero photograph and one gallery shot are required.
   *
   * Required for varieties, whose photography is shot before they go on sale
   * and whose card treatment depends on it (SPEC §17.4). Optional for seeds,
   * where the packet photography does not exist yet and the detail page falls
   * back to the Sprout mark — a contract that failed on it would block the
   * copy being written at all, which is the wrong order of work.
   */
  images: "required" | "optional";
};

/** Language-independent keys allowed at the top level of any content file. */
const ALLOWED_TOP_LEVEL = new Set(["images", "recipeSlugs", "en", "kn"]);

const isFilledString = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Prose must not restate a day count that lives in DynamoDB.
 *
 * `Variety.growDays` is shown on the card and the variety page, and the admin
 * screen explicitly tells the owner to revisit it after a few sows. A day
 * count written into the copy therefore goes stale the first time they tune it
 * — and it already had: red amaranthus carried `growDays: 7` in the table,
 * "14 days" in its growing tips and "ten days" in its description, three
 * different numbers for one green.
 *
 * Copy should name the **signal** instead — "cut when the first true leaves
 * appear" — which is better growing advice and cannot drift.
 *
 * Applied per field via `noDayCount`, not globally: a seed's soak time is a
 * fact about the seed with no DynamoDB field to contradict, and "five to seven
 * days" in an FAQ legitimately means fridge life rather than grow time.
 */
const DAY_COUNT =
  /\b(?:\d+|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)[\s-]*days?\b|\bday\s+(?:\d+|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\b|(?:\d+|ಏಳು|ಎಂಟು|ಒಂಬತ್ತು|ಹತ್ತು|ಹನ್ನೊಂದು|ಹನ್ನೆರಡು|ಹದಿನಾಲ್ಕು|ಏಳನೇ|ಎಂಟನೇ|ಒಂಬತ್ತನೇ|ಹತ್ತನೇ)\s*ದಿನ/iu;

/**
 * Returns a list of problems, empty when the file conforms.
 *
 * Returns rather than throws so the test can report every fault in every file
 * at once — fixing ten files one thrown error at a time is miserable.
 */
export function checkContentFile(
  template: ContentTemplate,
  key: string,
  raw: unknown,
): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(`${key}: ${msg}`);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${key}: file must contain a JSON object`];
  }
  const file = raw as Record<string, unknown>;

  for (const field of Object.keys(file)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  checkImages(template, file.images, at);

  checkText(template, file.en, "en", at);
  /* Kannada carries **the same full set**. Changed 15 Sep 2026 from a
     high-intent subset to full parity: the field-by-field English fallback
     means a gap renders English silently, so a Kannada reader hits paragraphs
     of English with nothing to tell them a translation was never written. The
     fallback is the right runtime behaviour and the wrong thing to rely on. */
  if (file.kn !== undefined) checkText(template, file.kn, "kn", at);
  else at('missing "kn" block — translate at least ' + template.fields.join(", "));

  return problems;
}

function checkImages(
  template: ContentTemplate,
  raw: unknown,
  at: (msg: string) => void,
) {
  const optional = template.images === "optional";
  if (raw === undefined || typeof raw !== "object" || raw === null) {
    if (!optional) at('missing "images"');
    return;
  }
  const images = raw as Record<string, unknown>;

  if (!optional || images.hero !== undefined) {
    if (!isFilledString(images.hero)) at("images.hero is required");
  }
  if (!optional || images.gallery !== undefined) {
    if (!Array.isArray(images.gallery) || images.gallery.length < 1) {
      at("images.gallery needs at least one filename");
    }
  }
  /* Optional everywhere — an item with no cut-out yet renders the flat hero
     treatment. Checked only for shape, so `"cutout": true` is caught here
     rather than becoming a broken image on the grid. */
  if (images.cutout !== undefined && !isFilledString(images.cutout)) {
    at("images.cutout must be a filename when present");
  }
}

function checkText(
  template: ContentTemplate,
  raw: unknown,
  locale: string,
  at: (msg: string) => void,
) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    at(`"${locale}" must be an object`);
    return;
  }
  const text = raw as Record<string, unknown>;
  const allowed = new Set<string>(template.fields);

  for (const field of Object.keys(text)) {
    if (!allowed.has(field)) at(`${locale}.${field} is not a field in the template`);
  }

  for (const field of template.fields) {
    if (!(field in text)) {
      at(`${locale}.${field} is required`);
      continue;
    }
    const value = text[field];
    const rule = template.rules[field] ?? { kind: "prose" };

    if (rule.kind === "rows") {
      if (!Array.isArray(value) || value.length < rule.min) {
        at(`${locale}.${field} needs at least ${rule.min} rows`);
      } else if (
        !value.every(
          (r) =>
            typeof r === "object" &&
            r !== null &&
            isFilledString((r as Record<string, unknown>).label) &&
            isFilledString((r as Record<string, unknown>).value),
        )
      ) {
        at(`${locale}.${field} rows each need a label and a value`);
      }
    } else if (rule.kind === "list") {
      if (!Array.isArray(value) || value.length < rule.min) {
        at(`${locale}.${field} needs at least ${rule.min} entries`);
      } else if (!value.every(isFilledString)) {
        at(`${locale}.${field} entries must be non-empty strings`);
      }
    } else if (rule.kind === "faq") {
      if (!Array.isArray(value) || value.length !== rule.count) {
        at(`${locale}.${field} must have exactly ${rule.count} entries`);
      } else if (
        !value.every(
          (f) =>
            typeof f === "object" &&
            f !== null &&
            isFilledString((f as Record<string, unknown>).question) &&
            isFilledString((f as Record<string, unknown>).answer),
        )
      ) {
        at(`${locale}.${field} entries each need a question and an answer`);
      }
    } else if (!isFilledString(value)) {
      at(`${locale}.${field} must be a non-empty string`);
    } else if (rule.noDayCount && DAY_COUNT.test(value as string)) {
      at(
        `${locale}.${field} states a day count — growDays lives in DynamoDB ` +
          `and is shown on the page. Describe the signal to cut on instead.`,
      );
    }
  }
}
