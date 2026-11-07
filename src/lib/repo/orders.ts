import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import { CounterEntity, OrderEntity, PaymentEntity } from "@/lib/db/entities";
import type { CreditNote, Order, OrderLine, StockTaken } from "@/lib/orders/order";
import type { GatewayName, PaymentAttempt } from "@/lib/payments";
import type { OrderStatus, OrderSummary } from "@/lib/types";
import { ordersPerProduct } from "@/lib/orders/popularity";
import { SOLD_STATUSES, seedGramsByKey } from "@/lib/seeds/best-sellers";

/**
 * Orders and payment events — SPEC §4, §9. The key layout is in
 * src/lib/db/entities.ts; this file is the access patterns.
 */

type OrderRow = EntityItem<typeof OrderEntity>;

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email ?? null,
    status: row.status,
    lines: row.lines.map((l): OrderLine => ({
      kind: l.kind,
      key: l.key,
      name: l.name,
      units: l.units,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      grams: l.grams ?? null,
      readyDate: l.readyDate,
      sourcing: l.sourcing ?? null,
      parts: l.parts ?? null,
    })),
    total: row.total,
    deliveryCharge: row.deliveryCharge ?? 0,
    deliveryMethod: row.deliveryMethod ?? null,
    shippingQuote: row.shippingQuote ?? null,
    shipments: (row.shipments ?? []).map((x) => ({
      ...x,
      quote: x.quote ?? null,
      trackingNumber: x.trackingNumber ?? null,
      bookingStartedAt: x.bookingStartedAt ?? null,
      booking: x.booking ?? null,
    })),
    deliveryDate: row.deliveryDate,
    address: row.address,
    locale: row.locale,
    provider: row.provider,
    providerOrderId: row.providerOrderId ?? null,
    receiptNo: row.receiptNo ?? null,
    invoiceNo: row.invoiceNo ?? null,
    tax: row.tax ?? null,
    placeOfSupply: row.placeOfSupply ?? null,
    buyer: row.buyer ?? null,
    creditNote: row.creditNote ?? null,
    paidAt: row.paidAt ?? null,
    stockTaken: row.stockTaken ?? null,
    finishingAt: row.finishingAt ?? null,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}

/** DynamoDB has no null, so absent optionals are left off rather than
 *  written as null. */
function toRow(o: Order) {
  return {
    id: o.id,
    userId: o.userId,
    ...(o.email ? { email: o.email } : {}),
    status: o.status,
    lines: o.lines.map((l) => ({
      kind: l.kind,
      key: l.key,
      name: l.name,
      units: l.units,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      ...(l.grams !== null ? { grams: l.grams } : {}),
      readyDate: l.readyDate,
      ...(l.sourcing ? { sourcing: l.sourcing } : {}),
      ...(l.parts ? { parts: l.parts } : {}),
    })),
    total: o.total,
    deliveryCharge: o.deliveryCharge,
    ...(o.deliveryMethod ? { deliveryMethod: o.deliveryMethod } : {}),
    ...(o.shippingQuote ? { shippingQuote: o.shippingQuote } : {}),
    ...(o.shipments.length > 0 ? { shipments: o.shipments.map(toShipmentRow) } : {}),
    deliveryDate: o.deliveryDate,
    address: o.address,
    locale: o.locale,
    provider: o.provider,
    ...(o.providerOrderId ? { providerOrderId: o.providerOrderId } : {}),
    ...(o.receiptNo !== null ? { receiptNo: o.receiptNo } : {}),
    ...(o.invoiceNo ? { invoiceNo: o.invoiceNo } : {}),
    ...(o.tax ? { tax: o.tax } : {}),
    ...(o.placeOfSupply ? { placeOfSupply: o.placeOfSupply } : {}),
    ...(o.buyer ? { buyer: o.buyer } : {}),
    ...(o.creditNote ? { creditNote: o.creditNote } : {}),
    ...(o.paidAt ? { paidAt: o.paidAt } : {}),
    ...(o.stockTaken ? { stockTaken: o.stockTaken } : {}),
    ...(o.finishingAt ? { finishingAt: o.finishingAt } : {}),
    ...(o.finishedAt ? { finishedAt: o.finishedAt } : {}),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    expiresAt: o.expiresAt,
  };
}

