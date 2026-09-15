import { routing } from "./routing";

/**
 * `hreflang` alternates for one page — SPEC §4.4 ("hreflang tags on public
 * pages").
 *
 * Must be computed per page, not once in the layout: a layout has no access
 * to the current pathname, so a layout-level value would tell search engines
 * that every Kannada page is `/kn`, which is wrong for all but the home page.
 *
 * `localePrefix: "as-needed"` means the default locale keeps the bare path.
 */
export function localeAlternates(path: string) {
  const clean = path === "/" ? "" : path;
  return {
    languages: Object.fromEntries(
      routing.locales.map((locale) => [
        locale,
        locale === routing.defaultLocale ? clean || "/" : `/${locale}${clean}`,
      ]),
    ),
  };
}
