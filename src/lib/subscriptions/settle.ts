import { paymentProvider, type PaymentProvider } from "@/lib/payments";
import { settlementFor } from "@/lib/orders/order";
import { FINISH_LEASE_MS, drawInvoiceNo } from "@/lib/orders/settle";
import { recordPayment } from "@/lib/repo/orders";
import {
  claimSubscriptionFinishing,
  getSubscription,
  markSubscriptionFinished,
  markSubscriptionPaid,
  setSubscriptionInvoiceNo,
} from "@/lib/repo/subscriptions";
import { sendSubscriptionConfirmation } from "@/lib/notify/subscription-email";
import { istDateISO } from "@/lib/delivery-date";
import { ROTATION_WEEKS } from "./weeks";
import { subscriptionOpening } from "./opening";
import { shiftForCutoff, type Subscription } from "./subscription";

/**
 * Bring one subscription up to date with the gateway — the subscription twin
 * of `settleOrder`, and bound by the same rule (SPEC §9.2): the return route
 * and the webhook only **name** it; this asks the gateway server to server
 * and activates it only when `settlementFor` says the gateway calls it paid
 * **and** an attempt succeeded for exactly its total.
 *
 * Idempotent and race-safe for the same reason: `markSubscriptionPaid` is a
 * conditional write that returns true for one caller, and the invoice number
 * is drawn only behind it — from the same yearly series as orders, so
 * invoices stay one gapless series (SPEC §26.3).
 */
export async function settleSubscription(
  id: string,
  source: "webhook" | "return",
  provider: PaymentProvider | null = paymentProvider(),
): Promise<Subscription | null> {
  const sub = await getSubscription(id);
  if (!sub) return null;
  if (sub.status !== "pending_payment") return resumeFinishing(sub);
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
  /* Paid after the Saturday it was priced for closed — its Friday cutoff, or
     the sow-by day of its slowest crop: the term starts on the next open
     Saturday, rather than promise a box nobody sowed for. */
  const open = istDateISO((await subscriptionOpening(now)).first);
  const deliveries = shiftForCutoff(sub.deliveries, sub.deliveries[0]?.date ?? open, open, ROTATION_WEEKS.length);
  if (!(await markSubscriptionPaid(sub, now.toISOString(), deliveries))) return getSubscription(id);
  return finishPaidSubscription({ ...sub, paidAt: now.toISOString(), deliveries });
}

/** A paid subscription whose invoice or email never happened is finished by
 *  the next retry once its lease is stale — as `settleOrder` does for orders.
 *  Those paid before the lease existed are left alone. */
async function resumeFinishing(sub: Subscription, now: Date = new Date()): Promise<Subscription | null> {
  if (!sub.finishingAt || sub.finishedAt) return sub;
  if (now.getTime() - Date.parse(sub.finishingAt) < FINISH_LEASE_MS) return sub;
  if (!(await claimSubscriptionFinishing(sub, now.toISOString()))) return getSubscription(sub.id);
  return finishPaidSubscription(sub);
}

async function finishPaidSubscription(sub: Subscription): Promise<Subscription | null> {
  if (!sub.invoiceNo) {
    await setSubscriptionInvoiceNo(sub.id, await drawInvoiceNo(new Date(sub.paidAt ?? Date.now())));
  }
  const paid = await getSubscription(sub.id);
  if (paid) await sendSubscriptionConfirmation(paid);
  await markSubscriptionFinished(sub.id, new Date().toISOString());
  return getSubscription(sub.id);
}
