/**
 * The FAQ's shape checker — `content/faq.json`, the same contract the
 * storybook has.
 *
 * Like the book it is **one file holding an order**: sections in a running
 * order, and questions in an order within each. So, like the book, the order
 * lives once at the top (`sections`) and the words for each key sit under
 * `en` / `kn`, and this checks the level above a single item — that every key
 * the order names has words in both languages, and that no words are left
 * behind for a key the order no longer names.
 *
 * It also carries the copy rules an FAQ is most likely to break, because an
 * FAQ is exactly where somebody answers "how much is delivery?" with a number:
 *
 * - **No rupee figure.** The own-run fee is set on admin → delivery, courier
 *   prices are quoted live, and every catalogue price is in DynamoDB.
 * - **No day count.** Grow days are tuned in admin and printed on the variety
 *   page; a figure here goes stale the first time one is retuned. "The next
 *   day" and "every Saturday" are claims about the operation and cannot drift.
 * - **No city name** (the owner's rule, 24 Sep 2026): the delivery area is a
 *   district rule in `src/lib/pincode/area.ts`, not a place copy promises.
 *
 * Returns problems rather than throwing, so one run reports every fault.
 */

export const FAQ_FIELDS = ["question", "answer"] as const;

const ALLOWED_TOP_LEVEL = new Set(["sections", "en", "kn"]);
const ALLOWED_SECTION_KEYS = new Set(["key", "questions"]);
const ALLOWED_BLOCK_KEYS = new Set(["sections", "questions"]);

/** Kebab-case, no digits — the rule every content key obeys. Question keys
 *  double as the anchor ids on `/faq`, so they are URLs too. */
const KEY = /^[a-z]+(?:-[a-z]+)*$/;

/** Same pattern as `plan-contract.ts`, for the reasons recorded there
 *  (`\b` is ASCII-only, so the Kannada marker is anchored on the digit). */
const MONEY = /(?:₹|\brs\.?|\brupees?\b|ರೂ\.?)\s*[\d೦-೯]|[\d೦-೯][\d,.]*\s*(?:rupees?\b|ರೂ)/iu;

/** A count of days, in figures or words, in either script. Same scope as the
 *  storybook's rule: a count, not the word. */
const DAY_COUNT =
  /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)[\s-]*days?\b|(?:[\d೦-೯]+|ಎರಡು|ಮೂರು|ನಾಲ್ಕು|ಐದು|ಆರು|ಏಳು|ಎಂಟು|ಒಂಬತ್ತು|ಹತ್ತು|ಹನ್ನೊಂದು|ಹನ್ನೆರಡು|ಹದಿನಾಲ್ಕು)\s*ದಿನ/iu;

/** Stems, so inflected forms match too — ಬೆಂಗಳೂರಿನಲ್ಲಿ drops the final ು. */
const CITY = /bengal[uo]r|bangalor|ಬೆಂಗಳೂರ/iu;

const isFilledString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

type Order = { sections: string[]; questions: string[] };

export function checkFaqFile(raw: unknown): string[] {
  const problems: string[] = [];
  const at = (msg: string) => problems.push(msg);

  if (!isObject(raw)) return ["faq.json must contain a JSON object"];

  for (const field of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL.has(field)) at(`unknown top-level field "${field}"`);
  }

  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    return [...problems, '"sections" must be a non-empty array'];
  }

  const order = checkOrder(raw.sections, at);
  checkTextBlock(order, raw.en, "en", at);
  /* Kannada carries the full set, for the reason in `content-contract.ts`:
     the fallback renders a gap in English with nothing to say why. */
  if (raw.kn === undefined) at('missing "kn" block');
  else checkTextBlock(order, raw.kn, "kn", at);

  return problems;
}

function checkOrder(sections: unknown[], at: (msg: string) => void): Order {
  const order: Order = { sections: [], questions: [] };

  sections.forEach((entry, i) => {
    const where = `sections[${i}]`;
    if (!isObject(entry)) {
      at(`${where} must be an object`);
      return;
    }
    for (const field of Object.keys(entry)) {
      if (!ALLOWED_SECTION_KEYS.has(field)) at(`${where}.${field} is not a section field`);
    }

    const key = entry.key;
    if (!isFilledString(key) || !KEY.test(key)) {
      at(`${where}.key must be kebab-case letters, no digits`);
    } else if (order.sections.includes(key)) {
      at(`${where}.key "${key}" is already used by an earlier section`);
    } else {
      order.sections.push(key);
    }

    if (!Array.isArray(entry.questions) || entry.questions.length === 0) {
      at(`${where}.questions must be a non-empty array`);
      return;
    }
    for (const q of entry.questions) {
      if (!isFilledString(q) || !KEY.test(q)) {
        at(`${where}.questions: "${String(q)}" must be kebab-case letters, no digits`);
      } else if (order.questions.includes(q)) {
        /* Question keys are anchor ids, so they are unique across the page,
           not just within a section. */
        at(`${where}.questions: "${q}" is already used`);
      } else {
        order.questions.push(q);
      }
    }
  });

  return order;
}

function checkTextBlock(order: Order, raw: unknown, locale: string, at: (msg: string) => void) {
  if (!isObject(raw)) {
    at(`"${locale}" must be an object`);
    return;
  }
  for (const field of Object.keys(raw)) {
    if (!ALLOWED_BLOCK_KEYS.has(field)) at(`${locale}.${field} is not a field`);
  }

  const copy = (value: string, where: string) => {
    if (MONEY.test(value)) at(`${where} states a price — prices are printed from DynamoDB`);
    if (DAY_COUNT.test(value)) at(`${where} states a day count — dates come from the rules`);
    if (CITY.test(value)) at(`${where} names the city — say "selected areas"`);
  };

  const sections = isObject(raw.sections) ? raw.sections : {};
  if (!isObject(raw.sections)) at(`${locale}.sections must be an object`);
  for (const key of Object.keys(sections)) {
    if (!order.sections.includes(key)) at(`${locale}.sections.${key} is not in "sections"`);
  }
  for (const key of order.sections) {
    const title = sections[key];
    if (!isFilledString(title)) at(`${locale}.sections.${key} must be a non-empty string`);
    else copy(title, `${locale}.sections.${key}`);
  }

  const questions = isObject(raw.questions) ? raw.questions : {};
  if (!isObject(raw.questions)) at(`${locale}.questions must be an object`);
  for (const key of Object.keys(questions)) {
    /* Words with no place in the order render nowhere: a deleted question's
       leftovers, or a typo'd key that is quietly falling back to English. */
    if (!order.questions.includes(key)) at(`${locale}.questions.${key} is not in any section`);
  }
  for (const key of order.questions) {
    const where = `${locale}.questions.${key}`;
    const entry = questions[key];
    if (!isObject(entry)) {
      at(`${where} is required`);
      continue;
    }
    for (const field of Object.keys(entry)) {
      if (!FAQ_FIELDS.includes(field as (typeof FAQ_FIELDS)[number])) {
        at(`${where}.${field} is not a field in the template`);
      }
    }
    if (!isFilledString(entry.question)) at(`${where}.question must be a non-empty string`);
    else copy(entry.question, `${where}.question`);

    if (!Array.isArray(entry.answer) || entry.answer.length === 0) {
      at(`${where}.answer needs at least one paragraph`);
    } else {
      entry.answer.forEach((p, i) => {
        if (!isFilledString(p)) at(`${where}.answer[${i}] must be a non-empty string`);
        else copy(p, `${where}.answer[${i}]`);
      });
    }
  }
}
