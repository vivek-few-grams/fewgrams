"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { assertRole } from "@/lib/auth/guard";
import { MAX_ADDRESSES, readPincode, validateAddress, validateProfile } from "@/lib/account/validation";
import { checkDeliveryArea, type PinPlace } from "@/lib/pincode/place";
import {
  deleteAddress,
  getAddress,
  listAddresses,
  putAddress,
  saveProfile,
  setDefaultAddress,
} from "@/lib/repo/profile";
import { routing } from "@/i18n/routing";
import type { Address } from "@/lib/types";
import type { FormState } from "@/lib/forms";

/**
 * Account mutations — SPEC §8 and §12.
 *
 * Every one of these calls `assertRole("customer")` itself. The layout gate is
 * not enough: a server action is addressable over HTTP independently of the
 * page that renders its form.
 *
 * `assertRole` also returns the actor, and the userId used for every write
 * comes from **that**, never from the form. A hidden `userId` field would let
 * any signed-in customer post an address into someone else's partition.
 */

/** Account pages are `force-dynamic`, so this is about the client Router
 *  Cache: without it a saved address does not appear until a hard reload.
 *  Checkout too, because it adds addresses and moves the default with these
 *  same actions. */
function refresh() {
  revalidatePath("/[locale]/account", "layout");
  revalidatePath("/[locale]/checkout", "page");
}

export async function saveProfileAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await assertRole("customer");

  const parsed = validateProfile(fd);
  if (!parsed.ok) return { status: "error", ...parsed.error };

  await saveProfile(actor.userId, parsed.value);
  refresh();
  return { status: "saved" };
}

export async function saveAddressAction(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await assertRole("customer");

  /* The area is checked again here whatever the PIN step said — the browser
     is convenience, this is the gate. Cached, so it is a read, not a call;
     its place also fills a district or state the form sent blank. */
  const pincode = readPincode(fd);
  const area = /^\d{6}$/.test(pincode)
    ? await checkDeliveryArea(pincode)
    : { served: false, place: null };

  const parsed = validateAddress(fd, area);
  if (!parsed.ok) return { status: "error", ...parsed.error };

  const addrId = String(fd.get("addrId") ?? "").trim();
  // An edit must not be able to reach another user's row: the read is scoped
  // to this actor's partition, so an id belonging to someone else simply is
  // not found.
  const existing = addrId ? await getAddress(actor.userId, addrId) : null;
  if (addrId && !existing) return { status: "error", code: "notFound" };
  /* Checked here, not only by hiding the button: two tabs, or a replayed
     post, would otherwise add a sixth. An edit is never refused. */
  if (!existing && (await listAddresses(actor.userId)).length >= MAX_ADDRESSES) {
    return { status: "error", code: "addressLimit" };
  }

  const nowISO = new Date().toISOString();
  const address: Address = {
    userId: actor.userId,
    addrId: existing?.addrId ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? nowISO,
    updatedAt: nowISO,
    ...parsed.value,
  };

  await putAddress(address);
  refresh();
  return { status: "saved" };
}

/** What the address form learns about a PIN the moment it is complete. */
export type PinLookup =
  | { status: "served"; place: PinPlace | null }
  | { status: "notServed" }
  | { status: "invalid" };

/**
 * Called by the address form on the sixth digit — SPEC §7.
 *
 * One India Post lookup answers both questions — is it in the area (a
 * district, `area.ts`), and what are its district and state — so a customer
 * outside the area hears so before typing the rest of an address. `place:
 * null` is not an error: the form leaves the fields for the customer to type.
 * This decides nothing — `saveAddressAction` checks the PIN again.
 *
 * Signed-in only, like every action here: it spends a rate-limited key.
 */
export async function lookupPinAction(raw: string): Promise<PinLookup> {
  await assertRole("customer");
  const pincode = String(raw ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(pincode)) return { status: "invalid" };
  const area = await checkDeliveryArea(pincode);
  return area.served ? { status: "served", place: area.place } : { status: "notServed" };
}

export async function deleteAddressAction(fd: FormData): Promise<void> {
  const actor = await assertRole("customer");
  const addrId = String(fd.get("addrId") ?? "").trim();
  if (addrId) await deleteAddress(actor.userId, addrId);
  refresh();
}

export async function setDefaultAddressAction(fd: FormData): Promise<void> {
  const actor = await assertRole("customer");
  const addrId = String(fd.get("addrId") ?? "").trim();
  if (addrId) await setDefaultAddress(actor.userId, addrId);
  refresh();
}

/**
 * Sign out — the only one in the app (SPEC §18.1).
 *
 * The locale arrives as a form field rather than being inferred. A server
 * action carries no `[locale]` route param, so the alternative is reading the
 * NEXT_LOCALE cookie and hoping; this way a Kannada visitor lands on `/kn`
 * deterministically.
 */
export async function signOutAction(fd: FormData): Promise<void> {
  const requested = String(fd.get("locale") ?? "");
  const locales: readonly string[] = routing.locales;
  const locale = locales.includes(requested) ? requested : routing.defaultLocale;

  await signOut({ redirectTo: locale === routing.defaultLocale ? "/" : `/${locale}` });
}
