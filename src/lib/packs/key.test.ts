import { describe, expect, it } from "vitest";
import { isValidKeyFor, parseCart, serialiseCart } from "@/lib/cart/cart";
import { isValidContentKey } from "@/lib/content/content-key";
import { isValidRackCartKey } from "@/lib/racks/cart-key";
import { isValidPackCartKey, packCartKey, packKeyOf, parsePackCartKey } from "./key";

describe("pack cart key", () => {
  it("sorts and de-duplicates the seeds, so one choice is one line", () => {
    const a = packCartKey("single-rack-pack", "orange", ["radish", "dill", "kale", "beetroot"]);
    const b = packCartKey("single-rack-pack", "orange", ["kale", "beetroot", "radish", "dill", "dill"]);
    expect(a).toBe("single-rack-pack~orange~beetroot.dill.kale.radish");
    expect(b).toBe(a);
  });

  it("leaves the colour empty for a pack with no rack", () => {
    const key = packCartKey("tray-pack", null, ["rocket", "basil"]);
    expect(key).toBe("tray-pack~~basil.rocket");
    expect(parsePackCartKey(key)).toEqual({ packKey: "tray-pack", colour: null, seeds: ["basil", "rocket"] });
  });

  it("refuses what only a hand-made cookie or form could produce", () => {
    for (const bad of [
      "single-rack-pack~orange~radish.dill", // out of order
      "single-rack-pack~orange~dill.dill", // repeated
      "single-rack-pack~teal~dill.radish", // not a palette colour
      "single-rack-pack~orange~", // no seeds
      "single-rack-pack~orange", // two parts
      "Single-rack-pack~orange~dill", // upper case
      "rack-2~orange~dill", // a digit in the pack key
      `tray-pack~~${"a".repeat(300)}`, // too long
    ]) {
      expect(isValidPackCartKey(bad), bad).toBe(false);
    }
  });

  /* A pack key, a rack key and a content key must never be the same string —
     `cart-key.test.ts` keeps the other two apart for the same reason. */
  it("is disjoint from content keys and rack keys", () => {
    const pack = packCartKey("single-rack-pack", "orange", ["dill", "radish"]);
    expect(isValidContentKey(pack)).toBe(false);
    expect(isValidRackCartKey(pack)).toBe(false);
    expect(isValidPackCartKey("radish")).toBe(false);
    expect(isValidPackCartKey("ar-5f-4s-1.25x3-1.4-orange")).toBe(false);
  });

  it("survives the cart cookie", () => {
    const key = packCartKey("double-rack-pack", "green", ["alfalfa", "mustard", "radish"]);
    expect(isValidKeyFor("pack", key)).toBe(true);
    const lines = parseCart(serialiseCart([{ kind: "pack", key, units: 2 }]));
    expect(lines).toEqual([{ kind: "pack", key, units: 2 }]);
  });

  it("names its pack for a link back", () => {
    expect(packKeyOf("tray-pack~~basil.rocket")).toBe("tray-pack");
    expect(packKeyOf("nonsense")).toBeNull();
  });
});
