import { beforeEach, describe, expect, it, vi } from "vitest";

/* The handler's answers decide whether the gateway retries, which is the only
   thing that finishes a paid order whose after-payment work died (8 Nov 2026). */
const state = vi.hoisted(() => ({
  settled: null as null | { finishingAt: string | null; finishedAt: string | null },
  throws: false,
}));

vi.mock("@/lib/payments", () => ({
  paymentProvider: () => ({
    name: "razorpay",
    verifyWebhook: () => true,
    webhookOrderId: () => "FGTEST123456",
  }),
}));
vi.mock("@/lib/orders/settle", () => ({
  settleOrder: async () => {
    if (state.throws) throw new Error("DynamoDB is having a moment");
    return state.settled;
  },
}));
vi.mock("@/lib/subscriptions/settle", () => ({ settleSubscription: async () => null }));

const { handlePaymentWebhook } = await import("./webhook");
const post = () =>
  handlePaymentWebhook("razorpay", new Request("https://x/api", { method: "POST", body: "{}" }));

beforeEach(() => {
  state.settled = null;
  state.throws = false;
});

describe("handlePaymentWebhook — when the gateway is asked to retry", () => {
  it("acknowledges a settled, finished order", async () => {
    state.settled = { finishingAt: "2026-11-08T10:00:00Z", finishedAt: "2026-11-08T10:00:01Z" };
    expect((await post()).status).toBe(200);
  });

  it("asks for a retry while the order is paid but its work is unfinished", async () => {
    state.settled = { finishingAt: "2026-11-08T10:00:00Z", finishedAt: null };
    expect((await post()).status).toBe(503);
  });

  it("acknowledges an unpaid order and one paid before the lease existed", async () => {
    state.settled = { finishingAt: null, finishedAt: null };
    expect((await post()).status).toBe(200);
  });

  it("asks for a retry when settling threw", async () => {
    state.throws = true;
    expect((await post()).status).toBe(500);
  });
});
