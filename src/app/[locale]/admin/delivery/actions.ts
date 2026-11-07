"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { normalisePhone } from "@/lib/account/validation";
import { count, err, money, type FormState } from "@/lib/forms";
import {
  allOrigins,
  getShippingSettings,
  mergeOrigins,
  pickupNameClash,
  writeDeliverySettings,
  type Origin,
} from "@/lib/repo/shipping";
import { HOME_ORIGIN } from "@/lib/shipping/origin";

/**
 * Save our pickup, the vendor pickup addresses and the packing figures —
 * SPEC §7. Which vendor each product uses is set on the product's screen.
 *
 * Asserts the admin role itself (SPEC §8): a server action is addressable
 * over HTTP whatever page rendered its form.
 *
 * The microgreens fee must be a whole number of rupees, at least one: the
 * owner's rule is that every order except a subscription pays for delivery,
 * and the fee is added to a total the gateway charges in rupees — a 0.4 was
 * stored rounded, as ₹0.
 *
 * Per-item sizes and weights are not here: a tray's live on its row on admin
 * → trays, a rack's grams per shelf on its shelf size. This form holds only
 * the order-wide figures.
 *
 * Every weight and dimension must be above zero. Zero is never a real answer
 * here — a box has a size and a tray has a weight — and a zero would quote a
 * parcel lighter than it is, which is the one error the customer never sees
 * and the owner pays for.
 *
 * ## Merged with the row as it is now
 *
 * The form holds the vendor pickups as the page loaded them, and a vendor can
 * be added from a rack screen meanwhile. So the save posts its rows and the
 * ids it removed, and `mergeOrigins` lays them over the **stored** list —
 * a pickup the form never showed is kept. The write is conditional on the row
 * being as read; a write in between means read, merge and check again.
 *
 * **Every pickup needs its own name** — ours and each vendor's, trimmed and in
 * any case. Couriers know a pickup by name alone, so two of one name book a
 * parcel from whichever the courier finds first.
 */
const TEXT = ["pickupName", "pickupAddress", "pickupCity"] as const;

/** Tries at a save before giving up on a row that keeps changing. */
const ATTEMPTS = 3;

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

  const greenRunFee = count(fd, "greenRunFee");
  if (greenRunFee === null) return err("wholeRupees", "greenRunFee");
  const seedPackingGrams = money(fd, "seedPackingGrams");
  if (seedPackingGrams === null) return err("positive", "seedPackingGrams");

  /* The other pickups, posted as `origin.<i>.<field>` rows. A row's id is
     made in the browser when it is added and never changes, so renaming a
     supplier cannot move what ships from it. `field` remembers each row's
     index, to point an error at its input. */
  const indices = [...new Set([...fd.keys()].flatMap((k) => /^origin\.(\d+)\.id$/.exec(k)?.[1] ?? []))];
  const posted: Origin[] = [];
  const field = new Map<string, string>();
  for (const i of indices) {
    const get = (f: string) => String(fd.get(`origin.${i}.${f}`) ?? "").trim();
    const id = get("id");
    if (!/^[a-z0-9-]{1,40}$/.test(id) || id === HOME_ORIGIN || posted.some((o) => o.id === id)) {
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
    posted.push({
      id,
      name: row.name,
      phone: originPhone,
      address: row.address,
      city: row.city,
      pincode: originPin,
    });
    field.set(id, `origin.${i}.name`);
  }
  /* The stored pickups the owner took off this form. */
  const removed = new Set(fd.getAll("removedOrigin").map(String));
  const pickup = {
    name: text.pickupName,
    phone,
    address: text.pickupAddress,
    city: text.pickupCity,
    pincode,
  };

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const current = await getShippingSettings();
    const origins = mergeOrigins(current?.origins ?? [], posted, removed);

    /* What ships from where is set on each product's own screen and kept as
       it is. Removing a vendor something still names is refused, rather
       than quietly moving that item back to our pickup. */
    const kept = new Set(origins.map((o) => o.id));
    const orphan = Object.entries(current?.vendorOf ?? {}).find(([, v]) => !kept.has(v));
    if (orphan) return err("originInUse", undefined, { item: orphan[0] });

    /* Pointed at an input this form shows — ours, or the vendor row typed
       into — or at the form when both are pickups it never showed. */
    const clash = pickupNameClash(allOrigins({ pickup, origins }));
    if (clash) {
      const [a, b] = clash;
      const at = field.get(b.id) ?? field.get(a.id) ?? (a.id === HOME_ORIGIN ? "pickupName" : undefined);
      return err("nameTaken", at, { name: b.name });
    }

    const written = await writeDeliverySettings(
      { pickup, origins, greenRunFee, packing: { seedPackingGrams } },
      current?.updatedAt ?? null,
    );
    if (!written) continue;

    revalidatePath("/[locale]/admin/delivery", "page");
    revalidatePath("/[locale]/admin/racks", "page");
    revalidatePath("/[locale]/checkout", "page");
    return { status: "saved" };
  }
  return err("changedElsewhere");
}
