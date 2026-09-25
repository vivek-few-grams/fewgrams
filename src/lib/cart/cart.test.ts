import { describe, expect, it } from "vitest";
import {
  asCartKind,
  cartGrams,
  cartUnitCount,
  isWeighed,
  lineId,
  MAX_LINES,
  MAX_UNITS_PER_LINE,
  parseCart,
  removeFromCart,
  serialiseCart,
  unitsFor,
  upsertLine,
  type CartLine,
} from "./cart";

const green = (key: string, units: number): CartLine => ({ kind: "variety", key, units });
const seed = (key: string, units: number): CartLine => ({ kind: "seed", key, units });
const tray = (key: string, units: number): CartLine => ({ kind: "tray", key, units });
const medium = (key: string, units: number): CartLine => ({ kind: "media", key, units });

describe("parseCart — the cookie is untrusted input", () => {
  it("reads a well-formed cookie", () => {
    expect(parseCart("v:broccoli:3|s:radish:2")).toEqual([
      green("broccoli", 3),
      seed("radish", 2),
    ]);
  });

  /**
   * Every cookie written before kinds existed (17 Sep 2026) is two-part, and
   * those cookies are on other people's machines — there is no migration to
   * run. A two-part chunk is therefore read as a variety, which is what it was.
   */
  it("reads a pre-kind cookie as varieties rather than dropping it", () => {
    expect(parseCart("broccoli:3|mustard:2")).toEqual([
      green("broccoli", 3),
      green("mustard", 2),
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
    ["missing quantity", "v:broccoli:"],
    ["non-numeric quantity", "v:broccoli:abc"],
    ["negative quantity", "v:broccoli:-4"],
    ["zero quantity", "v:broccoli:0"],
    ["fractional quantity", "v:broccoli:0.4"],
    ["scientific notation", "v:broccoli:1e-9"],
    ["unknown kind code", "x:broccoli:2"],
    ["kind spelled out rather than coded", "variety:broccoli:2"],
    ["invalid key — uppercase", "v:Broccoli:2"],
    ["invalid key — digits", "v:broccoli2:2"],
    ["invalid key — path traversal", "v:../../etc/passwd:2"],
    ["invalid key — empty", "v::3"],
    ["four parts", "v:broccoli:3:9"],
    ["stray separators", "||:|"],
    ["JSON from an older format", '[{"k":"broccoli","u":2}]'],
  ])("drops a line with %s", (_label, cookie) => {
    expect(parseCart(cookie)).toEqual([]);
  });

  it("keeps the good lines and drops only the bad ones", () => {
    expect(parseCart("v:broccoli:2|x:nope:9|s:radish:1|v:wheatgrass:0")).toEqual([
      green("broccoli", 2),
      seed("radish", 1),
    ]);
  });

  it("truncates a quantity above the per-line cap rather than honouring it", () => {
    expect(parseCart("v:broccoli:999")).toEqual([green("broccoli", MAX_UNITS_PER_LINE)]);
  });

  it("keeps the first of a duplicated line, not a doubled one", () => {
    expect(parseCart("v:broccoli:2|v:broccoli:5")).toEqual([green("broccoli", 2)]);
  });

  /**
   * The collision that made lines carry a kind: `radish` is a microgreen you
   * eat and a seed you sow, at two different prices. They are two lines.
   */
  it("keeps a seed and a variety that share a content key apart", () => {
    expect(parseCart("v:radish:2|s:radish:5")).toEqual([
      green("radish", 2),
      seed("radish", 5),
    ]);
  });

  it("stops at MAX_LINES so a crafted cookie cannot fan out the hydrate", () => {
    const cookie = Array.from({ length: 40 }, (_, i) => `v:k${"x".repeat(i)}:1`)
      .map((s) => s.replace(/[0-9]/g, ""))
      .join("|");
    expect(parseCart(cookie).length).toBeLessThanOrEqual(MAX_LINES);
  });
});

describe("serialiseCart", () => {
  it("round-trips through parse", () => {
    const lines = [green("broccoli", 3), seed("sunflower", 1)];
    expect(parseCart(serialiseCart(lines))).toEqual(lines);
  });

  it("writes the kind code, not the word", () => {
    expect(serialiseCart([green("broccoli", 3), seed("radish", 2)])).toBe(
      "v:broccoli:3|s:radish:2",
    );
  });

  it("omits empty lines instead of writing a zero", () => {
    expect(serialiseCart([green("broccoli", 0)])).toBe("");
  });

  it("is empty for an empty cart", () => {
    expect(serialiseCart([])).toBe("");
  });
});

describe("upsertLine — absolute, never a delta", () => {
  it("creates a line", () => {
    expect(upsertLine([], "variety", "broccoli", 2)).toEqual([green("broccoli", 2)]);
    expect(upsertLine([], "seed", "sunflower", 2)).toEqual([seed("sunflower", 2)]);
  });

  /* The whole reason this is not `addToCart`. A detail page's stepper shows
     what is already in the cart, so committing 3 when it reads 3 must leave 3
     — an add would silently make it 6. */
  it("sets an existing line rather than adding to it", () => {
    const once = upsertLine([], "variety", "broccoli", 3);
    expect(upsertLine(once, "variety", "broccoli", 3)).toEqual([green("broccoli", 3)]);
  });

  it("is idempotent, so a double submit cannot double the quantity", () => {
    let lines = upsertLine([], "seed", "radish", 4);
    for (let i = 0; i < 5; i++) lines = upsertLine(lines, "seed", "radish", 4);
    expect(lines).toEqual([seed("radish", 4)]);
  });

  it("can decrease as well as increase", () => {
    const lines = upsertLine([], "variety", "broccoli", 8);
    expect(upsertLine(lines, "variety", "broccoli", 2)).toEqual([green("broccoli", 2)]);
  });

  it("clamps above the per-line cap", () => {
    expect(upsertLine([], "seed", "radish", 500)).toEqual([
      seed("radish", MAX_UNITS_PER_LINE),
    ]);
  });

  it("refuses an invalid key", () => {
    expect(upsertLine([], "variety", "Not A Key", 2)).toEqual([]);
    expect(upsertLine([], "seed", "../secrets", 2)).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity])("removes rather than creating at %p", (bad) => {
    expect(upsertLine([], "variety", "broccoli", bad)).toEqual([]);
  });

  /* This is what lets both steppers delete by decrementing, so there is no
     state where a line reads 0 and is still in the cart. */
  it("removes an existing line when set to zero or below", () => {
    const lines = upsertLine([], "variety", "broccoli", 3);
    expect(upsertLine(lines, "variety", "broccoli", 0)).toEqual([]);
    expect(upsertLine(lines, "variety", "broccoli", -2)).toEqual([]);
  });

  /** The same key under the other kind is a different line, and setting one
   *  must not touch the other — otherwise buying seed would silently change
   *  how many punnets of greens you had ordered. */
  it("treats the same key under a different kind as a separate line", () => {
    const lines = upsertLine(upsertLine([], "variety", "radish", 2), "seed", "radish", 5);
    expect(lines).toEqual([green("radish", 2), seed("radish", 5)]);

    const changed = upsertLine(lines, "seed", "radish", 1);
    expect(changed).toEqual([green("radish", 2), seed("radish", 1)]);
  });

  it("will not exceed MAX_LINES with a new item", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      lines = upsertLine(lines, "variety", "k" + "a".repeat(i), 1);
    }
    expect(lines).toHaveLength(MAX_LINES);
    expect(upsertLine(lines, "variety", "one-more-green", 1)).toHaveLength(MAX_LINES);
    expect(upsertLine(lines, "seed", "one-more-seed", 1)).toHaveLength(MAX_LINES);
  });

  it("still updates an existing line when the cart is full", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      lines = upsertLine(lines, "variety", "k" + "a".repeat(i), 1);
    }
    const updated = upsertLine(lines, "variety", lines[0].key, 5);
    expect(updated).toHaveLength(MAX_LINES);
    expect(updated[0].units).toBe(5);
  });

  it("leaves other lines untouched", () => {
    const lines = [green("broccoli", 3), green("mustard", 1)];
    expect(upsertLine(lines, "variety", "broccoli", 7)).toEqual([
      green("broccoli", 7),
      green("mustard", 1),
    ]);
  });

  it("preserves position when updating, so a line does not jump", () => {
    const lines = [green("broccoli", 1), seed("radish", 1), green("wheatgrass", 1)];
    expect(upsertLine(lines, "seed", "radish", 9).map(lineId)).toEqual([
      "variety:broccoli",
      "seed:radish",
      "variety:wheatgrass",
    ]);
  });
});

