import { getTranslations } from "next-intl/server";
import { getVarietyCosting, listVarieties } from "@/lib/repo/varieties";
import { listSeeds } from "@/lib/repo/seeds";
import { listSowings } from "@/lib/repo/sowings";
import { attachContent, listVarietyContent } from "@/lib/content/varieties";
import { routing } from "@/i18n/routing";
import { cocopeatPerTray, varietyCost } from "@/lib/varieties/pricing";
import type { Sowing } from "@/lib/types";
import { AddVarietyForm } from "./AddVarietyForm";
import { CostingForm } from "./CostingForm";
import { VarietyTable } from "./VarietyTable";
import type { VarietyWorking } from "./VarietyRow";
import { requireRole } from "@/lib/auth/guard";

/** Seed sown per tray in the sowing log, per variety — across every line that
 *  counted its trays — so a missing seed rate can be copied from what was
 *  actually done. One decimal, as a person would type it. */
function loggedSeedPerTray(sowings: Sowing[]): Map<string, number> {
  const sums = new Map<string, { grams: number; trays: number }>();
  for (const line of sowings.flatMap((s) => s.lines)) {
    if (!line.trays) continue;
    const sum = sums.get(line.varietyKey) ?? { grams: 0, trays: 0 };
    sum.grams += line.seedGrams;
    sum.trays += line.trays;
    sums.set(line.varietyKey, sum);
  }
  return new Map([...sums].map(([key, s]) => [key, Math.round((s.grams / s.trays) * 10) / 10]));
}

export const dynamic = "force-dynamic";

/**
 * `/admin/varieties` — SPEC §4.3.
 *
 * This screen owns the **numbers only**: yield per tray, grow days, seed
 * rate, active, and the costing every price is worked out from. Every word a
 * customer reads lives in `content/varieties/<key>.json`, so there is not one
 * text input on the page — and since 19 Oct 2026 not one price input either.
 *
 * A variety can be declared here **before** its content file exists (changed
 * 15 Sep 2026). Requiring the file first meant no variety could be added
 * without opening a code editor. What keeps a nameless variety off the site
 * is downstream instead: the row below is flagged in red with the exact path
 * to create, and every public page skips a variety it cannot name.
 *
 * Content is read in English regardless of the admin's locale: SPEC §4.4
 * scopes Kannada to customer-facing pages, and an operator comparing yields
 * wants one stable set of labels.
 */
export default async function VarietiesAdmin() {
  await requireRole("admin");
  const t = await getTranslations("admin.varieties");

  const [rows, content, costing, seeds, sowings] = await Promise.all([
    listVarieties(),
    listVarietyContent(routing.defaultLocale),
    getVarietyCosting(),
    listSeeds(),
    listSowings(),
  ]);
  const seedCost = new Map(seeds.map((s) => [s.contentKey, s.costPer100g]));
  const logged = loggedSeedPerTray(sowings);
  const workingOf = (v: (typeof rows)[number]): VarietyWorking => {
    const r = varietyCost(v, seedCost.get(v.contentKey), costing);
    if (r.ok) return { ok: true, yieldMin: v.yieldGramsPerTrayMin, ...r.cost };
    const logSeed = logged.get(v.contentKey);
    return { ok: false, reason: r.reason, ...(logSeed !== undefined ? { logSeed } : {}) };
  };

  const withContent = await attachContent(rows, routing.defaultLocale);
  /* Suggestions only — content files that exist but are not yet priced. The
     field accepts anything well-formed, so this is a convenience for the
     second variety in a family, not a constraint. */
  const taken = new Set(rows.map((r) => r.contentKey));
  const suggestions = content.filter((c) => !taken.has(c.key)).map((c) => c.key);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        {/* Both paragraphs run the full content width, stacked. No `max-w-*`
            on purpose: this is an internal screen, and the owner asked for
            the width rather than a narrow reading measure. */}
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introOps")}</p>
        </div>
      </section>

      {/* One costing for every variety (19 Oct 2026) — the seeds screen's
          margin section, with the tray costs beside the markup. */}
      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("costingTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("costingHint")}</p>
        <CostingForm costing={costing} cocopeatPerTray={cocopeatPerTray(costing)} />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("addTitle")}</h2>

        <AddVarietyForm suggestions={suggestions} />
        <p className="mt-4 font-body text-xs text-stone">{t("howTo")}</p>
      </section>

      <VarietyTable
        varieties={withContent.map((v) => ({
          variety: {
            id: v.id,
            contentKey: v.contentKey,
            pricePer100g: v.pricePer100g,
            costPer100g: v.costPer100g,
            yieldGramsPerTrayMin: v.yieldGramsPerTrayMin,
            yieldGramsPerTrayMax: v.yieldGramsPerTrayMax,
            growDays: v.growDays,
            seedGramsPerTray: v.seedGramsPerTray,
            active: v.active,
          },
          name: v.content?.text.name ?? null,
          working: workingOf(v),
        }))}
      />
    </div>
  );
}
