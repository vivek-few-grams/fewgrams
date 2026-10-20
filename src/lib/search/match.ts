/**
 * Matching a query against the catalogue — SPEC §27.
 *
 * Pure and dependency-free, because two places rank with it and they must
 * agree: the header box runs it in the browser on every keystroke, and
 * `/search` runs it on the server. If the drop-down showed one order and
 * "See all results" another, the second page would read as a different search.
 *
 * ## Why there is no search service
 *
 * The whole catalogue is about fifty things, every word of it already in
 * `content/`. Matching fifty entries is well under a millisecond, and a hosted
 * index would cost a monthly minimum plus a job to keep it in step with admin.
 *
 * ## Every language, whatever the page is in
 *
 * An entry carries its terms in both English and Kannada, so "radish" and
 * "ಮೂಲಂಗಿ" both find it on either locale; only the name *shown* is the
 * visitor's. Kannada typed in Latin letters ("moolangi") is not matched — the
 * owner's call, 19 Oct 2026, over an `aliases` field in every content file.
 */

/**
 * Everything search can return, in the order a tie is broken.
 *
 * The cart's five kinds plus `plan`. A `rack` here is a **range** — "Shelf
 * racks" — not one SKU: a model has no name to match (SPEC §19.5), and the
 * range page is where the size is chosen.
 */
export const SEARCH_KINDS = ["variety", "plan", "seed", "tray", "media", "rack"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** What an entry is matched on, each in every language. */
export type SearchTerms = {
  /** The product's name. */
  names: string[];
  /** Its category's label — "Seeds", "ಬೀಜಗಳು" — so "seeds" lists the shelf. */
  kind: string[];
  /** The one-line description, so "peppery" finds radish, cress and rocket. */
  blurbs: string[];
};

/**
 * How much a hit in each field is worth, and whether a typo is forgiven there.
 *
 * A typo is forgiven in a name or a category and not in a description: a
 * description is a sentence, and an edit distance of one across every word in
 * it matches nearly anything ("seed" is one letter from "need", "speed"...).
 */
const FIELDS = [
  { field: "names", weight: 3, fuzzy: true },
  { field: "kind", weight: 2, fuzzy: true },
  { field: "blurbs", weight: 1, fuzzy: false },
] as const satisfies ReadonlyArray<{ field: keyof SearchTerms; weight: number; fuzzy: boolean }>;

/**
 * Words dropped from a query, so "seeds for microgreens" is not refused for
 * the want of a product described with the word "for". Every query word has
 * to match something (see `rank`), which is right for "red cabbage" and wrong
 * for these. English only: a Kannada query is a name, not a sentence.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "with",
  "in",
  "on",
  "to",
  "from",
  "by",
  "or",
  "buy",
]);

/** The zero-width joiners Kannada uses between letters — "ಬೀಟ್‌ರೂಟ್" — which a
 *  visitor may or may not type. Removed from both sides. */
const JOINERS = /[‌‍]/gu;

/**
 * An English plural, cut back to its singular, so "trays" meets "tray" and
 * "radishes" meets "radish". Deliberately crude — it only has to make both
 * sides agree, and it runs on both. Leaves "cress", "amaranthus" and every
 * Kannada word alone.
 *
 * Safe on a half-typed word too: it only ever removes letters from the end, so
 * a stemmed "radis" is still a prefix of "radish".
 */
export function stem(word: string): string {
  if (word.length < 4 || !/^[a-z]+$/.test(word)) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Text as a list of comparable words.
 *
 * NFKC and lower case, then split on anything that is not a letter, a mark or
 * a digit. **Marks are kept on purpose**: Kannada vowel signs are combining
 * marks, and stripping them the way one strips Latin accents would turn
 * "ಮೂಲಂಗಿ" into a string of bare consonants. A digit next to a letter is split
 * off it, so "5kg" meets "5 kg".
 */
export function tokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(JOINERS, "")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);
}

/** The query's words, without the stop words — unless that would leave none,
 *  when "the" is searched for as itself. */
export function queryTokens(query: string): string[] {
  const all = tokens(query);
  const kept = all.filter((w) => !STOP_WORDS.has(w));
  return kept.length > 0 ? kept : all;
}

/**
 * Edit distance with adjacent swaps (optimal string alignment), counted in
 * code points so a Kannada letter is one step, not three bytes. Gives up and
 * returns `max + 1` once every path is over `max`, which is all a caller asks.
 */
