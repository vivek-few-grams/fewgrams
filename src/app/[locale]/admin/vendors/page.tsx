import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/guard";
import { listBills } from "@/lib/repo/purchases";
import { listVendors } from "@/lib/repo/vendors";
import { supplyOptions } from "./load";
import { VendorForm } from "./VendorForm";
import { VendorRow } from "./VendorRow";

export const dynamic = "force-dynamic";

/**
 * `/admin/vendors` — SPEC §26.6. Everyone we buy from, so a purchase bill
 * picks its vendor rather than typing a GSTIN each time. A vendor's GSTIN
 * decides whether its tax is CGST + SGST or IGST, and its filing frequency
 * says when its bills should reach our GSTR-2B.
 *
 * What each vendor supplies is picked on the product screens (`SupplierPicker`)
 * and only listed here (the owner, 18 Oct 2026).
 */
export default async function VendorsAdmin() {
  await requireRole("admin");
  const t = await getTranslations("admin.vendors");
  const [vendors, bills, options] = await Promise.all([listVendors(), listBills(), supplyOptions()]);
  const count = (id: string) => bills.filter((b) => b.vendor.id === id).length;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("intro")}</p>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="mb-5 font-display text-lg font-semibold text-forest">{t("newTitle")}</h2>
        <VendorForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-forest">{t("listTitle")}</h2>
        {vendors.length === 0 ? (
          <p className="font-body text-sm text-stone">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {vendors.map((v) => (
              <VendorRow key={v.id} vendor={v} bills={count(v.id)} options={options} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
