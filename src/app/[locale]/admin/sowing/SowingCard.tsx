"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { fromIstDateISO } from "@/lib/delivery-date";
import { daysBetween, gramsPerTray, isHarvested, yieldRatio } from "@/lib/sowing/sowing";
import type { Sowing } from "@/lib/types";
import { removeSowing } from "./actions";
import { SowingEditor } from "./SowingEditor";

/**
 * One sowing in the log, collapsed to its date until clicked: what went in,
 * what came out, and the yield. "Record harvest" swaps the table for the
 * editor in place, so the owner types the harvest against the row it belongs
 * to.
 */
export function SowingCard({
  sowing,
  names,
  varieties,
  today,
}: {
  sowing: Sowing;
  /** Content key → display name; a key with no content file falls back to itself. */
  names: Record<string, string>;
  varieties: { value: string; label: string }[];
  today: string;
}) {
  const t = useTranslations("admin.sowing");
  const tc = useTranslations("admin.common");
  const format = useFormatter();
  const [editing, setEditing] = useState(false);

  const harvested = sowing.lines.filter(isHarvested).length;
  const date = format.dateTime(fromIstDateISO(sowing.sowDate), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const seedTotal = sowing.lines.reduce((n, l) => n + l.seedGrams, 0);

  /* A deleted variety can still be on an old line, so it has to stay
     pickable while that line is edited. */
  const options = [
    ...varieties,
    ...sowing.lines
      .filter((l) => !varieties.some((v) => v.value === l.varietyKey))
      .map((l) => ({ value: l.varietyKey, label: l.varietyKey })),
  ];

  return (
    /* Collapsed to its date and one-line summary (the owner, 10 Oct 2026); a
       native <details> gives the toggle, Enter/Space and the expanded state
       to assistive tech for free. */
    <details className="group rounded-2xl border border-forest/15">
      <summary className="flex list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-forest/5 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest">{date}</h3>
          <p className="font-body text-xs text-stone">
            {t("cardSummary", {
              lines: sowing.lines.length,
              grams: seedTotal,
              harvested,
            })}
          </p>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-stone transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="px-5 pb-5">
        {!editing && (
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
            >
              {harvested < sowing.lines.length ? t("recordHarvest") : t("edit")}
            </button>
            <form action={removeSowing}>
              <input type="hidden" name="id" value={sowing.id} />
              <ConfirmSubmit
                label={tc("delete")}
                title={t("deleteTitle")}
                message={t("deleteConfirm", { date })}
                confirmLabel={tc("confirmDelete")}
                cancelLabel={tc("cancel")}
                className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
              />
            </form>
          </div>
        )}

        <div className="mt-4">
          {editing ? (
            <SowingEditor
              varieties={options}
              today={today}
              sowing={sowing}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] font-body text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-stone">
                    <th className="pb-2 pr-3 font-medium">{t("variety")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("seedGrams")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("trays")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("harvestGrams")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("colRatio")}</th>
                    <th className="pb-2 pr-3 text-right font-medium">{t("colPerTray")}</th>
                    <th className="pb-2 text-right font-medium">{t("colDays")}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-forest">
                  {sowing.lines.map((line, i) => {
                    const ratio = yieldRatio(line);
                    const perTray = gramsPerTray(line);
                    return (
                      <tr key={i} className="border-t border-forest/10">
                        <td className="py-2 pr-3 font-semibold">
                          {names[line.varietyKey] ?? line.varietyKey}
                        </td>
                        <td className="py-2 pr-3 text-right">{t("grams", { grams: line.seedGrams })}</td>
                        <td className="py-2 pr-3 text-right">{line.trays ?? t("none")}</td>
                        <td className="py-2 pr-3 text-right">
                          {isHarvested(line) ? (
                            t("grams", { grams: line.harvestGrams })
                          ) : (
                            <span className="text-stone">{t("growing")}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold">
                          {ratio === null ? t("none") : t("ratio", { ratio })}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {perTray === null ? t("none") : t("grams", { grams: perTray })}
                        </td>
                        <td className="py-2 text-right">
                          {isHarvested(line)
                            ? t("days", {
                                days: daysBetween(sowing.sowDate, line.harvestedOn),
                              })
                            : t("none")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
