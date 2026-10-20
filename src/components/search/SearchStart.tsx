"use client";

import type { CSSProperties } from "react";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { entryId, type SearchEntry } from "@/lib/search/entry";
import { POPULAR_COUNT } from "@/lib/search/popular";
import type { Taste } from "@/lib/search/tastes";
import { SearchThumb } from "./SearchThumb";

/**
 * The search box before anything is typed — SPEC §27.2. "Never an empty
 * box" (the owner, 20 Oct 2026): taste chips that type themselves into the
 * field, a row of the most-ordered products, and under it the best-selling
 * seeds ("top 6 seeds under Most ordered", the same day).
 *
 * All of it sprouts in (`.search-sprout`), one stagger running through the
 * chips and both rows so they read as one arrival.
 */

const LABEL = "font-body text-[11px] uppercase tracking-widest text-stone";
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

export function SearchStart({
  tastes,
  popular,
  ranked,
  seeds,
  seedsRanked,
  onTaste,
  onPick,
}: {
  /** The chips that find something on sale now — none hides the group. */
  tastes: readonly Taste[];
  /** "loading" until the list lands; an empty array hides the row. */
  popular: SearchEntry[] | "loading";
  ranked: boolean;
  /** As `popular`. Empty when seeds are switched off, which hides the row. */
  seeds: SearchEntry[] | "loading";
  seedsRanked: boolean;
  /** A chip was pressed: its label is the query. */
  onTaste: (query: string) => void;
  /** A tile was followed. */
  onPick: () => void;
}) {
  const t = useTranslations("search");
  const id = useId();
  const popularCount = popular === "loading" ? POPULAR_COUNT : popular.length;

  return (
    <div className="mt-4 space-y-5 px-2">
      {tastes.length > 0 && (
        <div role="group" aria-labelledby={`${id}-tastes`}>
          <p id={`${id}-tastes`} className={LABEL}>
            {t("box.tastesTitle")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tastes.map((taste, i) => (
              <button
                key={taste}
                type="button"
                onClick={() => onTaste(t(`tastes.${taste}`))}
                style={stagger(i)}
                className="search-sprout rounded-full border border-forest/20 px-3.5 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:border-forest hover:bg-sand"
              >
                {t(`tastes.${taste}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <TileRow
        id={`${id}-popular`}
        title={ranked ? t("box.popularTitle") : t("box.picksTitle")}
        entries={popular}
        offset={tastes.length}
        onPick={onPick}
      />
      <TileRow
        id={`${id}-seeds`}
        title={seedsRanked ? t("box.seedsRankedTitle") : t("box.seedsTitle")}
        entries={seeds}
        offset={tastes.length + popularCount}
        onPick={onPick}
      />
    </div>
  );
}

/** One titled row of product tiles; `offset` continues the stagger from
 *  whatever sprouted before it. */
function TileRow({
  id,
  title,
  entries,
  offset,
  onPick,
}: {
  id: string;
  title: string;
  entries: SearchEntry[] | "loading";
  offset: number;
  onPick: () => void;
}) {
  if (entries !== "loading" && entries.length === 0) return null;
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className={LABEL}>
        {title}
      </p>
      <ul className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
        {entries === "loading"
          ? Array.from({ length: POPULAR_COUNT }, (_, i) => (
              <li key={i} aria-hidden="true" className="flex flex-col items-center gap-2 p-2">
                <span className="size-16 animate-pulse rounded-xl bg-sand motion-reduce:animate-none" />
                <span className="h-3 w-14 animate-pulse rounded bg-sand motion-reduce:animate-none" />
              </li>
            ))
          : entries.map((entry, i) => (
              <li key={entryId(entry)} style={stagger(offset + i)} className="search-sprout">
                <Link
                  href={entry.href}
                  onClick={onPick}
                  className="flex flex-col items-center gap-2 rounded-xl p-2 text-center transition-colors hover:bg-sand"
                >
                  <span className="search-shoot block">
                    <SearchThumb kind={entry.kind} image={entry.image} size={64} />
                  </span>
                  {/* Three lines, not two: at two, "Horti-Coir cocopeat —
                      1 kg block" and its 5 kg brother were both cut to
                      "Horti-Coir cocopeat —…" and could not be told apart. */}
                  <span className="line-clamp-3 font-body text-xs font-semibold text-forest">
                    {entry.name}
                  </span>
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}
