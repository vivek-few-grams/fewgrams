import { paymentProvider, type PaymentProvider } from "@/lib/payments";
import {
  claimFinishing,
  getOrder,
  markOrderFinished,
  markOrderPaid,
  nextSequence,
  recordPayment,
  recordStockTaken,
  setInvoiceNo,
} from "@/lib/repo/orders";
import { takeFromShelf } from "@/lib/repo/seeds";
import { takeFromStock as takeTraysFromStock } from "@/lib/repo/trays";
import { takeFromStock as takeMediaFromStock } from "@/lib/repo/grow-media";
import { financialYear, formatInvoiceNo, invoiceCounter } from "@/lib/tax/order-tax";
import { sendOrderConfirmation } from "@/lib/notify/order-email";
import { settlementFor, shiftForPaymentDay, type Order, type StockTaken } from "./order";
import { stockMoves } from "./stock-moves";

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
 * true for one caller only, and the once-per-order work — the invoice
 * number, the stock, the confirmation email — sits behind it, leased so
 * that a run cut short is finished by the next call (`resumeFinishing`).
 */
export async function settleOrder(
  orderId: string,
  source: "webhook" | "return",
  provider: PaymentProvider | null = paymentProvider(),
): Promise<Order | null> {
  const order = await getOrder(orderId);
  if (!order) return null;
  if (order.status !== "pending_payment") return resumeFinishing(order);
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
  const createdAt = new Date(order.createdAt);
  const deliveryDate = shiftForPaymentDay(order.deliveryDate, createdAt, now);
  const shipments = order.shipments.map((x) => ({
    ...x,
    deliveryDate: shiftForPaymentDay(x.deliveryDate, createdAt, now),
  }));
  if (!(await markOrderPaid(order, now.toISOString(), deliveryDate, shipments))) return getOrder(orderId);

  return finishPaidOrder({ ...order, paidAt: now.toISOString(), deliveryDate, shipments });
}

/** How long a caller holds the after-payment lease before a retry may take
 *  it over. The work takes seconds; a holder this late has died. */
export const FINISH_LEASE_MS = 2 * 60 * 1000;

/**
 * A paid order whose after-payment work never completed — the Lambda timed
 * out, DynamoDB threw — is finished by the next webhook retry or return-page
 * load (31 Oct 2026). Before, the retry saw "already paid" and stopped, and
 * the order stayed with no invoice, out of the GST returns, its stock never
 * taken. Orders paid before the lease existed have no `finishingAt` and are
 * left alone.
 */
async function resumeFinishing(order: Order, now: Date = new Date()): Promise<Order | null> {
  if (!order.finishingAt || order.finishedAt) return order;
  if (now.getTime() - Date.parse(order.finishingAt) < FINISH_LEASE_MS) return order;
  if (!(await claimFinishing(order, now.toISOString()))) return getOrder(order.id);
  return finishPaidOrder(order);
}

/**
 * The once-per-order work after payment, by whoever holds the lease: the
 * invoice number, the stock, the confirmation email. Each step records what
 * it did before the next, so a resumed run picks up where the last stopped.
 * Throws on a storage error so the webhook answers 500 and is retried.
 */
async function finishPaidOrder(order: Order): Promise<Order | null> {
  const paidAt = new Date(order.paidAt ?? Date.now());

  let invoiceNo = order.invoiceNo;
  if (!invoiceNo) {
    const drawn = await drawInvoiceNo(paidAt);
    /* Conditional: a holder whose lease was taken over may still get here.
       Its number is then the series' only gap, and no order has two. */
    if (await setInvoiceNo(order.id, drawn)) invoiceNo = drawn;
  }

  /* After the payment is recorded, and never able to undo it. Seeds are
     capped at the shelf at checkout, so a shortfall means two orders for the
     last of it were paid at once; trays and grow media may be ordered past
     what is held, and go below zero by what is owed (SPEC §22.2, §23.1).
     A starter pack's parts move the same way (`stockMoves`, SPEC §29.5).
     What came off is recorded move by move, for a cancel and for a retry. */
  const taken: StockTaken[] = [...(order.stockTaken ?? [])];
  const moves = stockMoves(order.lines);
  for (const move of moves.slice(taken.length)) {
    if (move.kind === "seed") {
      const grams = await takeFromShelf(move.key, move.grams);
      if (grams < move.grams) {
        console.warn(`[stock] ${order.id}: ${move.key} shelf held ${grams} g of ${move.grams} g — short, sort it out by hand`);
      }
      taken.push({ kind: "seed", key: move.key, amount: grams });
    } else {
      const units = await (move.kind === "tray" ? takeTraysFromStock : takeMediaFromStock)(move.key, move.units);
      taken.push({ kind: move.kind, key: move.key, amount: units });
    }
    await recordStockTaken(order.id, taken);
  }

  const finished = (await getOrder(order.id)) ?? { ...order, invoiceNo, stockTaken: taken };
  await sendOrderConfirmation(finished);
  await markOrderFinished(order.id, new Date().toISOString());
  return getOrder(order.id);
}

/**
 * The next invoice number for the financial year `paidAt` falls in — SPEC
 * §26.3. One gapless series per year, shared by orders and subscriptions,
 * and drawn only by the caller that won the payment write.
 */
export async function drawInvoiceNo(paidAt: Date): Promise<string> {
  const fy = financialYear(paidAt);
  return formatInvoiceNo(fy, await nextSequence(invoiceCounter(fy)));
}
