import { defineRouting } from "next-intl/routing";

/**
 * Locale routing — SPEC §4.4.
 *
 * `localePrefix: "as-needed"` keeps English on bare paths (`/shop/trays`) and
 * prefixes only Kannada (`/kn/shop/trays`). English is the default locale and
 * the overwhelming majority of traffic, so it gets the clean URLs; Kannada
 * still gets its own addressable pages, which is what `hreflang` and search
 * indexing need.
 */
export const routing = defineRouting({
  locales: ["en", "kn"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** Endonyms — a language picker shows each language in its own script, never
 *  translated into the current one. */
export const LOCALE_LABELS: Record<Locale, { short: string; full: string }> = {
  en: { short: "EN", full: "English" },
  kn: { short: "ಕನ್ನಡ", full: "ಕನ್ನಡ" },
};
