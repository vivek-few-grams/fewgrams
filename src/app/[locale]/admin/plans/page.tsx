import { getTranslations } from "next-intl/server";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { listVarieties } from "@/lib/repo/varieties";
import { varietyNameMap } from "@/lib/content/varieties";
import { listPlanContent } from "@/lib/content/plans";
import { routing } from "@/i18n/routing";
import { PlanRow } from "./PlanRow";
import type { VarietyChoice } from "./rotation";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * `/admin/plans` — SPEC §5.1 / §5.1.1 / §18.9.1.
 *
 * Rebuilt 15 Sep 2026, twice. What this screen is now:
 *
 * 1. **A row per content file, not an add form.** There are three plans and
 *    there will only ever be three (SPEC §5.1), and which three exist is
 *    decided by `content/plans/`. So nothing is created here — the row is
 *    always present and saving it fills in the numbers. The old form asked the
 *    operator to type a key, which could be mistyped, duplicated, or point at
 *    no file at all.
 * 2. **The numbers only.** Six text inputs for name and blurb in two
 *    languages, plus a highlights textarea, all moved to the content file.
 *    There is not one prose field left.
 * 3. **The rotation is a searchable multi-select per week**, not typed keys
 *    and not a wall of checkboxes — see VarietyMultiSelect.tsx.
 * 4. **No card-colour select.** It is derived from the card's position by
 *    `planPanels()`, which gives the recommended plan the dark ground and
 *    hands the other two out in card order.
 *
 * Content is read in English regardless of the admin's locale: SPEC §4.4
 * scopes Kannada to customer-facing pages, and an operator comparing plans
 * wants one stable set of labels.
 */
export default async function PlansAdmin() {
  const t = await getTranslations("admin.plans");

  const [entries, varieties, planContent, varietyNames] = await Promise.all([
    listPlansWithWeeks(),
    listVarieties(),
    listPlanContent(routing.defaultLocale),
    varietyNameMap(routing.defaultLocale),
  ]);

  /* Every variety, not just the active ones: a plan can legitimately include a
     green you have temporarily hidden, and dropping it from the list would
     silently clear it on the next save. Ordered by grow days because that is
     what the week assignment turns on (SPEC §5.2). */
  const choices: VarietyChoice[] = varieties
    .map((v) => ({
      key: v.contentKey,
      name: varietyNames[v.contentKey] ?? v.contentKey,
      growDays: v.growDays,
    }))
    .sort((a, b) => a.growDays - b.growDays || a.name.localeCompare(b.name));

  const stored = new Map(entries.map((e) => [e.plan.contentKey, e]));
  const weeksOf = (plan: Plan | null) =>
    Object.fromEntries(
      (plan ? (stored.get(plan.contentKey)?.weeks ?? []) : []).map((w) => [
        w.week,
        w.varietyKeys,
      ]),
    );

  /* The content folder is the list of plans. Rows are ordered by the stored
     `sortOrder` where there is one, so the screen matches the card order on
     the home page, with never-saved plans last. */
  const rows = planContent
    .map((content) => {
      const plan = stored.get(content.key)?.plan ?? null;
      return { contentKey: content.key, name: content.text.name, plan };
    })
    .sort((a, b) => (a.plan?.sortOrder ?? 99) - (b.plan?.sortOrder ?? 99));

  /* A stored plan whose content file has been deleted. Nothing about it can be
     shown to a customer, so it is surfaced here — loudly, and as the only
     deletable row on the screen — rather than quietly ignored. */
  const orphans = entries
    .filter((e) => !planContent.some((c) => c.key === e.plan.contentKey))
    .map((e) => ({ contentKey: e.plan.contentKey, name: null, plan: e.plan }));

  const configured = rows.filter((r) => r.plan !== null).length;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introRotation")}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-forest">
          {t("configuredCount", { configured, total: rows.length })}
        </h2>

        {[...rows, ...orphans].map((row) => (
          <PlanRow
            key={row.contentKey}
            contentKey={row.contentKey}
            name={row.name}
            plan={row.plan}
            weeks={weeksOf(row.plan)}
            choices={choices}
          />
        ))}
      </section>
    </div>
  );
}
