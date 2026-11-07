import { describe, expect, it } from "vitest";
import {
  cancelDeliveries,
  isSubscriptionId,
  pauseDeliveries,
  resumeDeliveries,
  skipDelivery,
  undeliveredSaturdays,
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

describe("skip, pause, resume, cancel — admin, 27 Sep 2026", () => {
  const sub = { status: "active" as const, deliveries, skipped: [] as string[], held: 0 };

  it("skip moves the box to the Saturday after the last, on that Saturday's rotation week", () => {
    const next = skipDelivery(sub, "2026-10-17", at("2026-10-12"), at("2026-10-24"))!;
    expect(next.deliveries.map((d) => d.date)).toEqual([
      "2026-10-10",
      "2026-10-24",
      "2026-10-31",
      "2026-11-07",
    ]);
    // 7 Nov is four weeks after the 10 Oct anchor: week 1 again.
    expect(next.deliveries.at(-1)!.week).toBe(1);
    expect(next.skipped).toEqual(["2026-10-17"]);
    expect(next.status).toBe("active");
  });

  it("will not skip a Saturday that is today, past, or not on the calendar", () => {
    const open = at("2026-10-24");
    expect(skipDelivery(sub, "2026-10-17", at("2026-10-17"), open)).toBeNull();
    expect(skipDelivery(sub, "2026-10-10", at("2026-10-12"), open)).toBeNull();
    expect(skipDelivery(sub, "2026-10-18", at("2026-10-12"), open)).toBeNull();
    expect(skipDelivery({ ...sub, status: "paused" }, "2026-10-24", at("2026-10-12"), open)).toBeNull();
  });

  it("skipping the last Saturday adds the one after it, and drops the skipped one", () => {
    // Found 31 Oct 2026: the new box landed back on the skipped date.
    const next = skipDelivery(sub, "2026-10-31", at("2026-10-30"), at("2026-11-07"))!;
    expect(next.deliveries.map((d) => d.date)).toEqual([
      "2026-10-10",
      "2026-10-17",
      "2026-10-24",
      "2026-11-07",
    ]);
    expect(next.skipped).toEqual(["2026-10-31"]);
  });

  it("skipping after a pause never lands in the past", () => {
    const resumed = {
      ...sub,
      deliveries: [
        { date: "2026-10-03", week: 4 },
        { date: "2026-10-10", week: 1 },
        { date: "2026-11-07", week: 1 },
      ],
    };
    const next = skipDelivery(resumed, "2026-11-07", at("2026-11-01"), at("2026-11-14"))!;
    expect(next.deliveries.map((d) => d.date)).toEqual(["2026-10-03", "2026-10-10", "2026-11-14"]);
  });

  it("never adds a box before the first Saturday still open to new boxes", () => {
    const early = { ...sub, deliveries: [{ date: "2026-10-03", week: 4 }, { date: "2026-10-10", week: 1 }] };
    // A slow crop has closed 17 Oct; the replacement waits for 24 Oct.
    const next = skipDelivery(early, "2026-10-10", at("2026-10-05"), at("2026-10-24"))!;
    expect(next.deliveries.map((d) => d.date)).toEqual(["2026-10-03", "2026-10-24"]);
  });

  it("pause holds every Saturday still ahead, and resume puts them back from the next open Saturday", () => {
    const paused = pauseDeliveries(sub, at("2026-10-12"))!;
    expect(paused.status).toBe("paused");
    expect(paused.deliveries.map((d) => d.date)).toEqual(["2026-10-10"]);
    expect(paused.held).toBe(3);

    const resumed = resumeDeliveries({ ...paused }, at("2026-11-14"))!;
    expect(resumed.status).toBe("active");
    expect(resumed.held).toBe(0);
    expect(resumed.deliveries).toHaveLength(4);
    const added = resumed.deliveries.slice(1).map((d) => d.date);
    expect(added.every((d) => d > "2026-11-02")).toBe(true);
    // Consecutive Saturdays, one box each.
    expect(new Set(added).size).toBe(3);
  });

  it("will not pause with nothing ahead, or resume what is not paused", () => {
    expect(pauseDeliveries(sub, at("2026-11-01"))).toBeNull();
    expect(resumeDeliveries(sub, at("2026-10-24"))).toBeNull();
  });

  it("cancel drops the Saturdays ahead and counts them as owed", () => {
    expect(undeliveredSaturdays(sub, at("2026-10-12"))).toBe(3);
    const cancelled = cancelDeliveries(sub, at("2026-10-12"))!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.deliveries.map((d) => d.date)).toEqual(["2026-10-10"]);
  });

  it("cancelling a paused plan counts the held Saturdays as owed", () => {
    const paused = { ...sub, ...pauseDeliveries(sub, at("2026-10-12"))! };
    expect(undeliveredSaturdays(paused, at("2026-10-20"))).toBe(3);
    expect(cancelDeliveries(paused, at("2026-10-20"))!.held).toBe(0);
  });

  it("will not cancel an ended or already-cancelled plan", () => {
    expect(cancelDeliveries(sub, at("2026-11-01"))).toBeNull();
    expect(cancelDeliveries({ ...sub, status: "cancelled" }, at("2026-10-12"))).toBeNull();
  });
});
