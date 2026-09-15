import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { isValidContentKey } from "./content-key";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Plan content — SPEC §4.3, same split as varieties.
 *
 * DECISION (15 Sep 2026): **no plan text is entered in the admin UI.** A plan
 * used to carry `name`, `blurb` and `highlights` in DynamoDB, typed into the
 * admin form in two languages. Three things were wrong with that:
 *
 * 1. `highlights` was a plain `string[]`, so it was **untranslatable** — a
 *    Kannada visitor read the bullet list in English with nothing to signal it.
 *    A `LocalisedString[]` would have fixed the type and kept the real problem.
 * 2. Typing a paragraph of Kannada into a web form, twice, is worse than
 *    editing one file — and it gets no diff, no review and no git history.
 * 3. It made the admin screen the authority on wording, which CLAUDE.md
 *    explicitly reserves for translation and content files.
 *
 * So DynamoDB now holds exactly what the business tunes — price, grams per
 * box, card colour, order, recommended, active — and every word lives in
 * `content/plans/<contentKey>.json`. Identical reasoning, shape and identifier
 * rules to `./varieties.ts`; read its header for the three-identifier table.
 *
 * `contentKey` replaced `slug`: it does the same two jobs (stable identifier,
 * URL segment) plus naming the content file.
 */

export { isValidContentKey, sanitiseKey } from "./content-key";

const CONTENT_DIR = path.join(process.cwd(), "content", "plans");

/** The editorial text for one plan in one language. */
export type PlanText = {
  /** "Essential", "Build Your Own". The card title, and the word(s) the card's
   *  marquee scrolls — which is why the BYO marquee is no longer four
   *  hardcoded English words in the component. */
  name: string;
  /**
   * The pill above the card — "Recommended", "Essentials included".
   *
   * Content, not a message key, because it is a **claim about this plan**
   * rather than UI chrome: which plan you push and what you say about it is a
   * merchandising decision per plan, and a single shared `card.recommended`
   * key could only ever label one of the three.
   *
   * Whether the pill is the filled, emphasised variant is still DynamoDB's
   * `recommended` — the label is copy, the emphasis is merchandising, and the
   * owner changes the second far more often than the first.
   */
  badge: string;
  /** One line under the title. Was `blurb` in DynamoDB. */
  tagline: string;
  /** The paragraph shown with the rotation, where there is room for it. */
  description: string;
  /** The ticked list on the card. At least three. */
  highlights: string[];
};

/**
 * One `content/plans/<key>.json` file, as written on disk.
 *
 * No top-level block: unlike a variety, a plan has no photography of its own —
 * the card renders the generated `Sprout` mark — so everything in the file is
 * language-dependent.
 */
export type PlanContentFile = {
  en: PlanText;
  kn?: Partial<PlanText>;
};

/** A file resolved for one locale, with English already merged underneath. */
export type PlanContent = { key: string; text: PlanText };

/**
 * Every plan with a content file, sorted.
 *
 * This is the **list of plans that could exist**; DynamoDB says which are
 * actually sold, at what price and in what order. Files starting with `_` are
 * ignored, so the template can live in the folder without becoming a plan.
 */
export const listPlanKeys = cache(async (): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(CONTENT_DIR);
  } catch {
    // No folder yet is a legitimate state on a fresh checkout, not an error.
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .filter(isValidContentKey)
    .sort();
});

const readPlanFile = cache(async (key: string): Promise<PlanContentFile | null> => {
  if (!isValidContentKey(key)) return null;
  try {
    const raw = await readFile(path.join(CONTENT_DIR, `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as PlanContentFile;
    // A file with no English name cannot render a card or a title, so it is
    // treated as absent rather than as a plan with a blank name.
    return parsed?.en?.name ? parsed : null;
  } catch {
    return null;
  }
});

function asLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/**
 * SPEC §4.4's resolution rule, per field: fall back to English on any missing
 * `kn` value, and never render an empty string.
 *
 * Field by field rather than whole-file, so a file with the name translated
 * but not the highlights renders the Kannada name and the English bullets —
 * the point of progressive translation. `plan-contract.test.ts` is what stops
 * that being relied on as a permanent state.
 */
export function resolvePlanText(file: PlanContentFile, locale: Locale): PlanText {
  if (locale === routing.defaultLocale) return file.en;

  const override = file.kn ?? {};
  const merged: PlanText = { ...file.en };
  for (const [field, value] of Object.entries(override)) {
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (!empty) Object.assign(merged, { [field]: value });
  }
  return merged;
}

export async function getPlanContent(
  key: string,
  locale: string,
): Promise<PlanContent | null> {
  const file = await readPlanFile(key);
  if (!file) return null;
  return { key, text: resolvePlanText(file, asLocale(locale)) };
}

/** Every content file, resolved. Used by the admin key picker. */
export async function listPlanContent(locale: string): Promise<PlanContent[]> {
  const keys = await listPlanKeys();
  const all = await Promise.all(keys.map((key) => getPlanContent(key, locale)));
  return all.filter((c): c is PlanContent => c !== null);
}

/**
 * Joins DynamoDB rows to their content files.
 *
 * `content` is null when the file is missing, and that is surfaced rather than
 * filtered here because the two callers want opposite things: the home page
 * must skip a plan it cannot name, and the admin must flag it loudly so
 * somebody writes the copy.
 */
export async function attachPlanContent<T extends { contentKey: string }>(
  rows: T[],
  locale: string,
): Promise<Array<T & { content: PlanContent | null }>> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      content: await getPlanContent(row.contentKey, locale),
    })),
  );
}
