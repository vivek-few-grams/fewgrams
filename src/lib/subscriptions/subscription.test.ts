import { describe, expect, it } from "vitest";
import {
  isSubscriptionId,
  newSubscriptionId,
  nextDelivery,
  shiftForCutoff,
  subscriptionState,
} from "./subscription";
import { isOrderId } from "@/lib/orders/order";

const deliveries = [
  { date: "2026-10-10", week: 1 },
  { date: "2026-10-17", week: 2 },
  { date: "2026-10-24", week: 3 },
  { date: "2026-10-31", week: 4 },
];
const at = (iso: string) => new Date(`${iso}T09:00:00+05:30`);

describe("subscription ids", () => {
  it("are never mistaken for an order id, in either direction", () => {
    const id = newSubscriptionId(new Uint8Array(10));
    expect(isSubscriptionId(id)).toBe(true);
    expect(isOrderId(id)).toBe(false);
    expect(isSubscriptionId("FG0000000000")).toBe(false);
  });
});

describe("subscriptionState — expiry is derived from the dates", () => {
  const sub = { status: "active" as const, deliveries };
  it("is upcoming before the first box, active through the last, expired after", () => {
    expect(subscriptionState(sub, at("2026-10-09"))).toBe("upcoming");
    expect(subscriptionState(sub, at("2026-10-10"))).toBe("active");
    expect(subscriptionState(sub, at("2026-10-31"))).toBe("active");
    expect(subscriptionState(sub, at("2026-11-01"))).toBe("expired");
  });
  it("reports an unpaid checkout as pending whatever the dates", () => {
    expect(subscriptionState({ ...sub, status: "pending_payment" }, at("2026-12-01"))).toBe("pending");
  });
  it("finds the next box, today included", () => {
    expect(nextDelivery(sub, at("2026-10-17"))?.date).toBe("2026-10-17");
    expect(nextDelivery(sub, at("2026-11-01"))).toBeNull();
  });
});

describe("shiftForCutoff", () => {
  it("leaves the term alone when paid before the cutoff", () => {
    expect(shiftForCutoff(deliveries, "2026-10-10", "2026-10-10", 4)).toBe(deliveries);
  });
  it("moves every Saturday a week on, and each onto the next rotation week", () => {
    const moved = shiftForCutoff(deliveries, "2026-10-10", "2026-10-17", 4);
    expect(moved.map((d) => d.date)).toEqual(["2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07"]);
    expect(moved.map((d) => d.week)).toEqual([2, 3, 4, 1]);
  });
});
