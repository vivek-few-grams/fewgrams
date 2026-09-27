/**
 * The shape checker for a legal page — `content/legal/<doc>.json`. Terms
 * first; privacy, refunds and shipping take the same shape.
 *
 * Like the storybook and the FAQ, a legal document is an **order**, so the
 * running order of sections is written once (`sections`) and the words sit
 * under `en` / `kn` by key. The English version is the binding one and says
 * so in its own text; the Kannada is required anyway, for the parity reason
 * in `content-contract.ts`.
 *
 * Business identity (names, address) and contact details are **tokens**, not
 * text: `{address}` is filled from `content/legal/business.json`, `{email}`
 * and `{phone}` from `content/contact.json`. A legal page that restated the
 * address would be the one place it went stale. An unknown token fails here
 * rather than rendering `{adress}` to a customer.
 *
 * **The city may be named here** (the owner, 27 Sep 2026): a jurisdiction
 * clause and a registered address need a place. The no-city rule still holds
 * for every other page. What is refused is a rupee figure — the delivery fee
 * and every price are tuned in admin, and terms restating them go stale.
 */

export const LEGAL_TOKENS = [
  "tradingName",
  "partners",
  "grievanceOfficer",
  "address",
  "email",
  "phone",
  "fssai",
] as const;

export type LegalToken = (typeof LEGAL_TOKENS)[number];

const ALLOWED_TOP_LEVEL = new Set(["updated", "sections", "en", "kn"]);
const KEY = /^[a-z]+(?:-[a-z]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** As in `plan-contract.ts`. */
const MONEY =
  /(?:₹|\brs\.?|\brupees?\b|ರೂ\.?)\s*[\d೦-೯]|[\d೦-೯][\d,.]*\s*(?:rupees?\b|ರೂ)/iu;

const isFilledString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function checkLegalDoc(name: string, raw: unknown): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(`${name}: ${msg}`);

  if (!isObject(raw)) return [`${name}: file must contain a JSON object`];
  for (const field of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  if (!isFilledString(raw.updated) || !ISO_DATE.test(raw.updated)) {
    at('"updated" must be a YYYY-MM-DD date');
  }

  const keys: string[] = [];
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    at('"sections" must be a non-empty array');
  } else {
    for (const k of raw.sections) {
      if (!isFilledString(k) || !KEY.test(k)) at(`section "${String(k)}" must be kebab-case letters`);
      else if (keys.includes(k)) at(`section "${k}" is listed twice`);
      else keys.push(k);
    }
  }

  checkBlock(keys, raw.en, "en", at);
  if (raw.kn === undefined) at('missing "kn" block');
  else checkBlock(keys, raw.kn, "kn", at);

  return problems;
}

function checkBlock(keys: string[], raw: unknown, locale: string, at: (msg: string) => void) {
  if (!isObject(raw)) {
    at(`"${locale}" must be an object`);
    return;
  }
  const copy = (value: unknown, where: string) => {
    if (!isFilledString(value)) {
      at(`${where} must be a non-empty string`);
      return;
    }
    if (MONEY.test(value)) at(`${where} states a price — prices come from DynamoDB`);
    for (const [, token] of value.matchAll(/\{([^}]*)\}/g)) {
      if (!LEGAL_TOKENS.includes(token as LegalToken)) at(`${where} uses unknown token {${token}}`);
    }
  };
  const paragraphs = (value: unknown, where: string) => {
    if (!Array.isArray(value) || value.length === 0) at(`${where} needs at least one paragraph`);
    else value.forEach((p, i) => copy(p, `${where}[${i}]`));
  };

  for (const field of Object.keys(raw)) {
    if (field !== "intro" && field !== "sections") at(`${locale}.${field} is not a field`);
  }
  paragraphs(raw.intro, `${locale}.intro`);

  const sections = isObject(raw.sections) ? raw.sections : {};
  if (!isObject(raw.sections)) at(`${locale}.sections must be an object`);
  for (const key of Object.keys(sections)) {
    if (!keys.includes(key)) at(`${locale}.sections.${key} is not in "sections"`);
  }
  for (const key of keys) {
    const s = sections[key];
    if (!isObject(s)) {
      at(`${locale}.sections.${key} is required`);
      continue;
    }
    for (const field of Object.keys(s)) {
      if (field !== "heading" && field !== "body") at(`${locale}.sections.${key}.${field} is not a field`);
    }
    copy(s.heading, `${locale}.sections.${key}.heading`);
    paragraphs(s.body, `${locale}.sections.${key}.body`);
  }
}
