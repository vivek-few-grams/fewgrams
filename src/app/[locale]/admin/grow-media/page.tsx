import { getTranslations } from "next-intl/server";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { attachGrowMediumContent } from "@/lib/content/grow-media";
import { routing } from "@/i18n/routing";
import { pickerData } from "../vendors/load";
import { GrowMediumTable } from "./GrowMediumTable";
import { requireRole } from "@/lib/auth/guard";
import { billsPerItem } from "@/lib/purchases/cost";
import { listBills } from "@/lib/repo/purchases";

export const dynamic = "force-dynamic";

/**
 * `/admin/grow-media` — SPEC §24.4. Cocopeat and whatever grow media follow.
 *
 * Built 24 Sep 2026 when the owner added IFFCO Urban Gardens' Horti-Coir to
 * the shop. The same screen as `/admin/trays` because the item is sold the
 * same way — a pack price, a supplier lead time and six packing figures, and
 * **not one text input**: every word lives in `content/grow-media/<key>.json`
 * (SPEC §4.3). Content is read in English whatever the admin's locale.
 *
 * Since 18 Oct 2026 a block is added and costed from a purchase bill, as a
 * tray is — see `/admin/trays`.
 */
export default async function GrowMediaAdmin() {
  await requireRole("admin");
  const t = await getTranslations("admin.growMedia");

  const [rows, picker, bills] = await Promise.all([listGrowMedia(), pickerData(), listBills()]);
  const onBills = billsPerItem(bills);
  const withContent = await attachGrowMediumContent(rows, routing.defaultLocale);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introOps")}</p>
        </div>
      </section>

      <GrowMediumTable
        /* The whole stored row, not a subset — the save form posts every field
           it shows, and a field left off would be cleared on the next save. */
        media={withContent.map(({ content, ...medium }) => ({
          medium,
          name: content?.text.name ?? null,
          bills: onBills.get(`media:${medium.contentKey}`) ?? 0,
          picker: {
            supplyKey: `media:${medium.contentKey}`,
            vendors: picker.vendorsFor(`media:${medium.contentKey}`),
            selected: picker.selectedFor(`media:${medium.contentKey}`),
          },
        }))}
      />
    </div>
  );
}
