import { brand } from "@/lib/brand";
import { routing } from "./routing";

/**
 * A page's address in one locale, without the host.
 *
 * `localePrefix: "as-needed"` means the default locale keeps the bare path:
 * `/microgreens/kale` and `/kn/microgreens/kale`, and the home pages `/` and
 * `/kn`.
 */
export function localePath(locale: string, path: string): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? clean || "/" : `/${locale}${clean}`;
}

/** The same, on the live site — what a crawler is told the page is called. */
export function absoluteUrl(locale: string, path: string): string {
  const p = localePath(locale, path);
  return p === "/" ? brand.url : `${brand.url}${p}`;
}

/**
 * The canonical address and `hreflang` alternates for one page — SPEC §4.4.
 *
 * Must be computed per page, not once in the layout: a layout has no access
 * to the current pathname, so a layout-level value would tell search engines
 * that every Kannada page is `/kn`, which is wrong for all but the home page.
 *
 * **Absolute, always.** Google ignores a relative `hreflang`, and every
 * Lighthouse run failed the check while these were `/kn/...`. The canonical is
 * the page's own locale — the Kannada page is the original of itself, not a
 * copy of the English one — and `x-default` is English, for a visitor in
 * neither language.
 */
export function localeAlternates(
  locale: string,
  path: string,
): { canonical: string; languages: Record<string, string> } {
  return {
    canonical: absoluteUrl(locale, path),
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(l, path)])),
      "x-default": absoluteUrl(routing.defaultLocale, path),
    },
  };
}
