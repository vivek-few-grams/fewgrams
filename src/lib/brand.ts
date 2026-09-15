/**
 * Single source of truth for brand identity — SPEC §16 ("Brand name and logo
 * should come from one config file so the visual identity can change cheaply").
 */
export const brand = {
  name: "Fewgrams",
  /**
   * The logo lockup — `public/brand/fewgrams-logo.svg`.
   *
   * Intrinsic size comes from the file's own viewBox (2112 x 1788, aspect
   * 1.18:1) and is declared here so `next/image` can reserve the box and no
   * layout shifts when it loads. Verified the artwork is not clipped by that
   * viewBox: the ink sits about 40 user units inside it on every side.
   *
   * Source file is `fewgrams-divider-greenbrown_6.svg`. Despite the name it is
   * the stacked lockup, not a divider — its own `aria-label` reads "few grams -
   * Goodness in every gram".
   *
   * **Green and brown on light only** — `#3A6122` on forest would disappear.
   * Use `logoLight` on any dark ground. The footer still renders the wordmark
   * as text; it predates both files.
   */
  logo: {
    src: "/brand/fewgrams-logo.svg",
    width: 2112,
    height: 1788,
  },
  /**
   * The same lockup for dark grounds — white wordmark, tan rule, leaf-green
   * mark. Source `fewgrams-divider-greenbrown-white.svg`, added 15 Sep 2026
   * for the page curtain (§17.5), which sits on forest.
   *
   * **Its viewBox is 2112 x 1845, not 1788** — a taller box than the dark
   * variant, so the two are not interchangeable at a fixed height and each
   * declares its own intrinsic size.
   */
  logoLight: {
    src: "/brand/fewgrams-logo-white.svg",
    width: 2112,
    height: 1845,
  },
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
