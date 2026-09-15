import { describe, expect, it } from "vitest";
import {
  cartGrams,
  cartUnitCount,
  MAX_LINES,
  MAX_UNITS_PER_LINE,
  parseCart,
  removeFromCart,
  serialiseCart,
  unitsFor,
  upsertLine,
  type CartLine,
} from "./cart";

describe("parseCart — the cookie is untrusted input", () => {
  it("reads a well-formed cookie", () => {
    expect(parseCart("broccoli:3|mustard:2")).toEqual([
      { key: "broccoli", units: 3 },
      { key: "mustard", units: 2 },
    ]);
  });

  it("treats absent, empty and whitespace as an empty cart", () => {
    expect(parseCart(undefined)).toEqual([]);
    expect(parseCart(null)).toEqual([]);
    expect(parseCart("")).toEqual([]);
    expect(parseCart("   ")).toEqual([]);
  });

  /* Each of these once had a plausible route to a 500 or to a bogus line. The
     contract is that a junk cookie degrades to a smaller cart, never throws. */
  it.each([
    ["no separator at all", "broccoli"],
    ["missing quantity", "broccoli:"],
    ["non-numeric quantity", "broccoli:abc"],
    ["negative quantity", "broccoli:-4"],
    ["zero quantity", "broccoli:0"],
    ["fractional quantity", "broccoli:0.4"],
    ["scientific notation", "broccoli:1e-9"],
    ["invalid key — uppercase", "Broccoli:2"],
    ["invalid key — digits", "broccoli2:2"],
    ["invalid key — path traversal", "../../etc/passwd:2"],
    ["invalid key — empty", ":3"],
    ["stray separators", "||:|"],
    ["JSON from an older format", '[{"k":"broccoli","u":2}]'],
  ])("drops a line with %s", (_label, cookie) => {
    expect(parseCart(cookie)).toEqual([]);
  });

  it("keeps the good lines and drops only the bad ones", () => {
    expect(parseCart("broccoli:2|BAD KEY:9|mustard:1|wheatgrass:0")).toEqual([
      { key: "broccoli", units: 2 },
      { key: "mustard", units: 1 },
    ]);
  });

  it("truncates a quantity above the per-line cap rather than honouring it", () => {
    expect(parseCart("broccoli:999")).toEqual([
      { key: "broccoli", units: MAX_UNITS_PER_LINE },
    ]);
  });

  it("keeps the first of a duplicated key, not a doubled line", () => {
    expect(parseCart("broccoli:2|broccoli:5")).toEqual([
      { key: "broccoli", units: 2 },
    ]);
  });

  it("stops at MAX_LINES so a crafted cookie cannot fan out the hydrate", () => {
    const cookie = Array.from({ length: 40 }, (_, i) => `k${"x".repeat(i)}:1`)
      .map((s) => s.replace(/[0-9]/g, ""))
      .join("|");
    expect(parseCart(cookie).length).toBeLessThanOrEqual(MAX_LINES);
  });
});

describe("serialiseCart", () => {
  it("round-trips through parse", () => {
    const lines: CartLine[] = [
      { key: "broccoli", units: 3 },
      { key: "red-amaranthus", units: 1 },
    ];
    expect(parseCart(serialiseCart(lines))).toEqual(lines);
  });

  it("omits empty lines instead of writing a zero", () => {
    expect(serialiseCart([{ key: "broccoli", units: 0 }])).toBe("");
  });

  it("is empty for an empty cart", () => {
    expect(serialiseCart([])).toBe("");
  });
});

