import { describe, expect, it } from "vitest";
import { lineQuantity, lineUnits, stepKey } from "./line-display";

/** Echoes the message key and its values, so a test reads which wording a
 *  line chose without loading a catalogue. */
const t = (key: string, values?: Record<string, number>) => `${key}${values ? JSON.stringify(values) : ""}`;

describe("a green's wording — 100 g boxes since 19 Oct 2026, trays before", () => {
  it("prints a green in the cart by weight, as a seed is", () => {
    expect(lineUnits({ kind: "variety", unitPrice: 90, units: 3, grams: 300 }, t)).toBe(
      'linePrice{"price":90} · lineGrams{"grams":300}',
    );
    expect(lineQuantity("variety", 2, t)).toBe('lineGrams{"grams":200}');
    expect(stepKey("variety", "increase")).toBe("increase");
  });

  /* An order line snapshots what was bought. One from the tray month has no
     grams, and its order page and invoice must still say trays. */
  it("keeps a green bought by the tray in trays", () => {
    expect(lineUnits({ kind: "variety", unitPrice: 75, units: 2, grams: null }, t)).toBe(
      'linePriceTray{"price":75} · lineTrays{"count":2}',
    );
    expect(lineQuantity("variety", 2, t, null)).toBe('lineTrays{"count":2}');
    expect(lineQuantity("variety", 2, t, 200)).toBe('lineGrams{"grams":200}');
  });

  it("leaves the other kinds' units alone", () => {
    expect(lineQuantity("tray", 2, t, null)).toBe('linePacks{"count":2}');
    expect(lineQuantity("seed", 2, t, 200)).toBe('lineGrams{"grams":200}');
    expect(stepKey("tray", "decrease")).toBe("decreasePack");
  });
});
