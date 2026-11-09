import { describe, expect, it } from "vitest";
import { restock } from "./cancel";
import { canCancelOrder, cancelBlock, type Order, type OrderLine } from "./order";

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

const parcel = (x: Partial<Order["shipments"][number]> = {}) =>
  ({ trackingNumber: null, bookingStartedAt: null, booking: null, quote: null, ...x }) as Order["shipments"][number];

describe("restock", () => {
  it("puts back what payment recorded taking, not what was ordered", () => {
    // Three blocks ordered with one on the shelf: payment took all three
    // (the count went to -2), and the cancel must return the same three.
    const lines = [line("media", "coir", 3), line("seed", "dill", 1, 100)];
    const stockTaken = [
      { kind: "media" as const, key: "coir", amount: 3 },
      { kind: "seed" as const, key: "dill", amount: 75 },
    ];
    expect(restock({ lines, stockTaken })).toEqual(stockTaken);
  });

  it("falls back to the lines for an order paid before the record existed", () => {
    expect(restock({ lines: [line("tray", "pair", 2), line("variety", "radish", 1, 100)], stockTaken: null })).toEqual([
      { kind: "tray", key: "pair", amount: 2 },
    ]);
  });

  it("puts back nothing for a leased order whose payment work took nothing yet", () => {
    // Paid since 31 Oct 2026 (it has `finishingAt`), but the run died before
    // its first move: falling back to the lines put a whole order back.
    const lines = [line("tray", "pair", 2), line("seed", "dill", 1, 100)];
    expect(restock({ lines, stockTaken: null, finishingAt: "2026-11-08T10:00:00Z" })).toEqual([]);
  });
});

describe("cancelBlock", () => {
  it("refuses a cancel while a parcel is booked or being booked", () => {
    expect(cancelBlock({ shipments: [parcel()] })).toBeNull();
    expect(cancelBlock({ shipments: [parcel(), parcel({ trackingNumber: "XB123" })] })).toBe("booked");
    const at = new Date("2026-10-31T10:01:00Z");
    expect(cancelBlock({ shipments: [parcel({ bookingStartedAt: "2026-10-31T10:00:00Z" })] }, at)).toBe("booking");
  });

  it("does not block on a booking that died, or the order could never be cancelled", () => {
    const later = new Date("2026-10-31T11:00:00Z");
    expect(cancelBlock({ shipments: [parcel({ bookingStartedAt: "2026-10-31T10:00:00Z" })] }, later)).toBeNull();
  });

  it("refuses a cancel while payment's own work is unfinished", () => {
    const unfinished = { shipments: [parcel()], finishingAt: "2026-11-08T10:00:00Z", finishedAt: null };
    expect(cancelBlock(unfinished)).toBe("finishing");
    expect(canCancelOrder({ status: "paid", ...unfinished })).toBe(false);
    expect(cancelBlock({ ...unfinished, finishedAt: "2026-11-08T10:00:01Z" })).toBeNull();
    // Paid before the lease existed: neither field, never unfinished.
    expect(cancelBlock({ shipments: [parcel()], finishingAt: null, finishedAt: null })).toBeNull();
  });

  it("allows it once the tracking number is cleared", () => {
    expect(canCancelOrder({ status: "ready_for_delivery", shipments: [parcel({ trackingNumber: "XB1" })] })).toBe(false);
    expect(canCancelOrder({ status: "ready_for_delivery", shipments: [parcel()] })).toBe(true);
    expect(canCancelOrder({ status: "delivered", shipments: [parcel()] })).toBe(false);
  });
});
