import { Link } from "@/i18n/navigation";
import { LinkPending } from "@/components/ui/LinkPending";
import type { CatalogueEntry } from "@/lib/search/catalogue";
import { SearchThumb } from "./SearchThumb";

/**
 * One product as a row: picture, name, line and price — `/search`'s result
 * card, and the related products under a detail page (`Related`), so a
 * product reads the same wherever it is suggested.
 *
 * `price` arrives formatted (`search.price.<kind>`), or null to print none:
 * Pick Your Own has no monthly price, and an item the costing has not reached
 * holds 0.
 */
export function ResultCard({ entry, price }: { entry: CatalogueEntry; price: string | null }) {
  return (
    /* A grid, so the price can sit under the name on a phone and in its own
       column from `sm`. Beside the name at 375px it took a third of the row
       and wrapped a Kannada tray name onto four lines. */
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
      {price && (
        <span className="col-start-2 self-start font-display text-sm font-bold tabular-nums text-forest sm:col-start-3 sm:row-start-1 sm:self-center">
          {price}
        </span>
      )}
      <LinkPending spinner={28} />
    </Link>
  );
}
