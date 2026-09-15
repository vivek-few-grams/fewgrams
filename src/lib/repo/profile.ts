import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { AddressEntity, ProfileEntity } from "@/lib/db/entities";
import type { Address, UserProfile } from "@/lib/types";

/**
 * Profile and address repository — SPEC §4, `USER#<id>` partition.
 *
 * The key layout lives in src/lib/db/entities.ts; this file is only the
 * access patterns. See src/lib/db/client.ts for why every read passes
 * options.
 *
 * One invariant is maintained here rather than in the schema: **at most one
 * address per user carries `isDefault`.** DynamoDB cannot express a
 * constraint across items on a non-key attribute, so every write path that
 * could break it — first address, editing an address, deleting the default —
 * repairs it explicitly below.
 */

const now = () => new Date().toISOString();

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await ProfileEntity.get({ userId }).go(READ_OPTS);
  return data;
}

/** Upsert. There is no "create profile" step — the row appears the first time
 *  the customer saves the form, and its absence is a normal state. */
export async function saveProfile(
  userId: string,
  fields: { name?: string; phone?: string },
): Promise<UserProfile> {
  const profile: UserProfile = { userId, ...fields, updatedAt: now() };
  await ProfileEntity.put(profile).go();
  return profile;
}

/**
 * All of one customer's addresses, default first then oldest first.
 *
 * Sorted in the application rather than by the sort key: `ADDR#<uuid>` has no
 * meaning as an ordering, and making `isDefault` part of the key would mean
 * deleting and rewriting a row every time the default moved.
 */
export async function listAddresses(userId: string): Promise<Address[]> {
  const { data } = await AddressEntity.query.byUser({ userId }).go(LIST_OPTS);
  return data.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export async function getAddress(
  userId: string,
  addrId: string,
): Promise<Address | null> {
  const { data } = await AddressEntity.get({ userId, addrId }).go(READ_OPTS);
  return data;
}

/**
 * Create or update one address, keeping the single-default invariant.
 *
 * Two rules, both of which exist because the alternative is a customer with
 * no deliverable address or two of them:
 *
 * - The first address a customer saves is always the default, whatever the
 *   checkbox said.
 * - Marking one as default clears the flag on the others.
 */
export async function putAddress(address: Address): Promise<Address> {
  const existing = await listAddresses(address.userId);
  const isFirst = existing.every((a) => a.addrId === address.addrId);

  const saved: Address = {
    ...address,
    isDefault: address.isDefault || isFirst,
    updatedAt: now(),
  };
  await AddressEntity.put(saved).go();

  if (saved.isDefault) await clearOtherDefaults(saved.userId, saved.addrId, existing);
  return saved;
}

export async function setDefaultAddress(
  userId: string,
  addrId: string,
): Promise<void> {
  const addresses = await listAddresses(userId);
  const target = addresses.find((a) => a.addrId === addrId);
  if (!target) throw new Error(`Address ${addrId} not found`);

  if (!target.isDefault) {
    await AddressEntity.patch({ userId, addrId })
      .set({ isDefault: true, updatedAt: now() })
      .go();
  }
  await clearOtherDefaults(userId, addrId, addresses);
}

/**
 * Deleting the default promotes the oldest survivor, so a customer who
 * removes an address never ends up with several and none chosen.
 */
export async function deleteAddress(userId: string, addrId: string): Promise<void> {
  const addresses = await listAddresses(userId);
  const removed = addresses.find((a) => a.addrId === addrId);
  await AddressEntity.delete({ userId, addrId }).go();
  if (!removed?.isDefault) return;

  const survivors = addresses
    .filter((a) => a.addrId !== addrId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (survivors[0]) {
    await AddressEntity.patch({ userId, addrId: survivors[0].addrId })
      .set({ isDefault: true, updatedAt: now() })
      .go();
  }
}

/** Only touches rows that are actually wrong, so the usual case — one
 *  address, already correct — writes nothing. */
async function clearOtherDefaults(
  userId: string,
  keepId: string,
  known: Address[],
): Promise<void> {
  const stale = known.filter((a) => a.addrId !== keepId && a.isDefault);
  await Promise.all(
    stale.map((a) =>
      AddressEntity.patch({ userId, addrId: a.addrId })
        .set({ isDefault: false, updatedAt: now() })
        .go(),
    ),
  );
}

/** Convenience for the overview card and, later, checkout. */
export async function getDefaultAddress(userId: string): Promise<Address | null> {
  const addresses = await listAddresses(userId);
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}
