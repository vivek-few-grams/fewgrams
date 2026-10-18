import { getTranslations } from "next-intl/server";
import type { RackSupply } from "@/lib/purchases/supplies";
import { pickerData } from "./load";
import { SupplierPicker } from "./SupplierPicker";

/** The message key under `admin.suppliers.racks` for each rack supply. */
const LABEL: Record<RackSupply, string> = {
  "rack:shelf": "shelf",
  "rack:angle": "angle",
  "rack:pipe-pipes": "pipes",
  "rack:pipe-connectors": "connectors",
};

/**
 * "Bought from" on a rack screen — one vendor picker per thing bought: the
 * shelf and angle ranges come whole from one maker, a pipe rack's pipes and
 * connectors from two (the owner, 18 Oct 2026). Seeds, trays and grow media
 * carry their picker on each row instead.
 */
export async function SupplierSection({ supplies }: { supplies: RackSupply[] }) {
  const t = await getTranslations("admin.suppliers");
  const picker = await pickerData();
  return (
    <section className="rounded-2xl border border-forest/15 p-6">
      <h2 className="font-display text-lg font-semibold text-forest">{t("boughtFrom")}</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-3 font-body text-sm sm:grid-cols-2">
        {supplies.map((key) => (
          <div key={key}>
            <dt className="text-stone">{t(`racks.${LABEL[key]}`)}</dt>
            <dd className="text-sm [&_button]:text-sm">
              <SupplierPicker
                supplyKey={key}
                item={t(`racks.${LABEL[key]}`)}
                vendors={picker.vendorsFor(key)}
                selected={picker.selectedFor(key)}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
