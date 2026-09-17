/**
 * The colours an angle grade can be offered in.
 *
 * A fixed palette, picked from rather than typed, for the same reason `finish`
 * is a `<select>`: free text let an operator enter "grey", "Grey" and "gray" as
 * three different colours, and a rack referencing any of them would then fail
 * the colour check on its grade.
 *
 * **Slugs are stored, labels are resolved.** `AngleGrade.colours` and
 * `RackConfig.colour` hold `"orange"`, never `"Orange"`, and the visible word
 * comes from `admin.racks.colours.<slug>`. That is the `finish` pattern again,
 * and it is what lets the customer view print the colour in Kannada later
 * without migrating stored data — a display string in the database would have
 * to be rewritten row by row.
 *
 * `hex` is presentation only and deliberately not translatable: a swatch is
 * the fastest way to pick a colour, and far more reliable than a word when the
 * vendor's "purple" and yours might differ.
 *
 * **Adding a colour is a one-line edit here plus a label.** That is a real
 * cost — the admin screen is meant to stand alone — but the alternative is a
 * second CRUD screen with a colour picker for a side product, and a palette
 * this wide already covers any powder-coat range. Revisit if the vendor's list
 * actually outgrows it.
 */
export const RACK_COLOURS = [
  { slug: "red", hex: "#C0392B" },
  { slug: "orange", hex: "#E67E22" },
  { slug: "yellow", hex: "#F1C40F" },
  { slug: "green", hex: "#27AE60" },
  { slug: "blue", hex: "#2980B9" },
  { slug: "purple", hex: "#8E44AD" },
  { slug: "pink", hex: "#E84393" },
  { slug: "grey", hex: "#7F8C8D" },
  { slug: "black", hex: "#2C3E50" },
  { slug: "white", hex: "#F7F5EF" },
] as const;

export type RackColour = (typeof RACK_COLOURS)[number]["slug"];

const SLUGS: ReadonlySet<string> = new Set(RACK_COLOURS.map((c) => c.slug));

/** Guards what a form posts. A server action is addressable without its form,
 *  so the palette is enforced here and not only by the checkbox list. */
export function isRackColour(value: string): value is RackColour {
  return SLUGS.has(value);
}

/** The swatch for a stored slug, or `null` for one no longer in the palette —
 *  a colour removed from the list must not crash a row that still uses it. */
export function colourHex(slug: string): string | null {
  return RACK_COLOURS.find((c) => c.slug === slug)?.hex ?? null;
}
