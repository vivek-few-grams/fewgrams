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
  /* `tagline` and `subline` deliberately do NOT live here. They are prose a
     visitor reads, so by the project's own first rule they belong in
     `messages/<locale>/common.json` under `brand.*` — a plain string here
     rendered the English headline on /kn. What stays is identity: names,
     files, addresses, none of which translate. */
  /** The "from" on sign-in emails (`src/auth.ts`). Customer-care email,
   *  phone and WhatsApp live in `content/contact.json` instead, so the care
   *  inbox can change without touching who login links come from. */
  email: "info.fewgrams@gmail.com",
  instagram: "@fewgrams",
  /** TODO: FSSAI registration is a legal prerequisite to launch — SPEC §16. */
  fssai: null as string | null,
} as const;

/* The delivery area is not a PIN list any more — it is a district, decided
   from India Post's directory: `src/lib/pincode/area.ts`. */
