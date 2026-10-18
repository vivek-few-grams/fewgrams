import type { CartKind } from "@/lib/cart/cart";

/**
 * What each thing we sell is, for GST — SPEC §26.1. Checked against
 * Notification 9/2025-CT(Rate) and 10/2025-CT(Rate), in force 22 Sep 2025.
 *
 * Declared per cart kind as a `Record`, so a sixth kind is a type error here
 * rather than a product sold untaxed by omission. A rate is law, not a number
 * the business tunes: there is no admin screen for it, and a change is a
 * reviewed diff.
 */

export type TaxClass = {
  /** At least four digits (GSTR-1 table 12, turnover under ₹5 crore). */
  hsn: string;
  /** Percent; 0 for an exempt supply. */
  rate: number;
};

const BY_KIND: Record<CartKind, TaxClass> = {
  /* "Other vegetables, fresh or chilled" — exempt, with no packaging
     condition (10/2025 entry 35). */
  variety: { hsn: "0709", rate: 0 },
  /* "Seeds … of a kind used for sowing" — exempt only when sold for sowing
     (10/2025 entry 84), which is what the shop sells them for. */
  seed: { hsn: "1209", rate: 0 },
  /* "Other articles of plastics" — 9/2025 Schedule II entry 127. */
  tray: { hsn: "3926", rate: 18 },
  /* Coir pith, processed, for horticulture — Schedule I entry 338. */
  media: { hsn: "53050040", rate: 5 },
  /* "Other furniture" — Schedule II entry 612; 9403 over 7308 is the
     owner's call, 17 Oct 2026. */
  rack: { hsn: "9403", rate: 18 },
};

/**
 * Oil seeds have their own headings, "of seed quality" — exempt all the same
 * (10/2025 entries 82–83), but table 12 reports them under their own code.
 */
const SEED_HSN: Record<string, string> = {
  mustard: "1207",
  sunflower: "1206",
};

export function taxClassFor(kind: CartKind, key: string): TaxClass {
  if (kind === "seed" && SEED_HSN[key]) return { hsn: SEED_HSN[key], rate: 0 };
  return BY_KIND[kind];
}

/** A subscription box is fresh greens — the `variety` class. */
export const SUBSCRIPTION_TAX_CLASS: TaxClass = BY_KIND.variety;

/**
 * The unit and the tariff description GSTR-1's HSN summary (table 12) wants
 * for each code. UQC is one of the portal's fixed unit codes: greens and
 * plans by the tray or box counted (`NOS`), seeds by weight (`KGS`), trays and
 * mats by the pack (`PAC`). The description is the tariff's own words — data
 * for the return, not page copy.
 */
export const HSN_INFO: Record<string, { uqc: "NOS" | "KGS" | "PAC"; description: string }> = {
  "0709": { uqc: "NOS", description: "Other vegetables, fresh or chilled" },
  "1209": { uqc: "KGS", description: "Seeds, fruit and spores, of a kind used for sowing" },
  "1207": { uqc: "KGS", description: "Other oil seeds, of seed quality" },
  "1206": { uqc: "KGS", description: "Sunflower seeds, of seed quality" },
  "3926": { uqc: "PAC", description: "Other articles of plastics" },
  "53050040": { uqc: "NOS", description: "Coir pith, processed, for horticulture or agriculture" },
  "9403": { uqc: "NOS", description: "Other furniture and parts thereof" },
};

/**
 * How much of an order line table 12 counts, in its code's unit: grams as
 * kilograms for seeds, units for everything else.
 */
export function hsnQuantity(line: { kind: CartKind; units: number; grams: number | null }): number {
  return line.kind === "seed" && line.grams !== null ? line.grams / 1000 : line.units;
}
