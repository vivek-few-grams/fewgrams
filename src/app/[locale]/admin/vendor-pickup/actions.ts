"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { normalisePhone } from "@/lib/account/validation";
import { err, type FormState } from "@/lib/forms";
import { addVendorPickup, getShippingSettings, setVendorPickups } from "@/lib/repo/shipping";

/** Every screen that shows a vendor panel, plus the two that use the result. */
function revalidateVendorScreens() {
  for (const path of ["racks", "delivery"]) {
    revalidatePath(`/[locale]/admin/${path}`, "page");
  }
  revalidatePath("/[locale]/checkout", "page");
}

/**
 * Save the vendor pickup of each item on one product screen (SPEC §7, the
 * owner, 25 Sep 2026). Posted as `vendor:<item>` — a vendor id, or empty for
 * none — for each item the screen lists; nothing else on the row moves.
 */
export async function saveVendorPickups(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const settings = await getShippingSettings();
  if (!settings) return err("noSettings");

  const known = new Set(settings.origins.map((o) => o.id));
  const items = [...new Set([...fd.keys()].flatMap((k) => (k.startsWith("vendor:") ? [k.slice(7)] : [])))];
  const entries = [];
  for (const item of items) {
    const vendor = String(fd.get(`vendor:${item}`) ?? "") || null;
    if (vendor && !known.has(vendor)) return err("vendorMissing", `vendor:${item}`);
    entries.push({ item, vendor });
  }
  await setVendorPickups(entries);
  revalidateVendorScreens();
  return { status: "saved" };
}

/** Add a vendor pickup address from a product screen. */
export async function addVendor(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  if (!(await getShippingSettings())) return err("noSettings");

  const get = (f: string) => String(fd.get(f) ?? "").trim();
  for (const f of ["name", "address", "city"]) if (!get(f)) return err("required", f);
  const phone = normalisePhone(get("phone"));
  if (!phone) return err("phoneInvalid", "phone");
  const pincode = get("pincode");
  if (!/^[1-9]\d{5}$/.test(pincode)) return err("pincodeInvalid", "pincode");

  await addVendorPickup({
    id: `loc-${crypto.randomUUID().slice(0, 8)}`,
    name: get("name"),
    phone,
    address: get("address"),
    city: get("city"),
    pincode,
  });
  revalidateVendorScreens();
  return { status: "saved" };
}