/** `create`, not `put`: refuses to overwrite, so an id collision fails loudly
 *  instead of replacing somebody else's order. */
export async function createOrder(order: Order): Promise<void> {
  await OrderEntity.create(toRow(order)).go();
}

export async function getOrder(id: string): Promise<Order | null> {
  const { data } = await OrderEntity.get({ id }).go(READ_OPTS);
  return data ? toOrder(data) : null;
}

export async function setProviderOrderId(id: string, providerOrderId: string): Promise<void> {
  await OrderEntity.patch({ id }).set({ providerOrderId, updatedAt: new Date().toISOString() }).go();
}

/**
 * Store one gateway event. Returns false when it was already stored — the
 * gateway delivers at least once, and the return page may report the same
 * attempt the webhook just did.
 */
export async function recordPayment(
  attempt: PaymentAttempt,
  source: "webhook" | "return",
  provider: GatewayName,
): Promise<boolean> {
  try {
    await PaymentEntity.create({
      /* `cf_` rows predate Razorpay and keep their ids. A Razorpay payment id
         already reads `pay_…`, so its row reads `rzp_pay_…`. */
      id: `${provider === "cashfree" ? "cf" : "rzp"}_${attempt.providerPaymentId}_${attempt.status}`,
      orderId: attempt.orderId,
      provider,
      providerPaymentId: attempt.providerPaymentId,
      status: attempt.status,
      amount: attempt.amount,
      currency: attempt.currency,
      ...(attempt.method ? { method: attempt.method } : {}),
      ...(attempt.at ? { at: attempt.at } : {}),
      source,
      receivedAt: new Date().toISOString(),
    }).go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

export type StoredPayment = {
  id: string;
  status: PaymentAttempt["status"];
  amount: number;
  method: string | null;
  at: string | null;
  source: "webhook" | "return";
  receivedAt: string;
};

export async function listPayments(orderId: string): Promise<StoredPayment[]> {
  const { data } = await PaymentEntity.query.byOrder({ orderId }).go(LIST_OPTS);
  return data
    .map((p) => ({
      id: p.providerPaymentId,
      status: p.status,
      amount: p.amount,
      method: p.method ?? null,
      at: p.at ?? null,
      source: p.source,
      receivedAt: p.receivedAt,
    }))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

/**
 * Move an order from `pending_payment` to `paid`. **Returns true for exactly
 * one caller**, however many arrive at once: the write is conditional on the
 * status still being `pending_payment`, so when the webhook and the return
 * page race, one wins and the other gets false. Everything that must happen
 * once per paid order — drawing a receipt number, taking seed off the shelf —
 * happens only on true.
 *
 * Supplies `deliveryDate`, `userId` and `createdAt` because leaving
 * `pending_payment` is what puts the order into the sparse delivery-run and
 * customer-history indexes (see `OrderEntity`).
 */
/**
 * The payment write: one caller wins. It also takes the after-payment lease
 * (`finishingAt`), so the winner goes straight on to the invoice and stock,
 * and moves each parcel's date with the order's when payment landed a day
 * late — the parcels used to keep the old date (31 Oct 2026).
 */
export async function markOrderPaid(
  order: Order,
  paidAt: string,
  deliveryDate: string,
  shipments: Order["shipments"] = order.shipments,
): Promise<boolean> {
  try {
    await OrderEntity.patch({ id: order.id })
      .set({
        status: "paid",
        paidAt,
        deliveryDate,
        finishingAt: paidAt,
        ...(shipments.length > 0 ? { shipments: shipments.map(toShipmentRow) } : {}),
        userId: order.userId,
        createdAt: order.createdAt,
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

/**
 * Take over an unfinished order's after-payment lease, from whoever held it
 * at `order.finishingAt`. True for one caller only; the stale holder, if it
 * is still alive, loses its next conditional write instead of doubling one.
 */
export async function claimFinishing(order: Order, now: string): Promise<boolean> {
  if (!order.finishingAt) return false;
  try {
    await OrderEntity.patch({ id: order.id })
      .set({ finishingAt: now })
      .where((attr, { eq, notExists }) => `${eq(attr.finishingAt, order.finishingAt!)} AND ${notExists(attr.finishedAt)}`)
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

/** What has come off the shelf so far, written after each move so a retry
 *  carries on from the next one rather than taking any twice. */
export async function recordStockTaken(id: string, stockTaken: StockTaken[]): Promise<void> {
  await OrderEntity.patch({ id }).set({ stockTaken }).go();
}

export async function markOrderFinished(id: string, at: string): Promise<void> {
  await OrderEntity.patch({ id }).set({ finishedAt: at }).go();
}

/** Set the credit note once; false when the order already has one. */
export async function setCreditNote(id: string, creditNote: CreditNote): Promise<boolean> {
  try {
    await OrderEntity.patch({ id })
      .set({ creditNote, updatedAt: new Date().toISOString() })
      .where((attr, { notExists }) => notExists(attr.creditNote))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

/** Set a paid order's place of supply where checkout could not place its
 *  state (SPEC §26.2). Its rows are already inter-state, which every state
 *  but ours is, so only the reporting changes. */
export async function setPlaceOfSupply(
  id: string,
  placeOfSupply: { code: string; name: string },
): Promise<void> {
  await OrderEntity.patch({ id }).set({ placeOfSupply, updatedAt: new Date().toISOString() }).go();
}

/** Set the invoice number once. False when the order already has one, so a
 *  retry that lost a race never gives one order two invoices. */
export async function setInvoiceNo(id: string, invoiceNo: string): Promise<boolean> {
  try {
    await OrderEntity.patch({ id })
      .set({ invoiceNo, updatedAt: new Date().toISOString() })
      .where((attr, { notExists }) => notExists(attr.invoiceNo))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

/** The next number in a sequence, from an atomic `ADD`. The first call on a
 *  fresh table returns 1. */
export async function nextSequence(name: string): Promise<number> {
  const { data } = await CounterEntity.update({ name }).add({ value: 1 }).go({ response: "all_new" });
  if (typeof data.value !== "number") throw new Error(`Counter ${name} returned no value`);
  return data.value;
}

/**
 * Operator status move, conditional on the status still being `from` — two
 * admins pressing "picked" at once move it once.
 */
export async function advanceOrderStatus(order: Order, from: OrderStatus, to: OrderStatus): Promise<boolean> {
  try {
    await OrderEntity.patch({ id: order.id })
      .set({
        status: to,
        deliveryDate: order.deliveryDate,
        userId: order.userId,
        createdAt: order.createdAt,
        updatedAt: new Date().toISOString(),
      })
      .where(({ status }, { eq }) => eq(status, from))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

function toShipmentRow({
  quote,
  trackingNumber,
  bookingStartedAt,
  booking,
  ...x
}: Order["shipments"][number]) {
  return {
    ...x,
    ...(quote ? { quote } : {}),
    ...(trackingNumber ? { trackingNumber } : {}),
    ...(bookingStartedAt ? { bookingStartedAt } : {}),
    ...(booking ? { booking } : {}),
  };
}

/**
 * Record (or clear, with null) one parcel's tracking number, **conditional on
 * the order not having changed since it was read** (`updatedAt`) — the lock
 * `replaceShipment` uses. The whole list is written back, so without it a
 * tracking edit could write over a booking that landed in between. Returns
 * false when somebody else wrote first.
 *
 * Clearing a number also clears the booking made from here that gave it:
 * `bookingState` reads the number alone, so the parcel reads as unbooked
 * either way, and an old `booking` left on it is a record of a shipment the
 * owner has just said is not there. `bookingStartedAt` is left as it is —
 * null after a finished booking; set only when a number was typed over an
 * unfinished one, which the parcel goes back to (`stuck`, with its
 * check-the-dashboard warning) rather than to a plain "Book".
 */
export async function setShipmentTracking(
  order: Order,
  index: number,
  trackingNumber: string | null,
): Promise<boolean> {
  const cleared = { trackingNumber: null, booking: null };
  const shipments = order.shipments.map((x, i) =>
    i !== index ? x : { ...x, ...(trackingNumber === null ? cleared : { trackingNumber }) },
  );
  try {
    await OrderEntity.patch({ id: order.id })
      .set({
        shipments: shipments.map(toShipmentRow),
        deliveryDate: order.deliveryDate,
        userId: order.userId,
        createdAt: order.createdAt,
        updatedAt: new Date().toISOString(),
      })
      .where((attr, { eq }) => eq(attr.updatedAt, order.updatedAt))
      .go();
    return true;
  } catch (e) {
    if (isConditionFailure(e)) return false;
    throw e;
  }
}

function summarise(o: Order): OrderSummary {
  return {
    id: o.id,
    receiptNo: o.receiptNo,
    invoiceNo: o.invoiceNo,
    placedAt: o.paidAt ?? o.createdAt,
    deliveryDate: o.deliveryDate,
    status: o.status,
    /* Lines, not units: 200 g of one seed is one item, as the cart counts it. */
    itemCount: o.lines.length,
    total: o.total,
  };
}

/**
 * One customer's orders, newest first, from GSI3. Unpaid checkouts are not
 * in that index, so this is the orders they placed, not every time they
 * opened the payment screen.
 */
export async function listOrdersForUser(userId: string): Promise<OrderSummary[]> {
  const { data } = await OrderEntity.query.byUser({ userId }).go({ ...LIST_OPTS, order: "desc" });
  return data.map((row) => summarise(toOrder(row)));
}

/** The admin list for one status, newest first, from GSI2. */
export async function listOrdersByStatus(status: OrderStatus): Promise<Order[]> {
  const { data } = await OrderEntity.query.byStatus({ status }).go({ ...LIST_OPTS, order: "desc" });
  return data.map(toOrder);
}

/*
 * What has sold — grams of each seed for the home page's seed strip, and
 * orders per product for the search box's "Most ordered" row. Every sold
 * status is read, so this walks every order the shop has taken; one walk feeds
 * both tallies, kept for ten minutes per process so neither surface repeats it
 * for each visitor. A ranking that is ten minutes stale is not wrong in any
 * way a customer sees.
 *
 * The tallies are kept, not the orders: they stay a few hundred bytes however
 * many orders there are.
 */
const SALES_TTL_MS = 10 * 60_000;
type SalesTally = { seedGrams: Record<string, number>; ordersPerProduct: Record<string, number> };
let sales: { until: number; tally: Promise<SalesTally> } | null = null;

function salesTally(): Promise<SalesTally> {
  if (sales && sales.until > Date.now()) return sales.tally;
  const tally = Promise.all(SOLD_STATUSES.map((s) => listOrdersByStatus(s))).then((lists) => {
    const orders = lists.flat();
    return { seedGrams: seedGramsByKey(orders), ordersPerProduct: ordersPerProduct(orders) };
  });
  sales = { until: Date.now() + SALES_TTL_MS, tally };
  /* A failed read is not kept: the next visitor asks again. */
  tally.catch(() => {
    sales = null;
  });
  return tally;
}

export function seedGramsSold(): Promise<Record<string, number>> {
  return salesTally().then((s) => s.seedGrams);
}

/** Paid orders that included each product, keyed `kind:key`. */
export function ordersPerProductSold(): Promise<Record<string, number>> {
  return salesTally().then((s) => s.ordersPerProduct);
}

/**
 * Replace one parcel, **conditional on the order not having changed since it
 * was read** (`updatedAt`). This is the booking lock: two presses of "Book"
 * read the same order, the first write wins, and the second is refused before
 * it reaches the courier — so a parcel is never booked, and paid for, twice.
 * Returns the order as written, or null when somebody else wrote first.
 */
export async function replaceShipment(
  order: Order,
  index: number,
  shipment: Order["shipments"][number],
): Promise<Order | null> {
  const shipments = order.shipments.map((x, i) => (i === index ? shipment : x));
  const updatedAt = new Date().toISOString();
  try {
    await OrderEntity.patch({ id: order.id })
      .set({
        shipments: shipments.map(toShipmentRow),
        deliveryDate: order.deliveryDate,
        userId: order.userId,
        createdAt: order.createdAt,
        updatedAt,
      })
      .where((attr, { eq }) => eq(attr.updatedAt, order.updatedAt))
      .go();
    return { ...order, shipments, updatedAt };
  } catch (e) {
    if (isConditionFailure(e)) return null;
    throw e;
  }
}
