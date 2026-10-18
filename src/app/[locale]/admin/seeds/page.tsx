import { getTranslations } from "next-intl/server";
import { getSeedMargin, listSeeds } from "@/lib/repo/seeds";
import { MarginForm } from "../racks/MarginForm";
import { saveSeedMargin } from "./actions";
import { attachSeedContent } from "@/lib/content/seeds";
import { routing } from "@/i18n/routing";
import { pickerData } from "../vendors/load";
import { SeedTable } from "./SeedTable";
import { requireRole } from "@/lib/auth/guard";
import { billsPerItem } from "@/lib/purchases/cost";
import { listBills } from "@/lib/repo/purchases";

export const dynamic = "force-dynamic";

/**
 * `/admin/seeds` — SPEC §22.3. The seed shelf.
 *
 * Built 17 Sep 2026 on the owner's instruction, which also decided its shape:
 *
 * > *"I feel we have to get rid of products menu from the admin page since
 * > it's a generic form built for multiple products which isn't suitable. So we
 * > need seed specific inventory page similar to microgreen where I can enter
 * > the seed information and also the available quantity and its price per 100
 * > grams."*
 *
 * So this screen replaced `/admin/products`, which was one textarea of
 * pipe-delimited variant lines (`SEED-RAD-100 | pack=100g | 120 | 2500`) doing
 * duty for racks, trays, seeds and snacks at once. Four categories with
 * nothing in common shared one form, and the one with real stock had to
 * express it as a variant attribute.
 *
 * Like `/admin/varieties`, this owns the **numbers only**, so there is not one
 * text input on the page. Every word a customer reads lives in
 * `content/seeds/<key>.json` (SPEC §4.3).
 *
 * **Since 18 Oct 2026 a seed is added and costed from a purchase bill**, not
 * here (the owner: every purchase is entered with what was paid, so typing
 * the cost again was a second place for it to be wrong). The add form went;
 * the cost is read-only and links to its bill; the grams held move with
 * bills, orders and sowings, and the pencil beside them is a stocktake.
 *
 * A seed can be bought **before** its content file exists. What keeps a
 * nameless seed off the site is downstream: the row is flagged in red with
 * the exact path to create, and every public page skips a seed it cannot
 * name.
 *
 * Content is read in English regardless of the admin's locale: SPEC §4.4
 * scopes Kannada to customer-facing pages, and an operator counting stock
 * wants one stable set of labels.
 */
export default async function SeedsAdmin() {
  await requireRole("admin");
  const t = await getTranslations("admin.seeds");

  const [rows, margin, picker, bills] = await Promise.all([
    listSeeds(),
    getSeedMargin(),
    pickerData(),
    listBills(),
  ]);
  const onBills = billsPerItem(bills);
  const withContent = await attachSeedContent(rows, routing.defaultLocale);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        {/* Both paragraphs run the full content width, stacked — this is an
            internal screen and the owner asked for the width rather than a
            narrow reading measure. */}
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introOps")}</p>
        </div>
      </section>

      {/* One markup and rounding for every seed (3 Oct 2026) — the rack
          screens' form. */}
      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("marginTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("marginHint")}</p>
        <MarginForm margin={margin} save={saveSeedMargin} />
      </section>

      <SeedTable
        seeds={withContent.map((s) => ({
          seed: {
            id: s.id,
            contentKey: s.contentKey,
            pricePer100g: s.pricePer100g,
            ...(s.costPer100g !== undefined ? { costPer100g: s.costPer100g } : {}),
            ...(s.costBill ? { costBill: s.costBill } : {}),
            stockGrams: s.stockGrams,
            active: s.active,
          },
          name: s.content?.text.name ?? null,
          bills: onBills.get(`seed:${s.contentKey}`) ?? 0,
          picker: {
            supplyKey: `seed:${s.contentKey}`,
            vendors: picker.vendorsFor(`seed:${s.contentKey}`),
            selected: picker.selectedFor(`seed:${s.contentKey}`),
          },
        }))}
      />
    </div>
  );
}
