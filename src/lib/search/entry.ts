import type { Placeholder } from "@/lib/images/placeholder-props";
import type { SearchKind, SearchTerms } from "./match";

/**
 * One thing search can find, as the header box receives it — SPEC §27.
 *
 * Its own module, apart from `catalogue.ts`, so a client component can take
 * the type without importing every repository the catalogue reads.
 *
 * **No price.** The box's list is cached for a few minutes in the browser and
 * at CloudFront, and a price is tuned in admin; a stale one in the drop-down
 * would disagree with the page it links to. The results page prints prices,
 * read fresh, from `CatalogueEntry`.
 */
export type SearchEntry = {
  kind: SearchKind;
  /** A content key, a rack range or a plan key — unique only together with
   *  `kind`, because "radish" is both a microgreen and a seed. */
  key: string;
  /** Without the locale; `Link` from `@/i18n/navigation` adds it. */
  href: string;
  /** In the visitor's language. */
  name: string;
  image: SearchImage | null;
  terms: SearchTerms;
};

/**
 * The thumbnail. `contain` for a transparent cut-out, `cover` for a photo
 * with its own background — the same split the card grids make.
 *
 * No `alt`: the name is printed beside it, so the picture is decorative and
 * reading it out would say the name twice.
 */
export type SearchImage = {
  src: string;
  fit: "contain" | "cover";
  placeholder?: Placeholder;
};

/**
 * What `/api/search/<locale>` returns: the entries, and what the box shows
 * before anything is typed (`popular.ts`).
 */
export type SearchList = {
  entries: SearchEntry[];
  /** `entryId`s for the tile row, best first. */
  popular: string[];
  /** True when the row is ranked by real orders — titled "Most ordered" —
   *  and false while nothing has sold, when it is "Good places to start". */
  ranked: boolean;
  /** Names the placeholder types out, one after another. */
  examples: string[];
  /** `entryId`s for the seed row, best-selling first (`pickTopSeeds`). */
  seeds: string[];
  /** As `ranked`, for the seed row: "Our best-selling seeds" or "Seeds to
   *  start with". */
  seedsRanked: boolean;
};

/** A stable id for one entry, for React keys and option ids. */
export function entryId(entry: Pick<SearchEntry, "kind" | "key">): string {
  return `${entry.kind}-${entry.key}`;
}