export function distance(a: string, b: string, max: number): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (Math.abs(s.length - t.length) > max) return max + 1;

  let prev2: number[] = [];
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[t.length];
}

/**
 * How well one query word matches one word of an entry, 0 to 1.
 *
 * - **Exact** — 1.
 * - **Prefix** — 0.75, so the box has something to show while the word is
 *   still being typed. Two letters at least; one letter starts too much.
 * - **Typo** — 0.6, one edit from four letters and two from eight
 *   ("brocoli", "sunflwer"). Also against the start of a longer word, so a
 *   typo in a half-typed word ("brocol") still finds broccoli. **The first
 *   letter must agree**: a typo almost never lands there, and without it
 *   "rack" was one edit from "pack" and found the drainage mats.
 */
export function wordScore(q: string, w: string, fuzzy: boolean): number {
  if (w === q) return 1;
  const length = Array.from(q).length;
  if (length >= 2 && w.startsWith(q)) return 0.75;
  if (!fuzzy || length < 4 || q.codePointAt(0) !== w.codePointAt(0)) return 0;

  const max = length >= 8 ? 2 : 1;
  if (distance(q, w, max) <= max) return 0.6;
  const letters = Array.from(w);
  for (const cut of [length - 1, length, length + 1]) {
    if (cut < letters.length && distance(q, letters.slice(0, cut).join(""), 1) <= 1) return 0.5;
  }
  return 0;
}

/** An entry with its terms already split into words — done once per list,
 *  not once per keystroke. */
export type Prepared<T> = {
  entry: T;
  words: Record<keyof SearchTerms, string[]>;
  /** Each name as one normalised string, for the whole-query bonus. */
  phrases: string[];
};

export function prepare<T extends { terms: SearchTerms }>(entries: T[]): Prepared<T>[] {
  return entries.map((entry) => ({
    entry,
    words: {
      names: entry.terms.names.flatMap(tokens),
      kind: entry.terms.kind.flatMap(tokens),
      blurbs: entry.terms.blurbs.flatMap(tokens),
    },
    phrases: entry.terms.names.map((name) => tokens(name).join(" ")),
  }));
}

/**
 * One entry's score for a query, or 0 when it does not match.
 *
 * **Every query word has to match something** — "red cabbage" is the red
 * cabbage, not every red thing plus every cabbage. Each word scores its best
 * hit across the fields, weighted by field; the entry scores the sum, plus a
 * bonus when the whole query is the start of a name, so typing "red" puts
 * Red Amaranthus above a description that mentions red stems.
 */
export function score<T>(prepared: Prepared<T>, words: string[]): number {
  let total = 0;
  for (const q of words) {
    let best = 0;
    for (const { field, weight, fuzzy } of FIELDS) {
      for (const w of prepared.words[field]) {
        const s = wordScore(q, w, fuzzy) * weight;
        if (s > best) best = s;
      }
    }
    if (best === 0) return 0;
    total += best;
  }
  const phrase = words.join(" ");
  if (prepared.phrases.some((p) => p === phrase)) total += 3;
  else if (prepared.phrases.some((p) => p.startsWith(phrase))) total += 2;
  return total;
}

/**
 * The entries that match, best first.
 *
 * A tie is broken by kind, in `SEARCH_KINDS` order — so "radish" lists the
 * microgreen before the seed, because greens are the business — and then by
 * the name shown, in the visitor's alphabet.
 */
export function rank<T extends { kind: SearchKind; name: string }>(
  prepared: Prepared<T>[],
  query: string,
  locale: string,
): T[] {
  const words = queryTokens(query);
  if (words.length === 0) return [];
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return prepared
    .map((p) => ({ entry: p.entry, score: score(p, words) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        SEARCH_KINDS.indexOf(a.entry.kind) - SEARCH_KINDS.indexOf(b.entry.kind) ||
        collator.compare(a.entry.name, b.entry.name),
    )
    .map((hit) => hit.entry);
}

/** The longest query either surface will take. Nothing in the catalogue is
 *  named in more than a few words, and a cap keeps a pasted essay from being
 *  matched word by word against every entry. */
export const MAX_QUERY_LENGTH = 100;

/** A query as either surface receives it: trimmed and capped. */
export function cleanQuery(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}
