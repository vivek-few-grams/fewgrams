"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { normalisePhone } from "@/lib/account/validation";
import { err, type FormState } from "@/lib/forms";
import {
  addVendorPickup,
  allOrigins,
  getShippingSettings,
  samePickupName,
  setVendorPickups,
  type Origin,
} from "@/lib/repo/shipping";

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

/**
 * Add a vendor pickup address from a product screen — **refused when another
 * pickup has its name** (trimmed, any case). Couriers know a pickup by its
 * name alone, so two of one name could have a parcel collected from the
 * wrong address. Written over the row as read, and read again if admin →
 * delivery saved in between, so neither save drops the other's work.
 */
export async function addVendor(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  if (!(await getShippingSettings())) return err("noSettings");

  const get = (f: string) => String(fd.get(f) ?? "").trim();
  for (const f of ["name", "address", "city"]) if (!get(f)) return err("required", f);
  const phone = normalisePhone(get("phone"));
  if (!phone) return err("phoneInvalid", "phone");
  const pincode = get("pincode");
  if (!/^[1-9]\d{5}$/.test(pincode)) return err("pincodeInvalid", "pincode");

  const origin: Origin = {
    id: `loc-${crypto.randomUUID().slice(0, 8)}`,
    name: get("name"),
    phone,
    address: get("address"),
    city: get("city"),
    pincode,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const settings = await getShippingSettings();
    if (!settings) return err("noSettings");
    /* Against each pickup on its own, so a clash already stored between two
       others does not block an unrelated name. */
    if (allOrigins(settings).some((o) => samePickupName(o.name, origin.name)))
      return err("nameTaken", "name", { name: origin.name });
    if (await addVendorPickup(settings, origin)) {
      revalidateVendorScreens();
      return { status: "saved" };
    }
  }
  return err("changedElsewhere");
}
