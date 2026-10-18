import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { VendorEntity } from "@/lib/db/entities";
import { supplierChanges } from "@/lib/purchases/supplies";
import type { Vendor } from "@/lib/purchases/vendor";

/** Vendors — `/admin/vendors`, SPEC §26.6. Key layout in entities.ts. */

type Row = EntityItem<typeof VendorEntity>;

function fromRow(r: Row): Vendor {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    gstin: r.gstin ?? null,
    state: r.stateCode && r.stateName ? { code: r.stateCode, name: r.stateName } : null,
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    filing: r.filing,
    supplies: r.supplies ?? [],
    notes: r.notes ?? "",
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Every vendor, by name. */
export async function listVendors(): Promise<Vendor[]> {
  const { data } = await VendorEntity.query.all({}).go(LIST_OPTS);
  return data.map(fromRow).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const { data } = await VendorEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

export async function putVendor(v: Vendor): Promise<void> {
  await VendorEntity.put({
    id: v.id,
    name: v.name,
    kind: v.kind,
    ...(v.gstin ? { gstin: v.gstin } : {}),
    ...(v.state ? { stateCode: v.state.code, stateName: v.state.name } : {}),
    ...(v.address ? { address: v.address } : {}),
    ...(v.phone ? { phone: v.phone } : {}),
    ...(v.email ? { email: v.email } : {}),
    filing: v.filing,
    ...(v.supplies.length ? { supplies: v.supplies } : {}),
    ...(v.notes ? { notes: v.notes } : {}),
    active: v.active,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }).go();
}

export async function deleteVendor(id: string): Promise<void> {
  await VendorEntity.delete({ id }).go();
}

/** Take a deleted product off every vendor's list, so a product later added
 *  under the same key does not come back linked to its old vendors. */
export async function forgetSupply(key: string): Promise<void> {
  const now = new Date().toISOString();
  for (const v of supplierChanges(await listVendors(), key, [])) await putVendor({ ...v, updatedAt: now });
}
