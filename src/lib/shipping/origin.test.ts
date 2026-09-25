import { describe, expect, it } from "vitest";
import { lineOrigin, splitShipments } from "./origin";

const vendorOf = { "rack:shelf": "madurai" };
const seed = { kind: "seed" as const, key: "basil" };
const mat = { kind: "tray" as const, key: "drain-cell-mat" };
const shelfRack = { kind: "rack" as const, key: "rk-6f-5s-1x2-1.4-orange" };
const angleRack = { kind: "rack" as const, key: "ar-6f-5s-1x2-1.4-orange" };
const pipe = { kind: "rack" as const, key: "pr-6f-5s-1.5x3" };
const green = { kind: "variety" as const, key: "radish" };

describe("lineOrigin (the owner, 25 Sep 2026)", () => {
  it("ships a shelf rack from its vendor", () => {
    expect(lineOrigin(shelfRack, vendorOf)).toBe("madurai");
  });

  it("ships everything else from our pickup", () => {
    for (const l of [seed, mat, angleRack, pipe, green]) expect(lineOrigin(l, vendorOf)).toBe("home");
  });

  it("ships a shelf rack from ours until its vendor is set", () => {
    expect(lineOrigin(shelfRack, {})).toBe("home");
  });
});

describe("splitShipments", () => {
  const originOf = (l: { kind: "seed" | "tray" | "rack" | "variety"; key: string }) => lineOrigin(l, vendorOf);

  it("is our parcel plus the rack maker's", () => {
    expect(splitShipments([shelfRack, mat, seed, pipe], originOf)).toEqual([
      { origin: "home", ownRun: false, lines: [mat, seed, pipe] },
      { origin: "madurai", ownRun: false, lines: [shelfRack] },
    ]);
  });

  it("puts everything of ours on the own run when there are greens", () => {
    expect(splitShipments([shelfRack, green, mat], originOf)).toEqual([
      { origin: "home", ownRun: true, lines: [green, mat] },
      { origin: "madurai", ownRun: false, lines: [shelfRack] },
    ]);
  });
});
