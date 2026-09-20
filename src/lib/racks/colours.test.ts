import { describe, expect, it } from "vitest";
import { RACK_COLOURS, colourHex, isRackColour } from "./colours";
import { VENDOR_SEED } from "./pricing";

/**
 * The palette is the contract between three places: what the picker offers,
 * what the server action accepts, and what `admin.racks.colours.<slug>` can
 * name. These pin that they cannot drift apart silently.
 */
describe("rack colour palette", () => {
  it("accepts only palette slugs", () => {
    expect(isRackColour("orange")).toBe(true);
    /* Capitalised is the old free-text form. It must be rejected, not
       normalised — accepting it is how "grey", "Grey" and "gray" became three
       different colours in the first place. */
    expect(isRackColour("Orange")).toBe(false);
    expect(isRackColour("chartreuse")).toBe(false);
    expect(isRackColour("")).toBe(false);
  });

  it("gives every slug a swatch", () => {
    for (const { slug } of RACK_COLOURS) expect(colourHex(slug)).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("returns null for a slug that has left the palette", () => {
    // A grade saved before a colour was removed must not crash its row.
    expect(colourHex("Orange")).toBeNull();
  });

  it("has no duplicate slugs", () => {
    const slugs = RACK_COLOURS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("seeds only the powder-coated gauge as available to build on", () => {
    /* The owner dropped painted grey on 17 Sep 2026. The painted rates stay in
       the seed as a record of the quote, so what this pins is that they arrive
       switched off — a fresh install must not put a painted rack on sale.
       There is no `finish` field to assert against any more, which is the
       point: 1.4 mm *is* the powder-coated gauge. */
    const active = VENDOR_SEED.angles.filter((a) => a.active);
    expect(active.map((a) => a.thicknessMm)).toEqual([1.4]);
    expect(active.flatMap((a) => a.colours)).toEqual(["orange", "green", "purple"]);
  });

  it("seeds the vendor's grades with palette slugs, not display words", () => {
    /* The seed is what a fresh install stores, so a display word here would
       put unresolvable colours straight into the database. */
    const seeded = VENDOR_SEED.angles.flatMap((a) => a.colours);
    expect(seeded.filter((c) => !isRackColour(c))).toEqual([]);
  });
});
