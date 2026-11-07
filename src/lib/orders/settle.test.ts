import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider } from "@/lib/payments";
import type { Order, OrderLine, StockTaken } from "./order";

/* An in-memory order table and shelf, so settlement can be run end to end
   without DynamoDB: the conditional writes behave as the real ones do. */
const db = vi.hoisted(() => ({
  orders: new Map<string, Order>(),
  shelf: new Map<string, number>(),
  counter: 0,
  emails: [] as string[],
  /** A stock key whose next take throws, as a DynamoDB error would. */
  failOnce: new Set<string>(),
}));

vi.mock("@/lib/repo/orders", () => ({
  getOrder: async (id: string) => structuredClone(db.orders.get(id) ?? null),
  recordPayment: async () => {},
  nextSequence: async () => ++db.counter,
  markOrderPaid: async (o: Order, paidAt: string, deliveryDate: string, shipments: Order["shipments"]) => {
    const row = db.orders.get(o.id)!;
    if (row.status !== "pending_payment") return false;
    Object.assign(row, { status: "paid", paidAt, deliveryDate, shipments, finishingAt: paidAt });
    return true;
  },
  claimFinishing: async (o: Order, now: string) => {
    const row = db.orders.get(o.id)!;
    if (row.finishingAt !== o.finishingAt || row.finishedAt) return false;
    row.finishingAt = now;
    return true;
  },
  setInvoiceNo: async (id: string, invoiceNo: string) => {
    const row = db.orders.get(id)!;
    if (row.invoiceNo) return false;
    row.invoiceNo = invoiceNo;
    return true;
  },
  recordStockTaken: async (id: string, taken: StockTaken[]) => {
    db.orders.get(id)!.stockTaken = structuredClone(taken);
  },
  markOrderFinished: async (id: string, at: string) => {
    db.orders.get(id)!.finishedAt = at;
  },
}));
vi.mock("@/lib/repo/seeds", () => ({
  takeFromShelf: async (key: string, grams: number) => {
    const held = db.shelf.get(`seed:${key}`) ?? 0;
    const take = Math.max(0, Math.min(grams, held));
    db.shelf.set(`seed:${key}`, held - take);
    return take;
  },
}));
const takeAll = (kind: string) => async (key: string, units: number) => {
  if (db.failOnce.delete(key)) throw new Error("DynamoDB is having a moment");
  db.shelf.set(`${kind}:${key}`, (db.shelf.get(`${kind}:${key}`) ?? 0) - units);
  return units;
};
vi.mock("@/lib/repo/trays", () => ({ takeFromStock: takeAll("tray") }));
vi.mock("@/lib/repo/grow-media", () => ({ takeFromStock: takeAll("media") }));
vi.mock("@/lib/notify/order-email", () => ({
  sendOrderConfirmation: async (o: Order) => void db.emails.push(`${o.id}:${o.invoiceNo}`),
}));
vi.mock("@/lib/payments", () => ({ paymentProvider: () => null }));

const { settleOrder, FINISH_LEASE_MS } = await import("./settle");

const line = (kind: OrderLine["kind"], key: string, units: number, grams: number | null = null): OrderLine => ({
  kind,
  key,
  name: key,
  units,
  unitPrice: 100,
  lineTotal: 100 * units,
  grams,
  readyDate: "2026-11-01",
  sourcing: null,
  parts: null,
});

function pending(id: string, lines: OrderLine[]): Order {
  return {
    id,
    userId: "u1",
    email: "a@b.in",
    status: "pending_payment",
    lines,
    total: 500,
    deliveryCharge: 0,
    deliveryMethod: "courier",
    shippingQuote: null,
    shipments: [],
    deliveryDate: "2026-11-08",
    address: {} as Order["address"],
    locale: "en",
    provider: "razorpay",
    providerOrderId: "order_x",
    receiptNo: null,
    invoiceNo: null,
    tax: null,
    placeOfSupply: null,
    buyer: null,
    creditNote: null,
    paidAt: null,
    stockTaken: null,
    finishingAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };
}

const gateway = (id: string): PaymentProvider =>
  ({
    name: "razorpay",
    fetchOrder: async () => ({
      status: "paid",
      attempts: [{ providerPaymentId: "pay_1", orderId: id, status: "success", amount: 500, currency: "INR", method: null }],
    }),
  }) as unknown as PaymentProvider;

beforeEach(() => {
  db.orders.clear();
  db.shelf.clear();
  db.counter = 0;
  db.emails = [];
  db.failOnce.clear();
});

describe("settleOrder — after payment", () => {
  it("takes the whole order off stock, below zero where it is owed, and records what came off", async () => {
    db.orders.set("FG1", pending("FG1", [line("media", "coir", 3), line("seed", "dill", 1, 100)]));
    db.shelf.set("media:coir", 1);
    db.shelf.set("seed:dill", 75);

    const paid = await settleOrder("FG1", "return", gateway("FG1"));

    expect(db.shelf.get("media:coir")).toBe(-2);
    expect(paid!.stockTaken).toEqual([
      { kind: "media", key: "coir", amount: 3 },
      { kind: "seed", key: "dill", amount: 75 },
    ]);
    expect(paid!.invoiceNo).toMatch(/\/00001$/);
    expect(paid!.finishedAt).not.toBeNull();
    expect(db.emails).toEqual([`FG1:${paid!.invoiceNo}`]);
  });

  it("is finished by a later retry when the first run died part-way, taking nothing twice", async () => {
    db.orders.set("FG2", pending("FG2", [line("tray", "pair", 1), line("media", "coir", 2)]));
    db.shelf.set("tray:pair", 5);
    db.shelf.set("media:coir", 5);

    // The first move lands, then storage throws on the second.
    db.failOnce.add("coir");
    await expect(settleOrder("FG2", "webhook", gateway("FG2"))).rejects.toThrow();
    const original = db.orders.get("FG2")!;
    expect(original.status).toBe("paid");
    expect(original.stockTaken).toEqual([{ kind: "tray", key: "pair", amount: 1 }]);
    expect(original.finishedAt).toBeNull();

    // The webhook is retried within the lease: left to the holder.
    await settleOrder("FG2", "webhook", gateway("FG2"));
    expect(db.orders.get("FG2")!.finishedAt).toBeNull();

    // Once the lease is stale, the retry finishes it.
    db.orders.get("FG2")!.finishingAt = new Date(Date.now() - FINISH_LEASE_MS - 1000).toISOString();
    const done = await settleOrder("FG2", "webhook", gateway("FG2"));
    expect(done!.finishedAt).not.toBeNull();
    expect(db.shelf.get("tray:pair")).toBe(4);
    expect(db.shelf.get("media:coir")).toBe(3);
    expect(db.counter).toBe(1);
    expect(db.emails).toHaveLength(1);
  });

  it("leaves an order paid before the lease existed alone", async () => {
    db.orders.set("FG3", { ...pending("FG3", [line("tray", "pair", 1)]), status: "paid", invoiceNo: null });
    db.shelf.set("tray:pair", 5);
    await settleOrder("FG3", "webhook", gateway("FG3"));
    expect(db.shelf.get("tray:pair")).toBe(5);
    expect(db.counter).toBe(0);
  });
});
