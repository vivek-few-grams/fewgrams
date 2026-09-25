import { getShippingSettings } from "@/lib/repo/shipping";
import { VendorPickupPanel, type VendorItem } from "./VendorPickupPanel";

/** The vendor panel for one product screen, with the settings row read here
 *  so each screen only has to say which items it lists. */
export async function VendorPickupSection({ items }: { items: VendorItem[] }) {
  const settings = await getShippingSettings();
  return (
    <VendorPickupPanel
      items={items}
      vendors={settings?.origins ?? []}
      vendorOf={settings?.vendorOf ?? {}}
      ready={settings !== null}
    />
  );
}
