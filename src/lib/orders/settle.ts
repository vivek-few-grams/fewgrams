import { paymentProvider, type PaymentProvider } from "@/lib/payments";
import {
  getOrder,
  markOrderPaid,
  nextSequence,
  recordPayment,
  setReceiptNo,
} from "@/lib/repo/orders";
import { takeFromShelf } from "@/lib/repo/seeds";
import { takeFromStock as takeTraysFromStock } from "@/lib/repo/trays";
import { takeFromStock as takeMediaFromStock } from "@/lib/repo/grow-media";
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
  /* An order is settled by the gateway it was opened with. After a switch,
     an unpaid order from the old one is left to expire rather than asked of
     a gateway that has never heard of it. */
  if (order.provider !== provider.name) return order;

  const gateway = await provider.fetchOrder({ orderId, providerOrderId: order.providerOrderId });
  for (const attempt of gateway.attempts) await recordPayment(attempt, source, provider.name);

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

  /* After the payment is recorded, and never able to undo it. Seeds are
     capped at the shelf at checkout, so a shortfall means two orders for the
     last of it were paid at once; trays and grow media may be ordered past
     what is held, and the rest is brought in overnight (SPEC §22.2, §23.1). */
  for (const line of order.lines) {
    try {
      if (line.kind === "seed" && line.grams !== null) {
        const taken = await takeFromShelf(line.key, line.grams);
        if (taken < line.grams) {
          console.warn(`[stock] ${orderId}: ${line.key} shelf held ${taken} g of ${line.grams} g — short, sort it out by hand`);
        }
      } else if (line.kind === "tray" || line.kind === "media") {
        const taken = await (line.kind === "tray" ? takeTraysFromStock : takeMediaFromStock)(line.key, line.units);
        if (taken < line.units) {
          console.info(`[stock] ${orderId}: ${line.key} held ${taken} of ${line.units}; order ${line.units - taken} from the vendor`);
        }
      }
    } catch (e) {
      console.error(`[stock] ${orderId}: could not draw down ${line.key}`, e);
    }
  }

  return getOrder(orderId);
}
