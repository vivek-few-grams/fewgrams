import type { EntityItem } from "electrodb";
import { READ_OPTS } from "@/lib/db/client";
import { ShippingSettingsEntity } from "@/lib/db/entities";
import { HOME_ORIGIN } from "@/lib/shipping/origin";
import type { PackingRules } from "@/lib/shipping/parcel";

/** Where the courier collects from — the owner's address, not a customer's. */
export type Pickup = {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
};

/** A pickup with an id: `home` for the owner's own, any other for a
 *  supplier who ships straight to the customer (the owner, 24 Sep 2026). */
export type Origin = Pickup & { id: string };


export type ShippingSettings = {
  pickup: Pickup;
  /** The other pickups, suppliers' — never `home`. */
  origins: Origin[];
  /** `originItemKey` → the item's vendor pickup id, if it has one. */
  vendorOf: Record<string, string>;
  /** Rupees for any order with greens in it — the own same-day run. */
  greenRunFee: number;
  /** The order-wide packing figures. Per-item sizes and weights live on the
   *  tray rows and the rack shelf-size rows. */
  packing: PackingRules;
  updatedAt: string;
};

type Row = EntityItem<typeof ShippingSettingsEntity>;

function fromRow(r: Row): ShippingSettings {
  return {
    pickup: {
      name: r.pickupName,
      phone: r.pickupPhone,
      address: r.pickupAddress,
      city: r.pickupCity,
      pincode: r.pickupPincode,
    },
    origins: r.origins ?? [],
    vendorOf: Object.fromEntries((r.vendors ?? []).map((s) => [s.item, s.origin])),
    greenRunFee: r.greenRunFee,
    packing: { seedPackingGrams: r.seedPackingGrams },
    updatedAt: r.updatedAt,
  };
}

/** Every pickup, home first. */
export function allOrigins(s: Pick<ShippingSettings, "pickup" | "origins">): Origin[] {
  return [{ id: HOME_ORIGIN, ...s.pickup }, ...s.origins];
}

/** Null until admin → delivery is first saved. */
export async function getShippingSettings(): Promise<ShippingSettings | null> {
  const { data } = await ShippingSettingsEntity.get({}).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

export async function putShippingSettings(s: Omit<ShippingSettings, "updatedAt">): Promise<void> {
  const { pickup: p } = s;
  await ShippingSettingsEntity.put({
    pickupName: p.name,
    pickupPhone: p.phone,
    pickupAddress: p.address,
    pickupCity: p.city,
    pickupPincode: p.pincode,
    origins: s.origins,
    vendors: pairs(s.vendorOf),
    greenRunFee: s.greenRunFee,
    seedPackingGrams: s.packing.seedPackingGrams,
    updatedAt: new Date().toISOString(),
  }).go();
}

const pairs = (m: Record<string, string>) => Object.entries(m).map(([item, origin]) => ({ item, origin }));

/**
 * Set the vendor pickup for the items on one admin screen, leaving every
 * other item as it is. A read, then
 * a write of the two lists: the screens that call this are the owner's, one
 * at a time.
 */
export async function setVendorPickups(
  entries: readonly { item: string; vendor: string | null }[],
): Promise<void> {
  const s = await getShippingSettings();
  if (!s) throw new Error("Save admin → delivery before assigning vendors");
  const vendorOf = { ...s.vendorOf };
  for (const e of entries) {
    delete vendorOf[e.item];
    if (e.vendor) vendorOf[e.item] = e.vendor;
  }
  await ShippingSettingsEntity.patch({})
    .set({ vendors: pairs(vendorOf), updatedAt: new Date().toISOString() })
    .go();
}

/** Add one vendor pickup address. */
export async function addVendorPickup(origin: Origin): Promise<void> {
  const s = await getShippingSettings();
  if (!s) throw new Error("Save admin → delivery before adding a vendor");
  await ShippingSettingsEntity.patch({})
    .set({ origins: [...s.origins, origin], updatedAt: new Date().toISOString() })
    .go();
}
