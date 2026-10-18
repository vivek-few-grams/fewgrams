import { getTranslations } from "next-intl/server";
import { listTrays } from "@/lib/repo/trays";
import { attachTrayContent } from "@/lib/content/trays";
import { routing } from "@/i18n/routing";
import { pickerData } from "../vendors/load";
import { TrayTable } from "./TrayTable";
import { requireRole } from "@/lib/auth/guard";
import { billsPerItem } from "@/lib/purchases/cost";
import { listBills } from "@/lib/repo/purchases";

export const dynamic = "force-dynamic";

/**
 * `/admin/trays` — SPEC §23.4. Trays and drainage cells.
 *
 * Built 17 Sep 2026 on the owner's instruction:
 *
 * > *"Next final product that I would like to have admin UI is for trays and
 * > drainage cells … even these are ordered based on the request this would
 * > take minimum of seven days to deliver."*
 *
 * Fourth purpose-built catalogue screen, after varieties, plans and seeds. It
 * is **not** the generic products form coming back: that screen was one
 * pipe-delimited textarea serving four categories at once and was deleted on
 * 17 Sep 2026 (SPEC §22.3). This one knows what it is for.
 *
 * Like its siblings it owns the **numbers only**, so there is not one text
 * input on the page. Every word a customer reads lives in
 * `content/trays/<key>.json` (SPEC §4.3).
 *
 * ## Added and costed from a purchase bill (18 Oct 2026)
 *
 * The owner: every purchase is entered with what was paid, and the margin is
 * already on this screen, so the cost should come from the one and not be
 * typed into the other. An item is added with "+ New product" on a bill; its
 * cost is the latest bill's, read-only here and linked to it; the packs held
 * move with bills and orders, and the pencil beside them is a stocktake. The
 * row still owns its margin and its six packing figures.
 *
 * An item can be bought **before** its content file exists. What keeps a
 * nameless item off the site is downstream: the row is flagged in red with the
 * exact path to create, and the public page skips an item it cannot name.
 *
 * Content is read in English regardless of the admin's locale: SPEC §4.4
 * scopes Kannada to customer-facing pages, and an operator setting a price
 * wants one stable set of labels.
 */
export default async function TraysAdmin() {
  await requireRole("admin");
  const t = await getTranslations("admin.trays");

  const [rows, picker, bills] = await Promise.all([listTrays(), pickerData(), listBills()]);
  const onBills = billsPerItem(bills);
  const withContent = await attachTrayContent(rows, routing.defaultLocale);

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

      <TrayTable
        /* The whole stored row goes to the table, not a hand-picked subset:
           the row's save form posts every field it shows, so a field left off
           here renders blank and the next save would clear it — which is how
           the packing figures looked unsaved (23 Sep 2026). */
        trays={withContent.map(({ content, ...tray }) => ({
          tray,
          name: content?.text.name ?? null,
          bills: onBills.get(`tray:${tray.contentKey}`) ?? 0,
          picker: {
            supplyKey: `tray:${tray.contentKey}`,
            vendors: picker.vendorsFor(`tray:${tray.contentKey}`),
            selected: picker.selectedFor(`tray:${tray.contentKey}`),
          },
        }))}
      />
    </div>
  );
}
