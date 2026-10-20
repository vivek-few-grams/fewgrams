import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/i18n/alternates";
import { routing } from "@/i18n/routing";
import { enabledProductTypes } from "@/lib/catalogue/visibility";
import { listByCategory } from "@/lib/repo/products";
import { searchCatalogue } from "@/lib/search/catalogue";
import type { ProductType } from "@/lib/types";

/**
 * `/sitemap.xml` — every page a search engine should know about, in both
 * languages, each naming its translation.
 *
 * **The products come from `searchCatalogue`**, which reads every kind exactly
 * as its grid does (SPEC §27): an unpriced microgreen, a seed with no content
 * file, a switched-off category or a rack range with no published model is
 * absent here for the same reason it is absent there. A sitemap that listed a
 * page the site then turns away would teach Google the site is broken.
 *
 * Left out on purpose: the cart, checkout, account, login, subscribe and
 * search pages (each is `noindex`, and `robots.ts` keeps crawlers out). The
 * plans are one page, `/plans`, not a page each.
 *
 * No `lastModified`, `changeFrequency` or `priority`: Google ignores the last
 * two, and a date we do not actually track would be worse than none.
 *
 * Read on every request, never at build: the catalogue is in DynamoDB, which
 * the build does not reach, and a crawler fetches this rarely.
 */
export const dynamic = "force-dynamic";

/** Pages that are always there. */
const PAGES = [
  "/",
  "/plans",
  "/shop",
  "/how-we-grow",
  "/faq",
  "/contact",
  "/garden",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/shipping-policy",
];

/** Each product type's listing page. A `Record`, so a new type has to say
 *  where its list lives. */
const LISTINGS: Record<ProductType, string> = {
  microgreens: "/microgreens",
  seeds: "/seeds",
  trays: "/shop/trays",
  media: "/shop/grow-media",
  racks: "/shop/racks",
  snacks: "/shop/snacks",
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [enabled, catalogue] = await Promise.all([
    enabledProductTypes(),
    searchCatalogue(routing.defaultLocale),
  ]);

  /* The snack grid has no product written yet; an empty grid is not worth
     a crawler's visit. Every other listing has its products below it. */
  const listings = await Promise.all(
    enabled.map(async (type) =>
      type === "snacks" && (await listByCategory("snacks", { activeOnly: true })).length === 0
        ? null
        : LISTINGS[type],
    ),
  );

  const products = catalogue.filter((entry) => entry.kind !== "plan").map((entry) => entry.href);

  const paths = [...PAGES, ...listings.filter((p): p is string => p !== null), ...products];

  return paths.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(l, path)])),
      "x-default": absoluteUrl(routing.defaultLocale, path),
    };
    return routing.locales.map((locale) => ({ url: absoluteUrl(locale, path), alternates: { languages } }));
  });
}
