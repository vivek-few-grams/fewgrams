import type { Address, UserProfile } from "@/lib/types";

/**
 * What a saved delivery address adds to the customer's profile — the audit,
 * 31 Oct 2026: a first checkout took a name and a mobile number on the
 * address, and the account overview still said "Not added yet" for both.
 *
 * **Fills a gap, never overwrites.** A name or number already on the profile
 * is the customer's own choice and stays, whatever the address says — an
 * address is often for someone else ("Mum", the office reception).
 *
 * **The name is left alone when the sign-in provider gave one.** The account
 * pages show the profile's name, else the provider's (`profile?.name ??
 * actor.name`), so a Google customer's name is not missing; writing the
 * recipient over the top of it would rename them after whoever they first
 * sent a box to.
 *
 * Returns the profile's fields to save — the existing values with the gaps
 * filled — or null when there is nothing to fill, so the caller skips the
 * write.
 */
export function profileFromAddress(
  profile: Pick<UserProfile, "name" | "phone"> | null,
  providerName: string | null,
  address: Pick<Address, "recipient" | "phone">,
): { name?: string; phone?: string } | null {
  const name = profile?.name || (providerName ? undefined : address.recipient || undefined);
  const phone = profile?.phone || address.phone || undefined;
  if (name === (profile?.name || undefined) && phone === (profile?.phone || undefined)) return null;
  return { ...(name ? { name } : {}), ...(phone ? { phone } : {}) };
}
