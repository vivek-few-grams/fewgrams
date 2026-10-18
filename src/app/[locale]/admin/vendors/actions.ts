"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { err, type FormState } from "@/lib/forms";
import { isSupplyKey, supplierChanges } from "@/lib/purchases/supplies";
import { readVendor } from "@/lib/purchases/vendor";
import { listBills } from "@/lib/repo/purchases";
import { deleteVendor, getVendor, listVendors, putVendor } from "@/lib/repo/vendors";

/**
 * Vendor mutations — `/admin/vendors`, SPEC §26.6. Each asserts the admin
 * role itself: a server action is addressable without its page.
 */

/* Every admin screen: the product screens list vendors in their pickers. */
function refresh() {
  revalidatePath("/[locale]/admin", "layout");
}

/** Add a vendor, or save one (`id` set). */
export async function saveVendor(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readVendor(fd);
  if (!read.ok) return read.state;

  const id = String(fd.get("id") ?? "");
  const now = new Date().toISOString();
  if (id) {
    const current = await getVendor(id);
    if (!current) return err("notFound");
    await putVendor({ ...current, ...read.value, updatedAt: now });
  } else {
    await putVendor({ id: crypto.randomUUID(), ...read.value, supplies: [], createdAt: now, updatedAt: now });
  }
  refresh();
  return { status: "saved" };
}

/**
 * Delete a vendor with no bills. One with bills is switched off instead, on
 * its own form: its bills keep their copy of its name and GSTIN either way,
 * but the register should still be able to say who a bill came from.
 */
export async function removeVendor(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  const bills = await listBills();
  if (bills.some((b) => b.vendor.id === id)) throw new Error("A vendor with bills cannot be deleted");
  await deleteVendor(id);
  refresh();
}

export type SupplierResult = { ok: true } | { ok: false; code: "badKey" | "unknownVendor" };

/**
 * Who `key` is bought from — the vendor picker on a product screen
 * (`supplies.ts`). Exactly the vendors in `vendorIds` end up listing it;
 * only those whose list changes are written.
 */
export async function setSuppliers(key: string, vendorIds: string[]): Promise<SupplierResult> {
  await assertRole("admin");
  if (!isSupplyKey(key)) return { ok: false, code: "badKey" };
  const vendors = await listVendors();
  if (vendorIds.some((id) => !vendors.some((v) => v.id === id))) return { ok: false, code: "unknownVendor" };
  const now = new Date().toISOString();
  for (const v of supplierChanges(vendors, key, vendorIds)) await putVendor({ ...v, updatedAt: now });
  refresh();
  return { ok: true };
}
