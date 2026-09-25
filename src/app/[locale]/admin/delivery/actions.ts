"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { normalisePhone } from "@/lib/account/validation";
import { err, money, type FormState } from "@/lib/forms";
import { getShippingSettings, putShippingSettings, type Origin } from "@/lib/repo/shipping";
import { HOME_ORIGIN } from "@/lib/shipping/origin";

/**
 * Save our pickup, the vendor pickup addresses and the packing figures —
 * SPEC §7. Which vendor each product uses is set on the product's screen.
 *
 * Asserts the admin role itself (SPEC §8): a server action is addressable
 * over HTTP whatever page rendered its form.
 *
 * The microgreens fee must be above zero too: the owner's rule is that every
 * order except a subscription pays for delivery.
 *
 * Per-item sizes and weights are not here: a tray's live on its row on admin
 * → trays, a rack's grams per shelf on its shelf size. This form holds only
 * the order-wide figures.
 *
 * Every weight and dimension must be above zero. Zero is never a real answer
 * here — a box has a size and a tray has a weight — and a zero would quote a
 * parcel lighter than it is, which is the one error the customer never sees
 * and the owner pays for.
 */
const TEXT = ["pickupName", "pickupAddress", "pickupCity"] as const;
const NUMBERS = [
  "greenRunFee",
  "seedPackingGrams",
] as const;

export async function saveShippingSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const text: Record<(typeof TEXT)[number], string> = { pickupName: "", pickupAddress: "", pickupCity: "" };
  for (const k of TEXT) {
    const v = String(fd.get(k) ?? "").trim();
    if (!v) return err("required", k);
    text[k] = v;
  }

  const phone = normalisePhone(String(fd.get("pickupPhone") ?? ""));
  if (!phone) return err("phoneInvalid", "pickupPhone");

  const pincode = String(fd.get("pickupPincode") ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(pincode)) return err("pincodeInvalid", "pickupPincode");

  const n = {} as Record<(typeof NUMBERS)[number], number>;
  for (const k of NUMBERS) {
    const v = money(fd, k);
    if (v === null) return err("positive", k);
    n[k] = v;
  }

  /* The other pickups, posted as `origin.<i>.<field>` rows. A row's id is
     made in the browser when it is added and never changes, so renaming a
     supplier cannot move what ships from it. */
  const indices = [...new Set([...fd.keys()].flatMap((k) => /^origin\.(\d+)\.id$/.exec(k)?.[1] ?? []))];
  const origins: Origin[] = [];
  for (const i of indices) {
    const get = (f: string) => String(fd.get(`origin.${i}.${f}`) ?? "").trim();
    const id = get("id");
    if (!/^[a-z0-9-]{1,40}$/.test(id) || id === HOME_ORIGIN || origins.some((o) => o.id === id)) {
      return err("originId");
    }
    const row: Record<string, string> = {};
    for (const f of ["name", "address", "city"]) {
      row[f] = get(f);
      if (!row[f]) return err("required", `origin.${i}.${f}`);
    }
    const originPhone = normalisePhone(get("phone"));
    if (!originPhone) return err("phoneInvalid", `origin.${i}.phone`);
    const originPin = get("pincode");
    if (!/^[1-9]\d{5}$/.test(originPin)) return err("pincodeInvalid", `origin.${i}.pincode`);
    origins.push({ id, name: row.name, phone: originPhone, address: row.address, city: row.city, pincode: originPin });
  }

  /* What ships from where is set on each product's own screen and kept as
     it is. Removing a vendor something still names is refused, rather than
     quietly moving that item back to our pickup. */
  const current = await getShippingSettings();
  const vendorOf = current?.vendorOf ?? {};
  const kept = new Set(origins.map((o) => o.id));
  const orphan = Object.entries(vendorOf).find(([, v]) => !kept.has(v));
  if (orphan) return err("originInUse", undefined, { item: orphan[0] });

  await putShippingSettings({
    pickup: {
      name: text.pickupName,
      phone,
      address: text.pickupAddress,
      city: text.pickupCity,
      pincode,
    },
    origins,
    vendorOf,
    /* Whole rupees: it is added to a total the gateway charges in rupees. */
    greenRunFee: Math.round(n.greenRunFee),
    packing: { seedPackingGrams: n.seedPackingGrams },
  });

  revalidatePath("/[locale]/admin/delivery", "page");
  revalidatePath("/[locale]/checkout", "page");
  return { status: "saved" };
}
