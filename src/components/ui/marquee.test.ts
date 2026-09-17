import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_LINES, MARQUEE_SPEED_PX_PER_S, marqueeLines } from "./Marquee";

/**
 * The §17.4 marquee's one load-bearing invariant, and the reason it gets a test
 * rather than an eyeball.
 *
 * `.mcard__marquee-inner` animates `translateY(0 → -50%)`, so the block holds
 * the words twice and **one half has to be taller than the panel it sits in**.
 * If it is not, bare panel crosses the card once every eight seconds — a defect
 * that is invisible in a screenshot, does not fail a type check, and has now
 * been shipped twice: on the 3:2 tray card (measured 0.42 of a panel height at
 * a 700px viewport) and again on the 4:5 rack card (0.38 at 1440px).
 *
 * What makes it easy to get wrong is that it is not a property of this function
 * alone — it depends on the panel's aspect and on the type size, both of which
 * live in Tailwind classes at the call site. So the table below restates each
 * live caller's three numbers and checks they agree. Change a panel's shape or
 * its `sizeClass` and this test is what notices.
 */

/** `line-height` on `.mcard__marquee-line` in globals.css. */
const LINE_HEIGHT = 0.95;

/** Enough that a line box being slightly taller than its font size cannot eat
 *  the whole margin. Both shipped defects were far outside this, not marginal. */
const HEADROOM = 1.1;

type Caller = {
  what: string;
  /** Panel height ÷ panel width, from its `aspect-[…]` class. */
  panelAspect: number;
  /** Type size ÷ panel width. `cqw` is this figure directly; a `vw` clamp has
   *  to be divided out against the panel's own width at that viewport. */
  fontFraction: number;
  words: number;
  minLines: number;
  /** The panel's width in CSS pixels where the figures above were measured. */
  panelWidthPx: number;
  /** `durationSeconds` at the call site, or the CSS default when it omits it. */
  durationSeconds: number;
};

const CALLERS: Caller[] = [
  {
    what: "variety / seed tile — Tile.tsx, aspect-square, clamp(…,1.9vw,1.6rem)",
    panelAspect: 1,
    /* 25.6px of a 308px tile at 1440px, which is where the clamp tops out and
       so the worst case for a square tile in a 4-up grid. */
    fontFraction: 25.6 / 308,
    words: 8,
    minLines: DEFAULT_MIN_LINES,
    panelWidthPx: 308,
    /* Omitted at the call site, so the 8s default in globals.css applies. */
    durationSeconds: 8,
  },
  {
    what: "tray card — shop/trays/page.tsx, aspect-[3/2], text-[7cqw]",
    panelAspect: 2 / 3,
    fontFraction: 0.07,
    words: 4,
    minLines: DEFAULT_MIN_LINES,
    panelWidthPx: 419,
    /* Omitted at the call site — 8s is already inside the band. */
    durationSeconds: 8,
  },
  {
    what: "rack card — shop/racks/page.tsx, aspect-[4/5], text-[6cqw]",
    panelAspect: 5 / 4,
    fontFraction: 0.06,
    /* Six properties of the range, not the range name — see `PROPS` there. */
    words: 6,
    minLines: 26,
    panelWidthPx: 419,
    durationSeconds: 15,
  },
];

describe("marquee loop invariant", () => {
  for (const c of CALLERS) {
    it(`one half overflows its panel: ${c.what}`, () => {
      const lines = marqueeLines(Array.from({ length: c.words }, (_, i) => `w${i}`), c.minLines);
      /* In units of panel width, so it is comparable to `panelAspect`. */
      const halfHeight = lines.length * LINE_HEIGHT * c.fontFraction;
      expect(halfHeight).toBeGreaterThan(c.panelAspect * HEADROOM);
    });
  }

  it("every caller scrolls at the same speed, not the same duration", () => {
    /* The bug this pins: the keyframe moves one half of the block, so a shared
       8s scrolled a 389px half at 49px/s and a 715px half at 89px/s. The owner
       noticed it on the rack card — "Text should scroll bit slow" — and the
       cause was a duration being treated as a speed. */
    for (const c of CALLERS) {
      const lines = marqueeLines(Array.from({ length: c.words }, (_, i) => `w${i}`), c.minLines);
      const halfPx = lines.length * LINE_HEIGHT * c.fontFraction * c.panelWidthPx;
      const speed = halfPx / c.durationSeconds;
      /* Within 20% of the house speed — the durations are whole seconds, so
         they cannot land on it exactly. */
      expect(speed / MARQUEE_SPEED_PX_PER_S).toBeGreaterThan(0.8);
      expect(speed / MARQUEE_SPEED_PX_PER_S).toBeLessThan(1.2);
    }
  });

  it("the default is not enough for a panel taller than it is wide", () => {
    /* Pins the reason `minLines` exists at all: the rack card's own font
       fraction and aspect with the default line count, which is what measured
       0.38 of a panel height in the browser. */
    const six = Array.from({ length: 6 }, (_, i) => `prop${i}`);
    const lines = marqueeLines(six, DEFAULT_MIN_LINES);
    expect(lines.length * LINE_HEIGHT * 0.06).toBeLessThan(5 / 4);
  });
});

describe("marqueeLines", () => {
  it("repeats in whole copies, never a slice", () => {
    /* A slice would put w0, w1 after w7 and then w0 again at the seam. */
    const lines = marqueeLines(["a", "b", "c"], 10);
    expect(lines).toEqual(["a", "b", "c", "a", "b", "c", "a", "b", "c", "a", "b", "c"]);
  });

  it("never returns fewer lines than asked for", () => {
    for (const words of [1, 2, 3, 4, 5, 7, 8, 11]) {
      for (const min of [10, 26, 32]) {
        const lines = marqueeLines(Array.from({ length: words }, (_, i) => `w${i}`), min);
        expect(lines.length).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("renders nothing rather than an empty block when there are no words", () => {
    /* `Marquee` returns null on this, so a card with no labels gets a plain
       panel instead of an element animating emptiness. */
    expect(marqueeLines([])).toEqual([]);
  });

  it("drops a parenthetical qualifier, which is display-only", () => {
    expect(marqueeLines(["Vitamin A (as beta-carotene)"], 1)).toEqual(["Vitamin A"]);
  });

  it("keeps the label when it is entirely a parenthetical", () => {
    /* `split("(")[0]` is empty here, and an empty marquee line would be a
       silent gap in the scroll rather than a visible fault. */
    expect(marqueeLines(["(trace)"], 1)).toEqual(["(trace)"]);
  });
});
