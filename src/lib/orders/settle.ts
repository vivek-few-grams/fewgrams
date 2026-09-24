import { paymentProvider, type PaymentProvider } from "@/lib/payments";
import {
  getOrder,
  markOrderPaid,
  nextSequence,
  recordPayment,
  setReceiptNo,
} from "@/lib/repo/orders";
import { takeFromShelf } from "@/lib/repo/seeds";
import { settlementFor, shiftForPaymentDay, type Order } from "./order";

/**
 * Bring one order up to date with the gateway — SPEC §9.
 *
 * Called by the return route and by the webhook, which are the two ways we
 * hear that something happened. **Neither is believed.** Both only name an
 * order; this fetches the gateway's view of it server to server, stores
 * every attempt it reports, and pays the order only if `settlementFor` says
 * so.
 *
 * Safe to call any number of times, concurrently. `markOrderPaid` returns
 * true for one caller only, and the once-per-order work — the receipt
 * number, drawing seed off the shelf — sits behind it.
 */
export async function settleOrder(
  orderId: string,
  source: "webhook" | "return",
  provider: PaymentProvider | null = paymentProvider(),
): Promise<Order | null> {
  const order = await getOrder(orderId);
  if (!order || order.status !== "pending_payment") return order;
  if (!provider) return order;

  const gateway = await provider.fetchOrder(orderId);
  for (const attempt of gateway.attempts) await recordPayment(attempt, source);

  const settlement = settlementFor(order, gateway);
  if (settlement.action === "mismatch") {
    console.error(
      `[payments] ${orderId}: gateway reports ₹${settlement.attempt.amount} ${settlement.attempt.currency} paid against a ₹${order.total} order; left unpaid for review`,
    );
    return order;
  }
  if (settlement.action !== "pay") return order;

  const now = new Date();
  const deliveryDate = shiftForPaymentDay(order.deliveryDate, new Date(order.createdAt), now);
  if (!(await markOrderPaid(order, now.toISOString(), deliveryDate))) return getOrder(orderId);

  await setReceiptNo(orderId, await nextSequence("receipt"));

  /* After the payment is recorded, and never able to undo it: a shelf that
     turns out shorter than it was at checkout means part of the seed comes
     from the vendor, not that the order is refused (SPEC §22.2). */
  for (const line of order.lines) {
    if (line.kind !== "seed" || line.grams === null) continue;
    try {
      const taken = await takeFromShelf(line.key, line.grams);
      if (taken < line.grams) {
        console.warn(
          `[stock] ${orderId}: ${line.key} shelf held ${taken} g of ${line.grams} g; the rest is a vendor order`,
        );
      }
    } catch (e) {
      console.error(`[stock] ${orderId}: could not draw down ${line.key}`, e);
    }
  }

  return getOrder(orderId);
}