describe("unitsFor — what seeds a detail page's stepper", () => {
  const lines = [green("broccoli", 3), seed("radish", 1), green("radish", 4)];

  /* The bug this fixes: the stepper always mounted at 1 while the header badge
     read 3, so one control said the cart held one thing and the other said
     three. */
  it("reports the quantity already in the cart", () => {
    expect(unitsFor(lines, "variety", "broccoli")).toBe(3);
  });

  it("does not read the other kind's quantity for the same key", () => {
    expect(unitsFor(lines, "seed", "radish")).toBe(1);
    expect(unitsFor(lines, "variety", "radish")).toBe(4);
  });

  it("is 0 for an item not in the cart", () => {
    expect(unitsFor(lines, "variety", "wheatgrass")).toBe(0);
    expect(unitsFor(lines, "seed", "sunflower")).toBe(0);
    expect(unitsFor([], "variety", "broccoli")).toBe(0);
  });

  it("round-trips through the cookie, which is what survives a refresh", () => {
    const parsed = parseCart(serialiseCart(lines));
    expect(unitsFor(parsed, "seed", "radish")).toBe(1);
    expect(unitsFor(parsed, "variety", "radish")).toBe(4);
  });
});

describe("removeFromCart", () => {
  const lines = [green("broccoli", 3), seed("radish", 1), green("radish", 2)];

  it("removes the named line and leaves the rest", () => {
    expect(removeFromCart(lines, "seed", "radish")).toEqual([
      green("broccoli", 3),
      green("radish", 2),
    ]);
  });

  it("ignores a key that is not in the cart", () => {
    expect(removeFromCart(lines, "variety", "wheatgrass")).toEqual(lines);
  });

  it("is safe on an empty cart", () => {
    expect(removeFromCart([], "variety", "broccoli")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const before = structuredClone(lines);
    removeFromCart(lines, "seed", "radish");
    expect(lines).toEqual(before);
  });
});

describe("asCartKind — the only way a string becomes a kind", () => {
  it("accepts the five kinds", () => {
    expect(asCartKind("variety")).toBe("variety");
    expect(asCartKind("seed")).toBe("seed");
    expect(asCartKind("tray")).toBe("tray");
    /* Added 17 Sep 2026. It was in the refusal list below until then, which is
       the list doing its job: `rack` was a plausible-looking kind that the cart
       genuinely could not carry. */
    expect(asCartKind("rack")).toBe("rack");
    /* Grow media, 24 Sep 2026 (SPEC §24). */
    expect(asCartKind("media")).toBe("media");
  });

  /* A form field is not a security boundary (SPEC §8), so a missing or
     invented kind has to be refusable rather than cast. */
  it.each([null, undefined, "", "seeds", "Variety", "v", "racks"])(
    "refuses %p",
    (bad) => {
      expect(asCartKind(bad)).toBeNull();
    },
  );
});

describe("totals", () => {
  it("counts units and grams across the weighed kinds", () => {
    const lines = [seed("radish", 2), tray("tray-pair", 1)];
    expect(cartUnitCount(lines)).toBe(3);
    /* Two 50 g seed units (the unit since 25 Sep 2026); the tray weighs
       nothing here. */
    expect(cartGrams(lines)).toBe(100);
  });

  it("is zero for an empty cart", () => {
    expect(cartUnitCount([])).toBe(0);
    expect(cartGrams([])).toBe(0);
  });

  /**
   * The bug this replaced: `cartGrams` was `cartUnitCount × 100`, which was
   * right while every kind was sold by weight and became a lie the moment
   * trays arrived. A cart holding one pack of trays would have reported 100 g
   * of nothing. A green joined the unweighed side on 19 Sep 2026, when
   * ordering moved from the 100 g to the tray, so it now belongs in this
   * test rather than in the one above.
   */
  it("counts a green and a tray in the unit count but not in the weight", () => {
    const lines = [green("broccoli", 3), tray("tray-pair", 2)];
    expect(cartUnitCount(lines)).toBe(5);
    expect(cartGrams(lines)).toBe(0);
  });

  it("gives a trays-only cart no weight at all", () => {
    const lines = [tray("tray-pair", 1), tray("drain-cell-mat", 4)];
    expect(cartUnitCount(lines)).toBe(5);
    expect(cartGrams(lines)).toBe(0);
  });
});

describe("isWeighed — which kinds have a gram figure at all", () => {
  it("weighs seed only, since a green moved to the tray on 19 Sep 2026", () => {
    expect(isWeighed("variety")).toBe(false);
    expect(isWeighed("seed")).toBe(true);
    expect(isWeighed("tray")).toBe(false);
    /* A 5 kg block is one unit at one price; its kilos are in its name. */
    expect(isWeighed("media")).toBe(false);
  });
});

describe("the grow-media kind on the wire", () => {
  it("reads and writes an `m:` chunk", () => {
    expect(parseCart("m:horti-coir:2")).toEqual([medium("horti-coir", 2)]);
    expect(serialiseCart([medium("horti-coir-bulk", 1)])).toBe("m:horti-coir-bulk:1");
  });

  it("adds a block to the unit count and nothing to the weight", () => {
    const lines = [seed("radish", 2), medium("horti-coir", 3)];
    expect(cartUnitCount(lines)).toBe(5);
    expect(cartGrams(lines)).toBe(100);
  });

  /** Four content folders, one key: four lines, not one. */
  it("keeps one key apart from the tray, seed and green of that name", () => {
    const lines = parseCart("v:radish:1|s:radish:2|t:radish:3|m:radish:4");
    expect(new Set(lines.map(lineId)).size).toBe(4);
    expect(unitsFor(lines, "media", "radish")).toBe(4);
    expect(removeFromCart(lines, "media", "radish").map(lineId)).toEqual([
      "variety:radish",
      "seed:radish",
      "tray:radish",
    ]);
  });

  it("holds a content key to the content-key rule", () => {
    expect(parseCart("m:horti-coir-5kg:1")).toEqual([]);
  });
});

describe("the tray kind on the wire", () => {
  it("reads and writes a `t:` chunk", () => {
    expect(parseCart("t:tray-pair:2")).toEqual([tray("tray-pair", 2)]);
    expect(serialiseCart([tray("drain-cell-mat", 1)])).toBe("t:drain-cell-mat:1");
  });

  it("survives a round trip alongside the other two kinds", () => {
    const lines = [green("broccoli", 3), seed("radish", 2), tray("tray-pair", 1)];
    expect(parseCart(serialiseCart(lines))).toEqual(lines);
  });

  /**
   * The collision the kind exists to prevent, now across three namespaces.
   * `content/varieties/`, `content/seeds/` and `content/trays/` are separate
   * folders, so one key can legitimately name three different things to buy —
   * and they must be three lines at three prices, not one merged line.
   */
  it("keeps one key apart across all three kinds", () => {
    const lines = parseCart("v:radish:1|s:radish:2|t:radish:3");
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map(lineId)).size).toBe(3);
    expect(unitsFor(lines, "tray", "radish")).toBe(3);
    expect(unitsFor(lines, "seed", "radish")).toBe(2);
    expect(unitsFor(lines, "variety", "radish")).toBe(1);

    /* And removing one leaves the other two untouched. */
    const left = removeFromCart(lines, "seed", "radish");
    expect(left.map(lineId)).toEqual(["variety:radish", "tray:radish"]);
  });

  /** The per-line cap is twenty *units*, whatever a unit is — twenty packs of
   *  trays, not twenty 100 g units of them. */
  it("caps a tray line at the same twenty units", () => {
    expect(parseCart(`t:tray-pair:${MAX_UNITS_PER_LINE + 5}`)).toEqual([
      tray("tray-pair", MAX_UNITS_PER_LINE),
    ]);
  });

  /* An unknown kind code is junk, exactly like an unknown kind name. This is
     the guard that stops a hand-edited cookie inventing a fourth catalogue. */
  it("drops a chunk whose kind code is not one of ours", () => {
    expect(parseCart("x:tray-pair:2")).toEqual([]);
  });
});
