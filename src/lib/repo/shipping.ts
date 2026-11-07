import type { EntityItem } from "electrodb";
import { READ_OPTS, isConditionFailure } from "@/lib/db/client";
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

/** What admin → delivery writes: everything but `vendorOf`, which each
 *  product screen sets for its own items (`setVendorPickups`). */
export type DeliverySettings = Omit<ShippingSettings, "updatedAt" | "vendorOf">;

/**
 * Admin → delivery's save, **over the row as it was read** — `readAt` is its
 * `updatedAt`, or null when there was no row. False, and nothing written,
 * when it has changed since: the caller reads again, merges again and
 * retries. `vendors` is never touched.
 *
 * It was a whole-row put of what the form had loaded, so a vendor pickup
 * added from a rack screen while the delivery page sat open vanished on its
 * next save (found 31 Oct 2026).
 */
export async function writeDeliverySettings(s: DeliverySettings, readAt: string | null): Promise<boolean> {
  const { pickup: p } = s;
  const fields = {
    pickupName: p.name,
    pickupPhone: p.phone,
    pickupAddress: p.address,
    pickupCity: p.city,
    pickupPincode: p.pincode,
    origins: s.origins,
    greenRunFee: s.greenRunFee,
    seedPackingGrams: s.packing.seedPackingGrams,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (readAt === null) {
      await ShippingSettingsEntity.create({ ...fields, vendors: [] }).go();
    } else {
      await ShippingSettingsEntity.patch({})
        .set(fields)
        .where(({ updatedAt }, { eq }) => eq(updatedAt, readAt))
        .go();
    }
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

/**
 * The vendor pickups admin → delivery leaves stored: the row's own list as
 * it is **now**, less the ones the form removed, with the form's edits laid
 * over theirs and its new rows after. A pickup the form never showed — added
 * from a rack screen since the page loaded — is kept as it is.
 */
export function mergeOrigins(
  stored: readonly Origin[],
  posted: readonly Origin[],
  removed: ReadonlySet<string>,
): Origin[] {
  const edits = new Map(posted.map((o) => [o.id, o]));
  const known = new Set(stored.map((o) => o.id));
  return [
    ...stored.filter((o) => !removed.has(o.id)).map((o) => edits.get(o.id) ?? o),
    ...posted.filter((o) => !known.has(o.id) && !removed.has(o.id)),
  ];
}

/**
 * Whether two pickups go by one name. Couriers know a pickup by its name
 * alone — a Delhivery pickup location, an Ekart alias, a Velocity warehouse —
 * so two with one name book a parcel from whichever the courier finds first.
 * Compared as a person reads them: trimmed, in any case.
 */
export function samePickupName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The first two pickups that share a name (`samePickupName`), or null. */
export function pickupNameClash<P extends { name: string }>(pickups: readonly P[]): [P, P] | null {
  for (let i = 1; i < pickups.length; i++) {
    const first = pickups.slice(0, i).find((p) => samePickupName(p.name, pickups[i].name));
    if (first) return [first, pickups[i]];
  }
  return null;
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

/**
 * Add one vendor pickup address to the row as `read` — false, and nothing
 * written, if it has changed since, so this cannot drop an edit admin →
 * delivery saved in between (nor that save drop this).
 */
export async function addVendorPickup(read: ShippingSettings, origin: Origin): Promise<boolean> {
  try {
    await ShippingSettingsEntity.patch({})
      .set({ origins: [...read.origins, origin], updatedAt: new Date().toISOString() })
      .where(({ updatedAt }, { eq }) => eq(updatedAt, read.updatedAt))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}
