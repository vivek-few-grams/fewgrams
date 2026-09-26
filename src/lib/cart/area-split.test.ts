import { describe, expect, it } from "vitest";
import { cartAfterOrder, splitByArea } from "./area-split";
import type { CartLine } from "./cart";

const cart: CartLine[] = [
  { kind: "variety", key: "radish", units: 2 },
  { kind: "seed", key: "radish", units: 1 },
  { kind: "tray", key: "shallow-tray", units: 1 },
];

describe("splitByArea — greens only where the own run goes (SPEC §7)", () => {
  it("keeps everything inside the area", () => {
    expect(splitByArea(cart, true)).toEqual({ kept: cart, setAside: [] });
  });
  it("sets the greens aside outside it and keeps the rest", () => {
    const { kept, setAside } = splitByArea(cart, false);
    expect(setAside.map((l) => `${l.kind}:${l.key}`)).toEqual(["variety:radish"]);
    /* `radish` the seed is not a green, whatever its key. */
    expect(kept.map((l) => `${l.kind}:${l.key}`)).toEqual(["seed:radish", "tray:shallow-tray"]);
  });
  it("leaves nothing for a cart of greens alone, which checkout refuses", () => {
    expect(splitByArea([cart[0]], false).kept).toEqual([]);
  });
});

describe("cartAfterOrder", () => {
  it("takes out what was bought and keeps the greens set aside", () => {
    const left = cartAfterOrder(cart, [
      { kind: "seed", key: "radish" },
      { kind: "tray", key: "shallow-tray" },
    ]);
    expect(left).toEqual([{ kind: "variety", key: "radish", units: 2 }]);
  });
  it("empties the cart when everything was bought", () => {
    expect(cartAfterOrder(cart, cart)).toEqual([]);
  });
});
