import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { growMediumNameMap } from "@/lib/content/grow-media";
import { seedNameMap } from "@/lib/content/seeds";
import { trayNameMap } from "@/lib/content/trays";
import { RACK_SUPPLIES, type RackSupply } from "@/lib/purchases/supplies";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listVendors } from "@/lib/repo/vendors";
import type { VendorChoice } from "./SupplierPicker";

/** A supply key and what admin calls it. */
export type SupplyOption = { key: string; label: string };

/** The message key under `admin.suppliers.racks` for each rack supply. */
const RACK_LABEL: Record<RackSupply, string> = {
  "rack:shelf": "shelf",
  "rack:angle": "angle",
  "rack:pipe-pipes": "pipes",
  "rack:pipe-connectors": "connectors",
};

/**
 * Every supply key (`supplies.ts`) with its admin name — seeds, trays and
 * grow media from their content files in English (SPEC §4.4), racks from
 * `admin.suppliers` — in the order the product screens run. The vendors page
 * lists each vendor's supplies with these.
 */
export async function supplyOptions(): Promise<SupplyOption[]> {
  const t = await getTranslations("admin.suppliers.racks");
  const locale = routing.defaultLocale;
  const [seeds, trays, media, seedNames, trayNames, mediaNames] = await Promise.all([
    listSeeds(),
    listTrays(),
    listGrowMedia(),
    seedNameMap(locale),
    trayNameMap(locale),
    growMediumNameMap(locale),
  ]);
  const rows = (kind: string, keys: string[], names: Record<string, string>) =>
    keys
      .map((k) => ({ key: `${kind}:${k}`, label: names[k] ?? k }))
      .sort((a, b) => a.label.localeCompare(b.label));
  return [
    ...rows(
      "seed",
      seeds.map((s) => s.contentKey),
      seedNames,
    ),
    ...rows(
      "tray",
      trays.map((s) => s.contentKey),
      trayNames,
    ),
    ...rows(
      "media",
      media.map((s) => s.contentKey),
      mediaNames,
    ),
    ...RACK_SUPPLIES.map((key) => ({ key, label: t(RACK_LABEL[key]) })),
  ];
}

/**
 * What a product screen needs for its pickers: the vendors to offer, and
 * who already supplies each key. A switched-off vendor is offered only where
 * it is already ticked, so unticking it stays possible.
 */
export async function pickerData(): Promise<{
  vendorsFor: (key: string) => VendorChoice[];
  selectedFor: (key: string) => string[];
}> {
  const vendors = await listVendors();
  return {
    vendorsFor: (key) =>
      vendors.filter((v) => v.active || v.supplies.includes(key)).map((v) => ({ id: v.id, name: v.name })),
    selectedFor: (key) => vendors.filter((v) => v.supplies.includes(key)).map((v) => v.id),
  };
}
