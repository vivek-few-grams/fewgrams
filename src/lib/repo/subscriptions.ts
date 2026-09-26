import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import { SubscriptionEntity } from "@/lib/db/entities";
import type {
  Subscription,
  SubscriptionDelivery,
  SubscriptionStatus,
} from "@/lib/subscriptions/subscription";

/**
 * Subscriptions — SPEC §4, §5. The key layout is `SubscriptionEntity` in
 * src/lib/db/entities.ts; this file is the access patterns.
 */

type Row = EntityItem<typeof SubscriptionEntity>;

function toSubscription(row: Row): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email ?? null,
    status: row.status,
    lines: row.lines.map((l) => ({ ...l })),
    total: row.total,
    deliveries: row.deliveries.map((d) => ({ date: d.date, week: d.week })),
    address: row.address,
    locale: row.locale,
    provider: row.provider,
    providerOrderId: row.providerOrderId ?? null,
    receiptNo: row.receiptNo ?? null,
    paidAt: row.paidAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}

/** `create`, not `put`: an id collision fails loudly. */
export async function createSubscription(sub: Subscription): Promise<void> {
  await SubscriptionEntity.create({
    id: sub.id,
    userId: sub.userId,
    ...(sub.email ? { email: sub.email } : {}),
    status: sub.status,
    lines: sub.lines,
    total: sub.total,
    deliveries: sub.deliveries,
    address: sub.address,
    locale: sub.locale,
    provider: sub.provider,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    expiresAt: sub.expiresAt,
  }).go();
}

export async function getSubscription(id: string): Promise<Subscription | null> {
  const { data } = await SubscriptionEntity.get({ id }).go(READ_OPTS);
  return data ? toSubscription(data) : null;
}

export async function setSubscriptionProviderOrderId(id: string, providerOrderId: string): Promise<void> {
  await SubscriptionEntity.patch({ id })
    .set({ providerOrderId, updatedAt: new Date().toISOString() })
    .go();
}

/**
 * `pending_payment` → `active`, **true for exactly one caller** — the same
 * conditional write as `markOrderPaid`, so the webhook and the return page
 * cannot both draw a receipt number. Supplies `userId` and `createdAt`
 * because leaving `pending_payment` writes the sparse customer index.
 */
export async function markSubscriptionPaid(
  sub: Subscription,
  paidAt: string,
  deliveries: SubscriptionDelivery[],
): Promise<boolean> {
  try {
    await SubscriptionEntity.patch({ id: sub.id })
      .set({
        status: "active",
        paidAt,
        deliveries,
        userId: sub.userId,
        createdAt: sub.createdAt,
        updatedAt: paidAt,
      })
      .where(({ status }, { eq }) => eq(status, "pending_payment"))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

export async function setSubscriptionReceiptNo(id: string, receiptNo: number): Promise<void> {
  await SubscriptionEntity.patch({ id })
    .set({ receiptNo, updatedAt: new Date().toISOString() })
    .go();
}

/** Every subscription in one stored status, newest first. `active` holds the
 *  expired ones too — expiry is derived from the dates. */
export async function listSubscriptionsByStatus(status: SubscriptionStatus): Promise<Subscription[]> {
  const { data } = await SubscriptionEntity.query
    .byStatus({ status })
    .go({ ...LIST_OPTS, order: "desc" });
  return data.map(toSubscription);
}

/** One customer's paid subscriptions, newest first. */
export async function listSubscriptionsForUser(userId: string): Promise<Subscription[]> {
  const { data } = await SubscriptionEntity.query
    .byUser({ userId })
    .go({ ...LIST_OPTS, order: "desc" });
  return data.map(toSubscription);
}
