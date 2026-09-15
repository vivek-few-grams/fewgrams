"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import type { Variety } from "@/lib/types";
import { sanitiseKey } from "@/lib/content/content-key";
import { VarietyRow } from "./VarietyRow";

/**
 * The saved varieties, as an editable table with a filter.
 *
 * ## One grid template, shared
 *
 * The header and every row are separate grid containers that are handed the
 * same `grid-template-columns`, which is what makes the columns line up
 * without a `<table>`. It lives here rather than in each row so there is one
 * place to change a column width — see VarietyRow for why a real table is
 * not usable.
 *
 * ## Why the filter is client-side
 *
 * Every row is already in the page: the catalogue is dozens of varieties at
 * most, not thousands, so a round trip per keystroke would be slower and
 * would lose any unsaved edits in the other rows. If this ever grows past a
 * few hundred, move it to a query — not before.
 */
const COLUMNS =
  "minmax(11rem,1.6fr) repeat(4, minmax(4.5rem, 0.7fr)) 6rem 5.5rem 4rem";

export function VarietyTable({
  varieties,
}: {
  varieties: Array<{ variety: Variety; name: string | null }>;
}) {
  const t = useTranslations("admin.varieties");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return varieties;
    /* Matches the display name and the key, and normalises the query the same
       way a key is normalised — so typing "Red Amaranth" finds
       `red-amaranth` even though the key has no space in it. */
    const asKey = sanitiseKey(q);
    return varieties.filter(
      (v) =>
        v.variety.contentKey.includes(asKey) ||
        (v.name ?? "").toLowerCase().includes(q),
    );
  }, [varieties, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-forest">
          {t("savedCount", { count: varieties.length })}
        </h2>

        {/* Only worth the space once there is something to sift through. */}
        {varieties.length > 3 && (
          <div className="flex items-center gap-3">
            <label className="relative">
              <span className="sr-only">{t("search")}</span>
              <Search
                size={15}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-64 rounded-full border border-forest/25 bg-cream py-1.5 pl-9 pr-3 font-body text-sm outline-none placeholder:text-stone/60 focus:border-forest"
              />
            </label>
            {query && (
              <>
                <span className="font-body text-xs tabular-nums text-stone">
                  {t("searchCount", { shown: shown.length, total: varieties.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="flex items-center gap-1 font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
                >
                  <X size={12} strokeWidth={2} />
                  {t("clearSearch")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {varieties.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
          {t("emptyList")}
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
          {t("searchNone", { query: query.trim() })}
        </p>
      ) : (
        <div className="space-y-2">
          {/* Column headings, hidden below `lg` where each row becomes a
              stacked card and every input carries its own label instead. */}
          <div
            style={{ gridTemplateColumns: COLUMNS }}
            className="hidden gap-x-3 px-4 lg:grid"
          >
            {[
              t("colVariety"),
              t("colGrowDays"),
              t("colYield"),
              t("colPrice"),
              t("colSeed"),
              "",
              t("colActive"),
              "",
            ].map((heading, i) => (
              <span
                key={i}
                className="font-body text-[10px] uppercase tracking-wider text-stone"
              >
                {heading}
              </span>
            ))}
          </div>

          {shown.map(({ variety, name }) => (
            <VarietyRow
              key={variety.id}
              variety={variety}
              name={name}
              columns={COLUMNS}
            />
          ))}
        </div>
      )}
    </div>
  );
}
