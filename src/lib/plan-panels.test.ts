import { describe, expect, it } from "vitest";
import { planPanels } from "./types";

/**
 * The card-ground rule — SPEC §18.4.
 *
 * Worth a test rather than a glance because it carries the one thing the owner
 * controls from admin: which card is the dark one. A regression here is not a
 * visual nit, it is the recommendation pointing at the wrong plan.
 */
describe("planPanels", () => {
  it("gives the recommended plan the dark ground wherever it sits", () => {
    expect(planPanels([true, false, false])).toEqual(["forest", "sage", "sand"]);
    expect(planPanels([false, true, false])).toEqual(["sage", "forest", "sand"]);
    expect(planPanels([false, false, true])).toEqual(["sage", "sand", "forest"]);
  });

  /* Adjacency, not uniqueness — that is the property the design needs, and
     the two are different once there are more quiet cards than quiet grounds.
     Three unflagged plans give sage, sand, sage: a repeat, but never a seam
     where one ground runs straight into itself. */
  it("never puts two cards of the same ground next to each other", () => {
    for (const flags of [
      [true, false, false],
      [false, true, false],
      [false, false, true],
      [false, false, false],
      [true, false, false, false],
    ]) {
      const grounds = planPanels(flags);
      for (let i = 1; i < grounds.length; i++) {
        expect(grounds[i], flags.join()).not.toBe(grounds[i - 1]);
      }
    }
  });

  it("copes with nothing flagged and with everything flagged", () => {
    expect(planPanels([false, false, false])).toEqual(["sage", "sand", "sage"]);
    expect(planPanels([true, true, true])).toEqual(["forest", "forest", "forest"]);
  });

  it("wraps if a fourth plan ever exists", () => {
    expect(planPanels([true, false, false, false])).toEqual([
      "forest",
      "sage",
      "sand",
      "sage",
    ]);
  });

  it("returns nothing for no plans", () => {
    expect(planPanels([])).toEqual([]);
  });
});
