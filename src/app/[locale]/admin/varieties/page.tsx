import { getTranslations } from "next-intl/server";
import { listVarieties } from "@/lib/repo/varieties";
import { attachContent, listVarietyContent } from "@/lib/content/varieties";
import { routing } from "@/i18n/routing";
import { AddVarietyForm } from "./AddVarietyForm";
import { VarietyTable } from "./VarietyTable";

export const dynamic = "force-dynamic";

/**
 * `/admin/varieties` — SPEC §4.3.
 *
 * This screen owns the **numbers only**: price, yield per tray, grow days,
 * seed rate, tier, active. Every word a customer reads lives in
 * `content/varieties/<key>.json`, so there is not one text input on the page.
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
  const t = await getTranslations("admin.varieties");

  const [rows, content] = await Promise.all([
    listVarieties(),
    listVarietyContent(routing.defaultLocale),
  ]);

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
            yieldGramsPerTray: v.yieldGramsPerTray,
            growDays: v.growDays,
            seedGramsPerTray: v.seedGramsPerTray,
            active: v.active,
          },
          name: v.content?.text.name ?? null,
        }))}
      />
    </div>
  );
}
