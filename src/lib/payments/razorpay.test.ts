import { afterEach, describe, expect, it, vi } from "vitest";
import { RazorpayProvider, razorpayMode, razorpaySignature, toPaise } from "./razorpay";

const WEBHOOK_SECRET = "whsec-test";
const provider = new RazorpayProvider("rzp_test_abc", "key-secret", WEBHOOK_SECRET);

/** Trimmed from the documented payment.captured payload. */
const capturedBody = JSON.stringify({
  entity: "event",
  event: "payment.captured",
  contains: ["payment"],
  payload: {
    payment: {
      entity: { id: "pay_1", status: "captured", order_id: "order_1", amount: 45000, notes: { order_id: "FGABC123" } },
    },
  },
});

const signed = (body: string, secret = WEBHOOK_SECRET) =>
  new Headers({ "x-razorpay-signature": razorpaySignature(body, secret) });

describe("mode", () => {
  it("is read off the key", () => {
    expect(razorpayMode("rzp_test_x")).toBe("sandbox");
    expect(razorpayMode("rzp_live_x")).toBe("production");
    expect(razorpayMode("x")).toBeNull();
  });

  it("refuses a key that is neither", () => {
    expect(() => new RazorpayProvider("abc", "s", null)).toThrow();
  });
});

describe("webhook signature", () => {
  it("accepts a body signed with the webhook secret", () => {
    expect(provider.verifyWebhook(capturedBody, signed(capturedBody))).toBe(true);
  });

  it("rejects a body altered after signing", () => {
    const headers = signed(capturedBody);
    expect(provider.verifyWebhook(capturedBody.replace("45000", "100"), headers)).toBe(false);
  });

  it("rejects a body signed with the API key secret instead", () => {
    expect(provider.verifyWebhook(capturedBody, signed(capturedBody, "key-secret"))).toBe(false);
  });

  it("refuses every webhook when no webhook secret is set", () => {
    const unset = new RazorpayProvider("rzp_test_abc", "key-secret", null);
    expect(unset.verifyWebhook(capturedBody, signed(capturedBody))).toBe(false);
  });
});

describe("webhookOrderId", () => {
  it("reads our id from the payment's notes", () => {
    expect(provider.webhookOrderId(capturedBody)).toBe("FGABC123");
  });

  it("falls back to the order's receipt when notes are empty", () => {
    const body = JSON.stringify({
      event: "order.paid",
      payload: { payment: { entity: { notes: [] } }, order: { entity: { receipt: "FGXYZ789" } } },
    });
    expect(provider.webhookOrderId(body)).toBe("FGXYZ789");
  });

  it("ignores events that are not about a payment", () => {
    expect(provider.webhookOrderId(JSON.stringify({ event: "refund.created", payload: {} }))).toBeNull();
    expect(provider.webhookOrderId("not json")).toBeNull();
  });
});

describe("API calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(routes: Record<string, unknown>) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const path = url.replace("https://api.razorpay.com/v1", "");
        calls.push({ method: init.method!, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
        const key = `${init.method} ${path}`;
        const next = routes[key];
        const value = Array.isArray(next) ? next.shift() : next;
        return new Response(JSON.stringify(value ?? {}), { status: value === undefined ? 404 : 200 });
      }),
    );
    return calls;
  }

  it("opens an order in paise, with our id as the receipt", async () => {
    const calls = stub({ "POST /orders": { id: "order_1", amount: 45000, currency: "INR" } });
    const created = await provider.createOrder({
      orderId: "FGABC123",
      amount: 450,
      customer: { id: "u", phone: "9845012345", email: "a@b.in", name: "Asha" },
      returnUrl: "https://fewgrams.com/api/payments/return/en",
      notifyUrl: null,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    expect(calls[0].body).toEqual({ amount: 45000, currency: "INR", receipt: "FGABC123", notes: { order_id: "FGABC123" } });
    expect(created.providerOrderId).toBe("order_1");
    expect(created.checkout).toMatchObject({
      gateway: "razorpay",
      keyId: "rzp_test_abc",
      razorpayOrderId: "order_1",
      amountPaise: 45000,
      returnUrl: "https://fewgrams.com/api/payments/return/en?order_id=FGABC123",
    });
  });

  it("captures an authorized payment for the order's amount, then reports it paid", async () => {
    const calls = stub({
      "GET /orders/order_1": [
        { id: "order_1", amount: 45000, currency: "INR", status: "attempted" },
        { id: "order_1", amount: 45000, currency: "INR", status: "paid" },
      ],
      "GET /orders/order_1/payments": [
        { items: [{ id: "pay_1", amount: 45000, currency: "INR", status: "authorized", method: "upi" }] },
        { items: [{ id: "pay_1", amount: 45000, currency: "INR", status: "captured", method: "upi", created_at: 1758860000 }] },
      ],
      "POST /payments/pay_1/capture": { id: "pay_1", status: "captured" },
    });
    const result = await provider.fetchOrder({ orderId: "FGABC123", providerOrderId: "order_1" });
    expect(calls.find((c) => c.path === "/payments/pay_1/capture")?.body).toEqual({ amount: 45000, currency: "INR" });
    expect(result.status).toBe("paid");
    expect(result.attempts).toEqual([
      expect.objectContaining({ providerPaymentId: "pay_1", orderId: "FGABC123", status: "success", amount: 450, method: "upi" }),
    ]);
  });

  it("does not capture a payment for a different amount", async () => {
    const calls = stub({
      "GET /orders/order_1": { id: "order_1", amount: 45000, currency: "INR", status: "attempted" },
      "GET /orders/order_1/payments": { items: [{ id: "pay_1", amount: 100, currency: "INR", status: "authorized" }] },
    });
    const result = await provider.fetchOrder({ orderId: "FGABC123", providerOrderId: "order_1" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(result.status).toBe("active");
    expect(result.attempts[0].status).toBe("pending");
  });

  it("treats an order with no Razorpay id as open and asks nothing", async () => {
    const calls = stub({});
    expect(await provider.fetchOrder({ orderId: "FGABC123", providerOrderId: null })).toEqual({ status: "active", attempts: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("toPaise", () => {
  it("converts whole and fractional rupees", () => {
    expect(toPaise(450)).toBe(45000);
    expect(toPaise(123.45)).toBe(12345);
  });
});
