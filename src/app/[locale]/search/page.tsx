import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import { SearchThumb } from "@/components/search/SearchThumb";
import { LinkPending } from "@/components/ui/LinkPending";
import { isProductTypeEnabled } from "@/lib/catalogue/visibility";
import { searchCatalogue, type CatalogueEntry } from "@/lib/search/catalogue";
import { entryId } from "@/lib/search/entry";
import { cleanQuery, MAX_QUERY_LENGTH, prepare, rank, type SearchKind } from "@/lib/search/match";

/**
 * `/search?q=` — SPEC §27.1. Every match, grouped by kind.
 *
 * **Rendered on the server from a plain GET form**, so it works with no
 * JavaScript at all — the header's magnifier is a link here until it hydrates
 * — and a results page can be bookmarked or shared. It ranks with the same
 * `rank` as the header box, so "See all results" continues the list the box
 * started rather than reshuffling it.
 *
 * **Prices are printed here and not in the box**, because this page reads
 * them fresh: the box's list is cached for minutes (`/api/search/[locale]`).
 *
 * `noindex`: a results page is a view of the catalogue, not content, and every
 * page it lists is already indexed in its own right.
 *
 * Dynamic because the query, and which items are on sale, change per request.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  const query = cleanQuery((await searchParams).q);
  const t = await getTranslations({ locale, namespace: "search.page" });
  return {
    title: query ? t("titleWithQuery", { query }) : t("title"),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = cleanQuery((await searchParams).q);
  const t = await getTranslations("search");

  const hits = query ? rank(prepare(await searchCatalogue(locale)), query, locale) : [];

  /* One group per kind, the groups in the order of their best hit — so
     "trays" opens on the trays, not on a microgreen whose description
     mentions one. Within a group the rank order stands. */
  const groups: Array<{ kind: SearchKind; entries: CatalogueEntry[] }> = [];
  for (const hit of hits) {
    const group = groups.find((g) => g.kind === hit.kind);
    if (group) group.entries.push(hit);
    else groups.push({ kind: hit.kind, entries: [hit] });
  }

  const showMicrogreens = hits.length === 0 && query ? await isProductTypeEnabled("microgreens") : false;
  const browse = "text-forest underline underline-offset-4 transition-colors hover:text-stone";

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-6 md:px-12 md:pb-24 md:pt-8">
      <h1 className="font-display text-[clamp(1.25rem,2.5vw,1.9rem)] font-bold leading-tight tracking-tight text-forest">
        {t("page.heading")}
      </h1>

      <form
        role="search"
        action={getPathname({ href: "/search", locale })}
        className="mt-6 flex max-w-2xl items-center gap-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-forest/20 bg-white px-4 transition-colors focus-within:border-forest">
          <Search size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-stone" />
          <input
            type="search"
            name="q"
            aria-label={t("page.label")}
            placeholder={t("page.placeholder")}
            defaultValue={query}
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-11 min-w-0 flex-1 bg-transparent font-body text-sm text-forest outline-none placeholder:text-stone/70 focus-visible:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-11 shrink-0 rounded-full bg-forest px-6 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          {t("page.submit")}
        </button>
      </form>

      {!query ? (
        <p className="mt-8 max-w-xl font-body text-sm text-stone">{t("page.prompt")}</p>
      ) : hits.length === 0 ? (
        /* Customer copy only: nothing here is an operator's problem to fix,
           so there is no admin variant (SPEC §8.2). */
        <div className="mt-10 max-w-xl rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          <p className="font-semibold text-forest">{t("page.none", { query })}</p>
          <p className="mt-2">{t("page.noneHelp")}</p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {showMicrogreens && (
              <Link href="/microgreens" className={browse}>
                {t("page.browseMicrogreens")}
              </Link>
            )}
            <Link href="/shop" className={browse}>
              {t("page.browseShop")}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="mt-8 font-body text-sm text-stone">
            {t("page.count", { count: hits.length, query })}
          </p>
          {groups.map((group) => (
            <section key={group.kind} aria-labelledby={`results-${group.kind}`} className="mt-10">
              <h2 id={`results-${group.kind}`} className="font-display text-base font-semibold text-forest">
                {t(`kinds.${group.kind}`)}
              </h2>
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {group.entries.map((entry) => (
                  <li key={entryId(entry)}>
                    {/* A grid, so the price can sit under the name on a phone
                        and in its own column from `sm`. Beside the name at
                        375px it took a third of the row and wrapped a Kannada
                        tray name onto four lines. */}
                    <Link
                      href={entry.href}
                      className="group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-2xl border border-forest/10 bg-white p-3 transition-colors hover:border-forest/30 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                    >
                      <span className="row-span-2 sm:row-span-1">
                        <SearchThumb kind={entry.kind} image={entry.image} size={72} />
                      </span>
                      <span className="col-start-2 row-start-1 self-end sm:self-center">
                        <span className="block font-display text-sm font-semibold text-forest underline-offset-4 group-hover:underline">
                          {entry.name}
                        </span>
                        {entry.blurb && (
                          <span className="mt-1 line-clamp-2 font-body text-xs leading-relaxed text-stone">
                            {entry.blurb}
                          </span>
                        )}
                      </span>
                      {/* Pick Your Own has no monthly price, and an item the
                          costing has not reached holds 0 — print neither. */}
                      {entry.price !== null && entry.price > 0 && (
                        <span className="col-start-2 self-start font-display text-sm font-bold tabular-nums text-forest sm:col-start-3 sm:row-start-1 sm:self-center">
                          {t(`price.${entry.kind}`, { price: entry.price })}
                        </span>
                      )}
                      <LinkPending spinner={28} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
