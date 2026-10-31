import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { isValidContentKey } from "./content-key";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Starter-pack content — SPEC §29.2. The plans loader (`./plans.ts`) for a
 * second folder: every word a visitor reads about a pack lives in
 * `content/packs/<contentKey>.json`, and DynamoDB holds only the price and
 * the parts. Same English-first, field-by-field fallback, same `_` files
 * ignored so the template can sit in the folder.
 */

const CONTENT_DIR = path.join(process.cwd(), "content", "packs");

/** The editorial text for one pack in one language. */
export type PackText = {
  /** "Single Rack Pack" — the column's title and the cart line's name. */
  name: string;
  /** The pill above the column — "Start here", "Growing to sell". Copy, not a
   *  shared message, because what to say about each pack is a merchandising
   *  call per pack (the plans' reasoning). */
  badge: string;
  /** One line under the name. */
  tagline: string;
  /** The paragraph at the top of the pack's own page. */
  description: string;
  /** The ticked list on the column. At least three. */
  highlights: string[];
};

export type PackContentFile = { en: PackText; kn?: Partial<PackText> };
export type PackContent = { key: string; text: PackText };

/** Every pack with a content file — the list of packs that could exist.
 *  DynamoDB says which are sold, at what price and in what order. */
export const listPackKeys = cache(async (): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(CONTENT_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -".json".length))
    .filter(isValidContentKey)
    .sort();
});

const readPackFile = cache(async (key: string): Promise<PackContentFile | null> => {
  if (!isValidContentKey(key)) return null;
  try {
    const parsed = JSON.parse(
      await readFile(path.join(CONTENT_DIR, `${key}.json`), "utf8"),
    ) as PackContentFile;
    return parsed?.en?.name ? parsed : null;
  } catch {
    return null;
  }
});

function asLocale(locale: string): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/** English underneath, per field; an empty Kannada value never renders. */
function resolve(file: PackContentFile, locale: Locale): PackText {
  if (locale === routing.defaultLocale) return file.en;
  const merged: PackText = { ...file.en };
  for (const [field, value] of Object.entries(file.kn ?? {})) {
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (!empty) Object.assign(merged, { [field]: value });
  }
  return merged;
}

export async function getPackContent(key: string, locale: string): Promise<PackContent | null> {
  const file = await readPackFile(key);
  return file ? { key, text: resolve(file, asLocale(locale)) } : null;
}

/** Every content file, resolved — the admin screen's list of rows. */
export async function listPackContent(locale: string): Promise<PackContent[]> {
  const all = await Promise.all((await listPackKeys()).map((key) => getPackContent(key, locale)));
  return all.filter((c): c is PackContent => c !== null);
}
