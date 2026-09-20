import { describe, expect, it } from "vitest";
import { isValidContentKey } from "@/lib/content/content-key";
import {
  isValidRackCartKey,
  parseRackCartKey,
  rackCartKey,
  rackRangeOf,
} from "./cart-key";

describe("rackCartKey", () => {
  it("lowercases the SKU and appends the colour for a steel rack", () => {
    expect(rackCartKey("RK-6F-5S-1.25x3-1.4", "orange")).toBe("rk-6f-5s-1.25x3-1.4-orange");
    expect(rackCartKey("AR-4F-3S-1x4-1.4", "green")).toBe("ar-4f-3s-1x4-1.4-green");
  });

  it("leaves a pipe rack without a colour segment", () => {
    /* One pipe spec and it is white (SPEC §21), so `-white` would imply a
       choice nobody is offered. */
    expect(rackCartKey("PR-6F-5S-1.5x3", null)).toBe("pr-6f-5s-1.5x3");
  });

  it("refuses the mismatches rather than ignoring them", () => {
    /* A dropped colour would put an unpainted rack in somebody's cart, and an
       invented one would put a colour on a product that has none. */
    expect(() => rackCartKey("RK-6F-5S-1x3-1.4", null)).toThrow(/needs a colour/);
    expect(() => rackCartKey("PR-6F-5S-1.5x3", "orange")).toThrow(/no colour/);
    expect(() => rackCartKey("XX-6F-5S-1x3", "orange")).toThrow(/not a rack SKU/);
  });
});

describe("parseRackCartKey", () => {
  it("round-trips every range", () => {
    for (const [sku, colour] of [
      ["RK-6F-5S-1.25x3-1.4", "orange"],
      ["AR-2F-1S-1x2-1.4", "purple"],
      ["PR-3F-2S-1x2.5", null],
    ] as const) {
      const key = rackCartKey(sku, colour);
      expect(parseRackCartKey(key)).toEqual({
        range: rackRangeOf({ RK: "shelf", AR: "angle", PR: "pipe" }[sku.slice(0, 2) as "RK" | "AR" | "PR"])!,
        sku: sku.toLowerCase(),
        colour,
      });
    }
  });

  it("rejects junk without throwing, because the input is a cookie", () => {
    for (const bad of [
      "",
      "broccoli",
      "RK-6F-5S-1x3-1.4-orange", // uppercase — one rack must not have two keys
      "rk-6f-5s-1x3-1.4",        // steel with no colour
      "rk-6f-5s-1x3-1.4-teal",   // not in the palette
      "pr-6f-5s-1.5x3-white",    // pipe with a colour appended
      "xx-6f-5s-1x3-1.4-orange", // unknown range prefix
      "rk-6f-5s-1x3-orange",     // steel missing its gauge segment
      "rk-af-5s-1x3-1.4-orange", // height is not a number
      `rk-6f-5s-1x3-1.4-orange${"x".repeat(60)}`,
    ]) {
      expect(parseRackCartKey(bad), bad).toBeNull();
      expect(isValidRackCartKey(bad), bad).toBe(false);
    }
  });
});

describe("the two key rules do not overlap", () => {
  it("no rack key is a valid content key, and no content key is a rack key", () => {
    /* The reason the cart's validation had to become kind-aware rather than be
       loosened: a content key bans digits on purpose (`amaranth-2` is the
       failure mode that rule exists for) and a rack key is mostly digits. If
       these two sets ever intersected, one string would address two products. */
    for (const rack of ["rk-6f-5s-1.25x3-1.4-orange", "pr-6f-5s-1.5x3"]) {
      expect(isValidRackCartKey(rack)).toBe(true);
      expect(isValidContentKey(rack)).toBe(false);
    }
    for (const content of ["broccoli", "tray-pair", "red-amaranthus"]) {
      expect(isValidContentKey(content)).toBe(true);
      expect(isValidRackCartKey(content)).toBe(false);
    }
  });
});
