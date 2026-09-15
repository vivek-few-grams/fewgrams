import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "./request";
import { routing } from "./routing";

/**
 * Kannada parity guard — SPEC §4.4.
 *
 * DECISION (15 Sep 2026): **every customer-facing English string has a Kannada
 * translation.** The fallback in `src/i18n/request.ts` means a missing key
 * renders English rather than breaking, which is the right runtime behaviour —
 * but it also means a gap is invisible. Silent English on a Kannada page is
 * exactly the failure this test exists to surface.
 *
 * `admin` is the single exception, by design: it is operator-facing, the
 * operator reads English, and translating it would be permanent maintenance
 * for no customer benefit. Recorded in SPEC §4.4 rather than left implicit.
 */
const DIR = path.join(process.cwd(), "messages");
const EXEMPT = new Set(["admin"]);

/** Flattens to dotted paths so a nested miss is reported where it lives. */
function leafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

const read = async (locale: string, ns: string) =>
  JSON.parse(await readFile(path.join(DIR, locale, `${ns}.json`), "utf8"));

describe("Kannada message parity", () => {
  const translated = NAMESPACES.filter((ns) => !EXEMPT.has(ns));

  it("has a kn file for every customer-facing namespace", async () => {
    const files = await readdir(path.join(DIR, "kn"));
    const present = files.map((f) => f.replace(/\.json$/, ""));
    expect(translated.filter((ns) => !present.includes(ns))).toEqual([]);
  });

  it.each(translated)("kn/%s.json covers every English key", async (ns) => {
    const [en, kn] = await Promise.all([read("en", ns), read("kn", ns)]);
    const missing = leafKeys(en).filter((k) => !leafKeys(kn).includes(k));
    expect(missing, `\nmissing in kn/${ns}.json:\n  ${missing.join("\n  ")}\n`).toEqual([]);
  });

  it.each(translated)("kn/%s.json adds no key English lacks", async (ns) => {
    // A key only in Kannada is dead weight: nothing reads it, because every
    // call site is written against the English catalogue.
    const [en, kn] = await Promise.all([read("en", ns), read("kn", ns)]);
    const orphans = leafKeys(kn).filter((k) => !leafKeys(en).includes(k));
    expect(orphans, `\norphans in kn/${ns}.json:\n  ${orphans.join("\n  ")}\n`).toEqual([]);
  });

  it("leaves nothing untranslated — no kn value identical to its English", async () => {
    /* A copy-pasted English value passes a key-presence check while being no
       translation at all.
       Judged by shape rather than by an allow-list of keys: strip the ICU
       placeholders, and if no letter in any script remains there is nothing
       to translate. That correctly passes "© {year} {brand}", "₹{price}" and
       "—" without naming them, so the rule still holds for the next one. */
    const hasTranslatableWords = (v: string) =>
      /\p{L}/u.test(v.replace(/\{[^}]*\}/gu, ""));
    const offenders: string[] = [];
    for (const ns of translated) {
      const [en, kn] = await Promise.all([read("en", ns), read("kn", ns)]);
      const flat = (o: unknown, p = "", out: Record<string, string> = {}) => {
        if (typeof o === "string") { out[p] = o; return out; }
        if (typeof o === "object" && o !== null) {
          for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out);
        }
        return out;
      };
      const enFlat = flat(en), knFlat = flat(kn);
      for (const [k, v] of Object.entries(enFlat)) {
        const t = knFlat[k];
        if (t === undefined || t !== v) continue;
        if (!hasTranslatableWords(v)) continue;               // "₹{price}", "—"
        if (/^[A-Za-z]+$/.test(v) && v.length <= 8) continue; // "Google", "FAQ"
        if (v.includes("@")) continue;                        // email samples
        offenders.push(`${ns}.${k} = ${JSON.stringify(v)}`);
      }
    }
    expect(offenders, `\nuntranslated:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("covers both declared locales and nothing else", () => {
    expect([...routing.locales]).toEqual(["en", "kn"]);
  });
});
