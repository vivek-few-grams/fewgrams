/**
 * Single source of truth for brand identity — SPEC §16 ("Brand name and logo
 * should come from one config file so the visual identity can change cheaply").
 */
export const brand = {
  name: "Fewgrams",
  tagline: "Cut the morning it reaches you.",
  subline: "Microgreens grown to order in Bengaluru. Never frozen, never stored.",
  city: "Bengaluru",
  email: "info.fewgrams@gmail.com",
  instagram: "@fewgrams",
  /** TODO: FSSAI registration is a legal prerequisite to launch — SPEC §16. */
  fssai: null as string | null,
} as const;

/** Deliverable PIN codes. TODO: moves to DynamoDB `PIN#<pincode>` (SPEC §4)
 *  and becomes admin-managed via /admin/pincodes. */
export const servicePins = [
  "560001", "560002", "560003", "560004", "560008", "560011",
  "560025", "560034", "560038", "560042", "560066", "560068",
  "560071", "560076", "560078", "560095", "560102", "560103",
] as const;

export function isServiceable(pin: string): boolean {
  return (servicePins as readonly string[]).includes(pin.trim());
}
