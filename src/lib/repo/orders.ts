import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS, isConditionFailure } from "@/lib/db/client";
import { CounterEntity, OrderEntity, PaymentEntity } from "@/lib/db/entities";
import type { Order, OrderLine } from "@/lib/orders/order";
import type { GatewayName, PaymentAttempt } from "@/lib/payments";
import type { OrderStatus, OrderSummary } from "@/lib/types";
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
    lines: row.lines.map(
      (l): OrderLine => ({
        kind: l.kind,
        key: l.key,
        name: l.name,
        units: l.units,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        grams: l.grams ?? null,
        readyDate: l.readyDate,
        sourcing: l.sourcing ?? null,
      }),
    ),
    total: row.total,
    deliveryCharge: row.deliveryCharge ?? 0,
    deliveryMethod: row.deliveryMethod ?? null,
    shippingQuote: row.shippingQuote ?? null,
    shipments: (row.shipments ?? []).map((x) => ({ ...x, quote: x.quote ?? null })),
    deliveryDate: row.deliveryDate,
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
    })),
    total: o.total,
    deliveryCharge: o.deliveryCharge,
    ...(o.deliveryMethod ? { deliveryMethod: o.deliveryMethod } : {}),
    ...(o.shippingQuote ? { shippingQuote: o.shippingQuote } : {}),
    ...(o.shipments.length > 0
      ? { shipments: o.shipments.map(({ quote, ...x }) => ({ ...x, ...(quote ? { quote } : {}) })) }
      : {}),
    deliveryDate: o.deliveryDate,
    address: o.address,
    locale: o.locale,
    provider: o.provider,
    ...(o.providerOrderId ? { providerOrderId: o.providerOrderId } : {}),
    ...(o.receiptNo !== null ? { receiptNo: o.receiptNo } : {}),
    ...(o.paidAt ? { paidAt: o.paidAt } : {}),
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
  await OrderEntity.patch({ id })
    .set({ providerOrderId, updatedAt: new Date().toISOString() })
    .go();
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
export async function markOrderPaid(
  order: Order,
  paidAt: string,
  deliveryDate: string,
): Promise<boolean> {
  try {
    await OrderEntity.patch({ id: order.id })
      .set({
        status: "paid",
        paidAt,
        deliveryDate,
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

export async function setReceiptNo(id: string, receiptNo: number): Promise<void> {
  await OrderEntity.patch({ id })
    .set({ receiptNo, updatedAt: new Date().toISOString() })
    .go();
}

/** The next number in a sequence, from an atomic `ADD`. The first call on a
 *  fresh table returns 1. */
export async function nextSequence(name: string): Promise<number> {
  const { data } = await CounterEntity.update({ name })
    .add({ value: 1 })
    .go({ response: "all_new" });
  if (typeof data.value !== "number") throw new Error(`Counter ${name} returned no value`);
  return data.value;
}

/**
 * Operator status move, conditional on the status still being `from` — two
 * admins pressing "picked" at once move it once.
 */
export async function advanceOrderStatus(
  order: Order,
  from: OrderStatus,
  to: OrderStatus,
): Promise<boolean> {
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

function summarise(o: Order): OrderSummary {
  return {
    id: o.id,
    receiptNo: o.receiptNo,
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
  const { data } = await OrderEntity.query
    .byUser({ userId })
    .go({ ...LIST_OPTS, order: "desc" });
  return data.map((row) => summarise(toOrder(row)));
}

/** The admin list for one status, newest first, from GSI2. */
export async function listOrdersByStatus(status: OrderStatus): Promise<Order[]> {
  const { data } = await OrderEntity.query
    .byStatus({ status })
    .go({ ...LIST_OPTS, order: "desc" });
  return data.map(toOrder);
}

/*
 * Grams of each seed sold, for the home page's seed strip. Every sold status
 * is read, so this walks every order the shop has taken; kept for ten minutes
 * per process so the home page does not repeat that walk for each visitor. A
 * ranking that is ten minutes stale is not wrong in any way a customer sees.
 */
const SEED_SALES_TTL_MS = 10 * 60_000;
let seedSales: { until: number; grams: Promise<Record<string, number>> } | null = null;

export function seedGramsSold(): Promise<Record<string, number>> {
  if (seedSales && seedSales.until > Date.now()) return seedSales.grams;
  const grams = Promise.all(SOLD_STATUSES.map((s) => listOrdersByStatus(s))).then((lists) =>
    seedGramsByKey(lists.flat()),
  );
  seedSales = { until: Date.now() + SEED_SALES_TTL_MS, grams };
  /* A failed read is not kept: the next visitor asks again. */
  grams.catch(() => {
    seedSales = null;
  });
  return grams;
}
