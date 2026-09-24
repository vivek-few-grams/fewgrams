import type { EntityItem } from "electrodb";
import { READ_OPTS } from "@/lib/db/client";
import { ShippingSettingsEntity } from "@/lib/db/entities";
import type { PackingRules } from "@/lib/shipping/parcel";

/** Where the courier collects from — the owner's address, not a customer's. */
export type Pickup = {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
};

export type ShippingSettings = {
  pickup: Pickup;
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
    greenRunFee: r.greenRunFee,
    packing: { seedPackingGrams: r.seedPackingGrams },
    updatedAt: r.updatedAt,
  };
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
    greenRunFee: s.greenRunFee,
    seedPackingGrams: s.packing.seedPackingGrams,
    updatedAt: new Date().toISOString(),
  }).go();
}
