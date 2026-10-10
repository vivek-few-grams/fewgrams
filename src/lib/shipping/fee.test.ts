import { describe, expect, it } from "vitest";
import { COURIER_FEE_CAP, FREE_DELIVERY_FROM, customerDelivery, shortOfFreeDelivery } from "./fee";

describe("customerDelivery", () => {
  it("is free from the threshold, own run included", () => {
    expect(customerDelivery(FREE_DELIVERY_FROM, 200, [480, 60])).toEqual({
      total: 0,
      ownRun: 0,
      parcels: [0, 0],
      free: true,
    });
  });

  it("charges what the courier costs when that is under the cap", () => {
    expect(customerDelivery(150, null, [36])).toEqual({
      total: 36,
      ownRun: null,
      parcels: [36],
      free: false,
    });
  });

  it("caps the courier cost, however dear", () => {
    expect(customerDelivery(230, null, [107]).total).toBe(COURIER_FEE_CAP);
  });

  it("splits a capped fee across parcels in proportion, adding up exactly", () => {
    const r = customerDelivery(300, null, [100, 33]);
    expect(r.total).toBe(79);
    expect(r.parcels.reduce((a, b) => a + b, 0)).toBe(79);
    expect(r.parcels[0]).toBeGreaterThan(r.parcels[1]);
  });

  it("adds the own-run fee under the threshold, with no courier parcel", () => {
    expect(customerDelivery(160, 200, [])).toEqual({ total: 200, ownRun: 200, parcels: [], free: false });
  });

  it("charges nothing for a courier that costs nothing", () => {
    expect(customerDelivery(100, null, [0]).total).toBe(0);
  });
});

describe("shortOfFreeDelivery", () => {
  it("says how much more reaches free delivery, and 0 once there", () => {
    expect(shortOfFreeDelivery(400)).toBe(FREE_DELIVERY_FROM - 400);
    expect(shortOfFreeDelivery(FREE_DELIVERY_FROM)).toBe(0);
    expect(shortOfFreeDelivery(2000)).toBe(0);
  });
});
