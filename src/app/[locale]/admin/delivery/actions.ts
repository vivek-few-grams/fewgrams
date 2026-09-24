"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { normalisePhone } from "@/lib/account/validation";
import { err, money, type FormState } from "@/lib/forms";
import { putShippingSettings } from "@/lib/repo/shipping";

/**
 * Save the pickup address and the packing figures — SPEC §7.
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
  "shelfStackCm",
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

  await putShippingSettings({
    pickup: {
      name: text.pickupName,
      phone,
      address: text.pickupAddress,
      city: text.pickupCity,
      pincode,
    },
    /* Whole rupees: it is added to a total the gateway charges in rupees. */
    greenRunFee: Math.round(n.greenRunFee),
    packing: { seedPackingGrams: n.seedPackingGrams, shelfStackCm: n.shelfStackCm },
  });

  revalidatePath("/[locale]/admin/delivery", "page");
  revalidatePath("/[locale]/checkout", "page");
  return { status: "saved" };
}
