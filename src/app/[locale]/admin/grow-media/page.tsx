import { getTranslations } from "next-intl/server";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { attachGrowMediumContent, listGrowMediumContent } from "@/lib/content/grow-media";
import { routing } from "@/i18n/routing";
import { AddGrowMediumForm } from "./AddGrowMediumForm";
import { GrowMediumTable } from "./GrowMediumTable";

export const dynamic = "force-dynamic";

/**
 * `/admin/grow-media` — SPEC §24.4. Cocopeat and whatever grow media follow.
 *
 * Built 24 Sep 2026 when the owner added IFFCO Urban Gardens' Horti-Coir to
 * the shop. The same screen as `/admin/trays` because the item is sold the
 * same way — a pack price, a supplier lead time and six packing figures, and
 * **not one text input**: every word lives in `content/grow-media/<key>.json`
 * (SPEC §4.3). Content is read in English whatever the admin's locale.
 */
export default async function GrowMediaAdmin() {
  const t = await getTranslations("admin.growMedia");

  const [rows, content] = await Promise.all([
    listGrowMedia(),
    listGrowMediumContent(routing.defaultLocale),
  ]);

  const withContent = await attachGrowMediumContent(rows, routing.defaultLocale);
  /* Content files not yet priced, offered as suggestions only. */
  const taken = new Set(rows.map((r) => r.contentKey));
  const suggestions = content.filter((c) => !taken.has(c.key)).map((c) => c.key);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introOps")}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("addTitle")}</h2>

        <AddGrowMediumForm suggestions={suggestions} />
        <p className="mt-4 font-body text-xs text-stone">{t("howTo")}</p>
      </section>

      <GrowMediumTable
        /* The whole stored row, not a subset — the save form posts every field
           it shows, and a field left off would be cleared on the next save. */
        media={withContent.map(({ content, ...medium }) => ({
          medium,
          name: content?.text.name ?? null,
        }))}
      />
    </div>
  );
}
