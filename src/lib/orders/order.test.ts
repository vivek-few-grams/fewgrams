import { describe, expect, it } from "vitest";
import type { PaymentAttempt } from "@/lib/payments";
import {
  canAdvance,
  formatReceiptNo,
  isOrderId,
  newOrderId,
  nextStatuses,
  settlementFor,
  shiftForPaymentDay,
} from "./order";

const attempt = (over: Partial<PaymentAttempt> = {}): PaymentAttempt => ({
  providerPaymentId: "p1",
  orderId: "FG0000000001",
  status: "success",
  amount: 450,
  currency: "INR",
  method: "upi",
  at: null,
  ...over,
});

const pending = { id: "FG0000000001", status: "pending_payment" as const, total: 450 };
const paid = (attempts: PaymentAttempt[]) => ({ status: "paid" as const, attempts });

describe("order id", () => {
  it("is FG plus ten Crockford characters", () => {
    const id = newOrderId();
    expect(id).toMatch(/^FG[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(isOrderId(id)).toBe(true);
  });

  it("never uses I, L, O or U", () => {
    const every = newOrderId(Uint8Array.from({ length: 10 }, (_, i) => i * 31));
    expect(every).not.toMatch(/[ILOU]/);
  });

  it("fits Cashfree's order id rule", () => {
    expect(newOrderId()).toMatch(/^[A-Za-z0-9_-]{3,45}$/);
  });

  it("rejects anything else as an id", () => {
    expect(isOrderId("FG000000000I")).toBe(false);
    expect(isOrderId("../FG00000000")).toBe(false);
    expect(isOrderId("fg0000000001")).toBe(false);
  });
});

describe("receipt number", () => {
  it("pads to six digits", () => {
    expect(formatReceiptNo(7)).toBe("FG-000007");
    expect(formatReceiptNo(1234567)).toBe("FG-1234567");
  });
});

describe("settlement", () => {
  it("pays on a success for the exact amount", () => {
    expect(settlementFor(pending, paid([attempt()]))).toEqual({ action: "pay", attempt: attempt() });
  });

  it("picks the success out of earlier failures", () => {
    const ok = attempt({ providerPaymentId: "p2" });
    const result = settlementFor(pending, paid([attempt({ status: "failed" }), ok]));
    expect(result).toEqual({ action: "pay", attempt: ok });
  });

  it("does nothing while every attempt failed, dropped or is pending", () => {
    const attempts = [
      attempt({ status: "failed" }),
      attempt({ status: "dropped" }),
      attempt({ status: "pending" }),
    ];
    expect(settlementFor(pending, paid(attempts))).toEqual({ action: "none" });
  });

  it("refuses to pay on a success for a different amount", () => {
    expect(settlementFor(pending, paid([attempt({ amount: 1 })])).action).toBe("mismatch");
  });

  it("refuses a success in another currency", () => {
    expect(settlementFor(pending, paid([attempt({ currency: "USD" })])).action).toBe("mismatch");
  });

  it("ignores an attempt that belongs to another order", () => {
    expect(settlementFor(pending, paid([attempt({ orderId: "FG0000000002" })]))).toEqual({
      action: "none",
    });
  });

  it("does nothing until the gateway calls the order PAID, whatever the attempts say", () => {
    expect(settlementFor(pending, { status: "active", attempts: [attempt()] })).toEqual({
      action: "none",
    });
  });

  it("does nothing to an order that is already paid — a replayed webhook", () => {
    expect(settlementFor({ ...pending, status: "paid" }, paid([attempt()]))).toEqual({ action: "none" });
  });
});

describe("delivery date moves with the payment day", () => {
  // 23 Sep 2026 23:50 IST and 24 Sep 00:10 IST, as UTC instants.
  const lateEvening = new Date("2026-09-23T18:20:00Z");
  const sameEvening = new Date("2026-09-23T18:25:00Z");
  const afterMidnight = new Date("2026-09-23T18:40:00Z");

  it("stays put when paid the same IST day", () => {
    expect(shiftForPaymentDay("2026-10-01", lateEvening, sameEvening)).toBe("2026-10-01");
  });

  it("moves a day when payment lands after IST midnight", () => {
    expect(shiftForPaymentDay("2026-10-01", lateEvening, afterMidnight)).toBe("2026-10-02");
  });

  it("crosses a month end", () => {
    expect(shiftForPaymentDay("2026-09-30", lateEvening, afterMidnight)).toBe("2026-10-01");
  });
});

describe("operator status moves — SPEC §13", () => {
  it("walks paid → picked → ready → out for delivery → delivered", () => {
    expect(canAdvance("paid", "picked")).toBe(true);
    expect(canAdvance("picked", "ready_for_delivery")).toBe(true);
    expect(canAdvance("ready_for_delivery", "out_for_delivery")).toBe(true);
    expect(canAdvance("out_for_delivery", "delivered")).toBe(true);
    expect(canAdvance("out_for_delivery", "failed")).toBe(true);
  });

  it("cannot skip a step or go backwards", () => {
    expect(canAdvance("paid", "delivered")).toBe(false);
    expect(canAdvance("paid", "ready_for_delivery")).toBe(false);
    expect(canAdvance("ready_for_delivery", "picked")).toBe(false);
    expect(canAdvance("delivered", "paid")).toBe(false);
  });

  it("cannot mark an unpaid order as anything — only the gateway can pay it", () => {
    expect(nextStatuses("pending_payment")).toEqual([]);
  });

  it("does not offer refunded, which needs a gateway refund behind it", () => {
    for (const s of ["paid", "picked", "ready_for_delivery", "out_for_delivery", "delivered", "failed"] as const) {
      expect(nextStatuses(s)).not.toContain("refunded");
    }
  });
});
