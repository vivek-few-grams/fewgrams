import { describe, expect, it } from "vitest";
import { CashfreeProvider, cashfreeCustomerId, cashfreeSignature } from "./cashfree";

const SECRET = "test-secret";
const provider = new CashfreeProvider("test-id", SECRET, "sandbox");

/** Trimmed from the documented 2025-01-01 success webhook. */
const successBody = JSON.stringify({
  data: {
    order: { order_id: "FGABC123", order_amount: 450, order_currency: "INR" },
    payment: {
      cf_payment_id: "1453002795",
      payment_status: "SUCCESS",
      payment_amount: 450,
      payment_currency: "INR",
      payment_time: "2026-09-23T12:20:29+05:30",
      payment_group: "upi",
    },
  },
  event_time: "2026-09-23T12:20:30+05:30",
  type: "PAYMENT_SUCCESS_WEBHOOK",
});

function signed(body: string, timestamp = "1758610229") {
  return new Headers({
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": cashfreeSignature(timestamp, body, SECRET),
  });
}

describe("webhook signature", () => {
  it("accepts a body signed with the client secret", () => {
    expect(provider.verifyWebhook(successBody, signed(successBody))).toBe(true);
  });

  it("rejects a body altered after signing", () => {
    const headers = signed(successBody);
    const tampered = successBody.replace('"payment_amount":450', '"payment_amount":1');
    expect(provider.verifyWebhook(tampered, headers)).toBe(false);
  });

  it("rejects a signature over re-serialised JSON", () => {
    // The raw body is what Cashfree signs; pretty-printing it changes the bytes.
    const reformatted = JSON.stringify(JSON.parse(successBody), null, 2);
    expect(provider.verifyWebhook(reformatted, signed(successBody))).toBe(false);
  });

  it("rejects a moved timestamp", () => {
    const headers = signed(successBody);
    headers.set("x-webhook-timestamp", "1758610230");
    expect(provider.verifyWebhook(successBody, headers)).toBe(false);
  });

  it("rejects a request with no signature headers", () => {
    expect(provider.verifyWebhook(successBody, new Headers())).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    const ts = "1758610229";
    const headers = new Headers({
      "x-webhook-timestamp": ts,
      "x-webhook-signature": cashfreeSignature(ts, successBody, "other-secret"),
    });
    expect(provider.verifyWebhook(successBody, headers)).toBe(false);
  });
});

describe("webhook as a trigger", () => {
  it("names the order a payment webhook is about", () => {
    expect(provider.webhookOrderId(successBody)).toBe("FGABC123");
  });

  it.each(["PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK"])("names it for %s too", (type) => {
    expect(provider.webhookOrderId(successBody.replace("PAYMENT_SUCCESS_WEBHOOK", type))).toBe(
      "FGABC123",
    );
  });

  it("ignores event types this app does not act on", () => {
    const body = successBody.replace("PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_CHARGES_WEBHOOK");
    expect(provider.webhookOrderId(body)).toBeNull();
  });

  it("returns null for a body that is not JSON", () => {
    expect(provider.webhookOrderId("not json")).toBeNull();
  });
});

describe("customer id", () => {
  it("strips a UUID down to the alphanumerics Cashfree accepts", () => {
    expect(cashfreeCustomerId("0b8f2c1e-4d3a-4f6b-9a1c-2e3d4f5a6b7c")).toBe(
      "0b8f2c1e4d3a4f6b9a1c2e3d4f5a6b7c",
    );
  });
});