describe("upsertLine — absolute, never a delta", () => {
  it("creates a line", () => {
    expect(upsertLine([], "broccoli", 2)).toEqual([{ key: "broccoli", units: 2 }]);
  });

  /* The whole reason this is not `addToCart`. The variety page's stepper shows
     what is already in the cart, so committing 3 when it reads 3 must leave 3
     — an add would silently make it 6. */
  it("sets an existing line rather than adding to it", () => {
    const once = upsertLine([], "broccoli", 3);
    expect(upsertLine(once, "broccoli", 3)).toEqual([
      { key: "broccoli", units: 3 },
    ]);
  });

  it("is idempotent, so a double submit cannot double the quantity", () => {
    let lines = upsertLine([], "broccoli", 4);
    for (let i = 0; i < 5; i++) lines = upsertLine(lines, "broccoli", 4);
    expect(lines).toEqual([{ key: "broccoli", units: 4 }]);
  });

  it("can decrease as well as increase", () => {
    const lines = upsertLine([], "broccoli", 8);
    expect(upsertLine(lines, "broccoli", 2)).toEqual([
      { key: "broccoli", units: 2 },
    ]);
  });

  it("clamps above the per-line cap", () => {
    expect(upsertLine([], "broccoli", 500)).toEqual([
      { key: "broccoli", units: MAX_UNITS_PER_LINE },
    ]);
  });

  it("refuses an invalid key", () => {
    expect(upsertLine([], "Not A Key", 2)).toEqual([]);
    expect(upsertLine([], "../secrets", 2)).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity])("removes rather than creating at %p", (bad) => {
    expect(upsertLine([], "broccoli", bad)).toEqual([]);
  });

  /* This is what lets both steppers delete by decrementing, so there is no
     state where a line reads 0 and is still in the cart. */
  it("removes an existing line when set to zero or below", () => {
    const lines = upsertLine([], "broccoli", 3);
    expect(upsertLine(lines, "broccoli", 0)).toEqual([]);
    expect(upsertLine(lines, "broccoli", -2)).toEqual([]);
  });

  it("will not exceed MAX_LINES with a new variety", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      lines = upsertLine(lines, "k" + "a".repeat(i), 1);
    }
    expect(lines).toHaveLength(MAX_LINES);
    expect(upsertLine(lines, "one-more-green", 1)).toHaveLength(MAX_LINES);
  });

  it("still updates an existing line when the cart is full", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      lines = upsertLine(lines, "k" + "a".repeat(i), 1);
    }
    const updated = upsertLine(lines, lines[0].key, 5);
    expect(updated).toHaveLength(MAX_LINES);
    expect(updated[0].units).toBe(5);
  });

  it("leaves other lines untouched", () => {
    const lines: CartLine[] = [
      { key: "broccoli", units: 3 },
      { key: "mustard", units: 1 },
    ];
    expect(upsertLine(lines, "broccoli", 7)).toEqual([
      { key: "broccoli", units: 7 },
      { key: "mustard", units: 1 },
    ]);
  });

  it("preserves position when updating, so a line does not jump", () => {
    const lines: CartLine[] = [
      { key: "broccoli", units: 1 },
      { key: "mustard", units: 1 },
      { key: "wheatgrass", units: 1 },
    ];
    expect(upsertLine(lines, "mustard", 9).map((l) => l.key)).toEqual([
      "broccoli",
      "mustard",
      "wheatgrass",
    ]);
  });
});

describe("unitsFor — what seeds the variety page stepper", () => {
  const lines: CartLine[] = [
    { key: "broccoli", units: 3 },
    { key: "mustard", units: 1 },
  ];

  /* The bug this fixes: the stepper always mounted at 1 while the header badge
     read 3, so one control said the cart held one thing and the other said
     three. */
  it("reports the quantity already in the cart", () => {
    expect(unitsFor(lines, "broccoli")).toBe(3);
    expect(unitsFor(lines, "mustard")).toBe(1);
  });

  it("is 0 for a variety not in the cart", () => {
    expect(unitsFor(lines, "wheatgrass")).toBe(0);
    expect(unitsFor([], "broccoli")).toBe(0);
  });

  it("round-trips through the cookie, which is what survives a refresh", () => {
    expect(unitsFor(parseCart(serialiseCart(lines)), "broccoli")).toBe(3);
  });
});

describe("removeFromCart", () => {
  const lines: CartLine[] = [
    { key: "broccoli", units: 3 },
    { key: "mustard", units: 1 },
  ];

  it("removes the named line and leaves the rest", () => {
    expect(removeFromCart(lines, "mustard")).toEqual([
      { key: "broccoli", units: 3 },
    ]);
  });

  it("ignores a key that is not in the cart", () => {
    expect(removeFromCart(lines, "wheatgrass")).toEqual(lines);
  });

  it("is safe on an empty cart", () => {
    expect(removeFromCart([], "broccoli")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const before = structuredClone(lines);
    removeFromCart(lines, "mustard");
    expect(lines).toEqual(before);
  });
});

describe("totals", () => {
  it("counts units and grams", () => {
    const lines: CartLine[] = [
      { key: "broccoli", units: 3 },
      { key: "mustard", units: 2 },
    ];
    expect(cartUnitCount(lines)).toBe(5);
    expect(cartGrams(lines)).toBe(500);
  });

  it("is zero for an empty cart", () => {
    expect(cartUnitCount([])).toBe(0);
    expect(cartGrams([])).toBe(0);
  });
});
