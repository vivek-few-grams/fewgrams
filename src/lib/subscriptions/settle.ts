import { paymentProvider, type PaymentProvider } from "@/lib/payments";
import { settlementFor } from "@/lib/orders/order";
import { nextSequence, recordPayment } from "@/lib/repo/orders";
import {
  getSubscription,
  markSubscriptionPaid,
  setSubscriptionReceiptNo,
} from "@/lib/repo/subscriptions";
import { firstDeliveryDate, istDateISO } from "@/lib/delivery-date";
import { ROTATION_WEEKS } from "./weeks";
import { shiftForCutoff, type Subscription } from "./subscription";

/**
 * Bring one subscription up to date with the gateway — the subscription twin
 * of `settleOrder`, and bound by the same rule (SPEC §9.2): the return route
 * and the webhook only **name** it; this asks the gateway server to server
 * and activates it only when `settlementFor` says the gateway calls it paid
 * **and** an attempt succeeded for exactly its total.
 *
 * Idempotent and race-safe for the same reason: `markSubscriptionPaid` is a
 * conditional write that returns true for one caller, and the receipt number
 * is drawn only behind it — from the same `receipt` sequence as orders, so
 * receipts stay one gapless series.
 */
export async function settleSubscription(
  id: string,
  source: "webhook" | "return",
  provider: PaymentProvider | null = paymentProvider(),
): Promise<Subscription | null> {
  const sub = await getSubscription(id);
  if (!sub || sub.status !== "pending_payment") return sub;
  if (!provider || sub.provider !== provider.name) return sub;

  const gateway = await provider.fetchOrder({ orderId: id, providerOrderId: sub.providerOrderId });
  for (const attempt of gateway.attempts) await recordPayment(attempt, source, provider.name);

  const settlement = settlementFor(sub, gateway);
  if (settlement.action === "mismatch") {
    console.error(
      `[payments] ${id}: gateway reports ₹${settlement.attempt.amount} ${settlement.attempt.currency} paid against a ₹${sub.total} subscription; left unpaid for review`,
    );
    return sub;
  }
  if (settlement.action !== "pay") return sub;

  const now = new Date();
  /* Paid after a Friday cutoff the checkout was priced before: the term
     starts a week later, rather than promise a box nobody sowed for. */
  const deliveries = shiftForCutoff(
    sub.deliveries,
    sub.deliveries[0]?.date ?? istDateISO(firstDeliveryDate(now)),
    istDateISO(firstDeliveryDate(now)),
    ROTATION_WEEKS.length,
  );
  if (!(await markSubscriptionPaid(sub, now.toISOString(), deliveries))) return getSubscription(id);

  await setSubscriptionReceiptNo(id, await nextSequence("receipt"));
  return getSubscription(id);
}
