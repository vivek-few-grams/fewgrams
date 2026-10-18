import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { BillEditor } from "../BillEditor";
import { billFormOptions } from "../load";

export const dynamic = "force-dynamic";

/** `/admin/purchases/new` — enter a vendor's bill (SPEC §26.6). */
export default async function NewBill() {
  await requireRole("admin");
  const t = await getTranslations("admin.purchases");
  const { vendors, items, suggestions } = await billFormOptions();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/purchases"
        className="font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
      >
        {t("back")}
      </Link>
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("newTitle")}</h1>
        <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("newHint")}</p>
      </section>
      {vendors.length === 0 ? (
        <p className="font-body text-sm text-terracotta">
          {t("noVendors")}{" "}
          <Link href="/admin/vendors" className="font-semibold underline underline-offset-4">
            {t("addVendor")}
          </Link>
        </p>
      ) : (
        <BillEditor
          vendors={vendors}
          items={items}
          suggestions={suggestions}
          today={istDateISO(new Date())}
        />
      )}
    </div>
  );
}
