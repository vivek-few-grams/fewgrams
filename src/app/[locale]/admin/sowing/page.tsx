import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { attachContent } from "@/lib/content/varieties";
import { istDateISO } from "@/lib/delivery-date";
import { listSowings } from "@/lib/repo/sowings";
import { listVarieties } from "@/lib/repo/varieties";
import { yieldByVariety } from "@/lib/sowing/sowing";
import { SowingCard } from "./SowingCard";
import { SowingEditor } from "./SowingEditor";

export const dynamic = "force-dynamic";

/**
 * `/admin/sowing` — the sowing log (the owner, 10 Oct 2026):
 *
 * > *"I would like to enter a date … add each category of the seed that I
 * > sowed, how much gram, and later when I harvest … record the gram and
 * > yield … so I can group multiple seeds sowing in a date."*
 *
 * One card per sowing day, a row per variety on it, and the harvest typed
 * against that row later. Above the log, the totals per variety — the figure
 * the owner wanted out of it, and the evidence for retuning yield and seed
 * rate on `/admin/varieties`.
 *
 * What is sown is picked from the varieties on file, never typed, so two
 * spellings of one crop cannot split its totals. Names come from the content
 * files in English, like every admin screen (SPEC §4.4).
 */
export default async function SowingAdmin() {
  const t = await getTranslations("admin.sowing");
  const [sowings, rows] = await Promise.all([listSowings(), listVarieties()]);
  const withContent = await attachContent(rows, routing.defaultLocale);
  const today = istDateISO(new Date());

  const names: Record<string, string> = Object.fromEntries(
    withContent.map((v) => [v.contentKey, v.content?.text.name ?? v.contentKey]),
  );
  const varieties = withContent
    .map((v) => ({ value: v.contentKey, label: names[v.contentKey] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const set = new Map(rows.map((v) => [v.contentKey, v]));
  const summary = yieldByVariety(sowings).sort((a, b) =>
    (names[a.varietyKey] ?? a.varietyKey).localeCompare(names[b.varietyKey] ?? b.varietyKey),
  );

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <p className="mt-2 font-body text-sm text-stone">{t("intro")}</p>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("newTitle")}</h2>
        <p className="mt-1 mb-5 font-body text-sm text-stone">{t("newHint")}</p>
        {varieties.length > 0 ? (
          <SowingEditor varieties={varieties} today={today} />
        ) : (
          <p className="font-body text-sm text-terracotta">{t("noVarieties")}</p>
        )}
      </section>

      {/* Hidden until something is cut: before that every column but seed
          sown is a dash. */}
      {summary.some((v) => v.harvested > 0) && (
        <section>
          <h2 className="font-display text-lg font-semibold text-forest">{t("summaryTitle")}</h2>
          <p className="mt-1 font-body text-sm text-stone">{t("summaryHint")}</p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-forest/15">
            <table className="w-full min-w-[44rem] font-body text-sm">
              <thead className="bg-forest/5">
                <tr className="text-left text-[11px] uppercase tracking-wider text-stone">
                  <th className="px-4 py-2.5 font-medium">{t("variety")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colSown")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colSeedTotal")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colHarvestTotal")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colRatio")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colPerTray")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colMeanDays")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-forest">
                {summary.map((v) => {
                  const variety = set.get(v.varietyKey);
                  return (
                    <tr key={v.varietyKey} className="border-t border-forest/10 align-top">
                      <td className="px-4 py-2.5 font-semibold">{names[v.varietyKey] ?? v.varietyKey}</td>
                      <td className="px-4 py-2.5 text-right">
                        {t("sownCount", { harvested: v.harvested, sown: v.sown })}
                      </td>
                      <td className="px-4 py-2.5 text-right">{t("grams", { grams: v.seedGrams })}</td>
                      <td className="px-4 py-2.5 text-right">
                        {v.harvested ? t("grams", { grams: v.harvestGrams }) : t("none")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {v.ratio === null ? t("none") : t("ratio", { ratio: v.ratio })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {v.perTray === null ? t("none") : t("grams", { grams: v.perTray })}
                        {variety && (
                          <span className="block text-[11px] text-stone">
                            {t("setRange", {
                              min: variety.yieldGramsPerTrayMin,
                              max: variety.yieldGramsPerTrayMax,
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {v.meanDays === null ? t("none") : t("days", { days: v.meanDays })}
                        {variety && (
                          <span className="block text-[11px] text-stone">
                            {t("setDays", { days: variety.growDays })}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-forest">{t("logTitle")}</h2>
        {sowings.length === 0 ? (
          <p className="font-body text-sm text-stone">{t("empty")}</p>
        ) : (
          sowings.map((s) => (
            <SowingCard key={s.id} sowing={s} names={names} varieties={varieties} today={today} />
          ))
        )}
      </section>
    </div>
  );
}
