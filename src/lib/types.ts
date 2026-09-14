/** SPEC §4.4 — admin-created text is stored as a localised map, never a plain
 *  string. Retrofitting this later means a data migration plus touching every
 *  read site. */
export type LocalisedString = { en: string; kn?: string };

/** Resolution rule, SPEC §4.4: fall back to English on any missing kn value.
 *  Never render an empty string or a raw key. */
export function t(s: LocalisedString | undefined, locale = "en"): string {
  if (!s) return "";
  if (locale === "kn" && s.kn) return s.kn;
  return s.en;
}

export const CATEGORIES = ["racks", "trays", "seeds", "snacks"] as const;
export type Category = (typeof CATEGORIES)[number];

/** SPEC §3.1. `yieldGramsPerTray` and `growDays` are the two fields the whole
 *  operation computes from, so every variety must publish both. */
export type Variety = {
  id: string;
  slug: string;
  name: LocalisedString;
  pricePer100g: number;
  yieldGramsPerTray: number;
  growDays: number;
  seedGramsPerTray?: number;
  tier: "essential" | "exotic";
  active: boolean;
};

/** SPEC §3.0.1 — the product model carries variants from the start rather than
 *  having them retrofitted when trays need material and size. */
export type ProductVariant = {
  sku: string;
  attributes: Record<string, string>;
  price: number;
  stockGrams?: number;
  active: boolean;
};

export type Product = {
  id: string;
  slug: string;
  category: Category;
  name: LocalisedString;
  basePrice: number;
  variants: ProductVariant[];
  active: boolean;
  /** Reserved now so GST can be switched on later without a migration
   *  (SPEC §9.1). */
  hsnCode?: string;
  taxRate?: number;
};

/** SPEC §5.1. `monthlyPrice: null` means Build Your Own, priced by weight. */
export type Plan = {
  id: string;
  slug: string;
  name: LocalisedString;
  blurb: LocalisedString;
  monthlyPrice: number | null;
  gramsPerBox: number;
  highlights: string[];
  recommended: boolean;
  panel: "sage" | "forest" | "sand";
  sortOrder: number;
  active: boolean;
};

/** SPEC §4 — `PLAN#<planId> / WEEK#<1..4>`. A template, copied into
 *  `SUB#<subId> / WEEK#<deliveryDate>` at subscription creation and
 *  deliberately not read live, so changing a pack never alters what an
 *  already-paid customer receives. */
export type PlanWeek = {
  planId: string;
  week: number;
  varietySlugs: string[];
};

/**
 * Top-level navigation taxonomy — SPEC §18.2. This is the site's information
 * architecture, not catalogue content, so it is structural and lives in code.
 * Labels move to `messages/*.json` when next-intl lands (SPEC §4.4).
 */
export const NAV_CATEGORIES = [
  { slug: "microgreens", label: "Microgreens" },
  { slug: "racks", label: "Racks" },
  { slug: "trays", label: "Trays" },
  { slug: "seeds", label: "Seeds" },
  { slug: "snacks", label: "Snacks" },
] as const;
