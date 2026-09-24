import { describe, expect, it } from "vitest";
import { inDeliveryArea } from "./area";

const urban = { district: "Bengaluru Urban", state: "Karnataka" };
const rural = { district: "Bengaluru Rural", state: "Karnataka" };

describe("inDeliveryArea", () => {
  /* The bug that retired the PIN list: 560072 is Bengaluru Urban and was
     refused because nobody had typed it into `brand.ts`. */
  it("serves any PIN India Post places in Bengaluru Urban", () => {
    expect(inDeliveryArea("560072", urban)).toBe(true);
  });

  /* The owner's line, 23 Sep 2026: Rural reaches past the same-day run —
     even on a 560 PIN, when the directory says so. */
  it("refuses Bengaluru Rural, including 560 PINs placed there", () => {
    expect(inDeliveryArea("562123", rural)).toBe(false);
    expect(inDeliveryArea("560090", rural)).toBe(false);
  });

  it("matches the district however the directory spaced or cased it", () => {
    expect(inDeliveryArea("560001", { district: " bengaluru  URBAN ", state: "Karnataka" })).toBe(true);
  });

  /* No key, the directory down, or a PIN it does not know: fall back to the
     city's sorting district so an outage never closes the shop. */
  it("falls back to 560 when India Post cannot say", () => {
    expect(inDeliveryArea("560072", null)).toBe(true);
    expect(inDeliveryArea("562123", null)).toBe(false);
    expect(inDeliveryArea("110001", null)).toBe(false);
  });

  it("refuses anything that is not six digits", () => {
    expect(inDeliveryArea("56007", urban)).toBe(false);
    expect(inDeliveryArea("5600722", null)).toBe(false);
  });
});
