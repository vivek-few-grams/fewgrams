import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { ordersPerProductSold, seedGramsSold } from "@/lib/repo/orders";
import { searchCatalogue } from "@/lib/search/catalogue";
import type { SearchEntry, SearchList } from "@/lib/search/entry";
import { pickExamples, pickPopular, pickTopSeeds } from "@/lib/search/popular";

/**
 * The header box's list, in one locale — SPEC §27.2.
 *
 * Fetched once, the first time a visitor opens the box, and matched in the
 * browser on every keystroke — so typing costs no Lambda call at all. The
 * whole catalogue is about fifty entries and a few kilobytes gzipped. It also
 * carries what the box shows before anything is typed: the most-ordered row,
 * the best-selling seeds and the names the placeholder types out.
 *
 * **The locale is in the path, not the query string**, so it is part of the
 * cache key whatever CloudFront's cache policy does with query strings: a
 * cached English list must never be served to a Kannada page.
 *
 * **One minute**, in the browser and at the edge, and the box refetches a
 * list that old (`LIST_MAX_AGE_MS`). The words change only on a deploy; what
 * moves is which items are on sale and which categories are switched on, and
 * a category switched off in admin must not show up (the owner, 20 Oct
 * 2026) — so a minute is the most it can linger, and its page turns the
 * visitor away meanwhile. It was five minutes until that day. No price is in
 * the list (see `SearchEntry`), so nothing here can quote a stale one.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/search/[locale]">) {
  const { locale } = await ctx.params;
  if (!hasLocale(routing.locales, locale)) return new Response(null, { status: 404 });

  /* Both tallies come from one cached walk of the sold orders. */
  const [catalogue, sold, seedGrams] = await Promise.all([
    searchCatalogue(locale),
    ordersPerProductSold(),
    seedGramsSold(),
  ]);
  const entries: SearchEntry[] = catalogue.map(({ kind, key, href, name, image, terms }) => ({
    kind,
    key,
    href,
    name,
    image,
    terms,
  }));
  const { ids, ranked } = pickPopular(entries, sold);
  const seeds = pickTopSeeds(entries, seedGrams, locale);
  const list: SearchList = {
    entries,
    popular: ids,
    ranked,
    examples: pickExamples(entries),
    seeds: seeds.ids,
    seedsRanked: seeds.ranked,
  };
  return Response.json(list, { headers: { "cache-control": "public, max-age=60" } });
}
