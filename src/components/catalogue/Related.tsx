import { getTranslations } from "next-intl/server";
import { ResultCard } from "@/components/search/ResultCard";
import type { CatalogueEntry } from "@/lib/search/catalogue";
import { entryId } from "@/lib/search/entry";

/**
 * Products to go on to, under a detail page — SPEC §28.8. Drawn with search's
 * result card and priced as search prices them, from `searchCatalogue`, so
 * nothing the grids hide is suggested. Renders nothing when there is nothing
 * to suggest.
 */
export async function Related({ heading, entries }: { heading: string; entries: CatalogueEntry[] }) {
  if (entries.length === 0) return null;
  const t = await getTranslations("search.price");
  return (
    <section>
      <h2 className="font-display text-[clamp(1.3rem,2.4vw,1.8rem)] font-bold leading-tight tracking-tight text-forest">
        {heading}
      </h2>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {entries.map((entry) => (
          <li key={entryId(entry)}>
            <ResultCard
              entry={entry}
              price={entry.price !== null && entry.price > 0 ? t(entry.kind, { price: entry.price }) : null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
