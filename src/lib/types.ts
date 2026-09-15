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

/** Order is the display order everywhere — the shop overlay, the home page
 *  tiles and the /shop index all iterate this. */
export const CATEGORIES = ["racks", "seeds", "trays", "snacks"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * SPEC §3.1 / §4.3. `yieldGramsPerTray` and `growDays` are the two fields the
 * whole operation computes from, so every variety must publish both.
 *
 * **No text.** As of 15 Sep 2026 a variety carries no name and no description
 * in DynamoDB: every word lives in `content/varieties/<contentKey>.json` and
 * is loaded by src/lib/content/varieties.ts. What is left here is exactly
 * what the business tunes — price, yield, grow days, seed rate, active.
 *
 * `id` is a UUID and never changes. `contentKey` names the content file and
 * is also the public URL segment, so it is an identifier rather than a label:
 * renaming the *display* name is an edit inside the file and moves neither.
 */
export type Variety = {
  id: string;
  /** Kebab-case, e.g. `red-amaranth`. Names the content file and the URL. */
  contentKey: string;
  pricePer100g: number;
  yieldGramsPerTray: number;
  growDays: number;
  seedGramsPerTray?: number;
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

/**
 * SPEC §5.1 / §4.3. `monthlyPrice: null` means Build Your Own, priced by
 * weight.
 *
 * **No text**, exactly like `Variety`. `name`, `blurb` and `highlights` left
 * DynamoDB on 15 Sep 2026 for `content/plans/<contentKey>.json`; `highlights`
 * was the tell, being a plain `string[]` that no locale could reach. What is
 * left here is what the business tunes — price, box weight, card colour,
 * order, recommended, active.
 *
 * `contentKey` replaced `slug` and generates the identical key string, because
 * it does the same two jobs a slug did (stable identifier, URL segment) plus
 * one more: it names the content file. src/lib/db/keys.test.ts pins that the
 * bytes did not move.
 */
export type Plan = {
  id: string;
  /** Kebab-case, e.g. `build-your-own`. Names the content file. */
  contentKey: string;
  monthlyPrice: number | null;
  gramsPerBox: number;
  recommended: boolean;
  sortOrder: number;
  active: boolean;
};

/**
 * Card ground colours — SPEC §17.1 / §18.4.
 *
 * **Not a stored field.** `panel` was a select on the admin form until 15 Sep
 * 2026, which asked the owner to make a decision the design had already made.
 *
 * The rule changed on 15 Sep 2026 from "alternate by position" to
 * **"forest for the recommended plan, then sage and sand for the rest"**. Two
 * reasons:
 *
 * 1. Three cards on one cream ground read as one product in three sizes — the
 *    complaint that prompted this. A ground per card is the cheapest thing
 *    that says "three different things" with no card height spent on it.
 * 2. Position is the wrong thing for the dark card to follow. The dark card is
 *    the recommendation, so it belongs to the same flag as the filled badge:
 *    mark a different plan as recommended in admin and the emphasis moves
 *    without a deploy. Under the old `planPanel(index)` the dark card was
 *    always the middle one, whatever the owner had chosen.
 *
 * The quiet grounds still follow position, because there is nothing in the
 * record that should decide between sage and sand.
 *
 * Contrast of every text colour against every ground is verified in SPEC §17.1.
 *
 * A plain union rather than `(typeof PLAN_PANELS)[number]` over an exported
 * array: the array existed only to derive this type — nothing ever read it as
 * a value — and an exported const nobody imports is one more thing to keep in
 * step for no return.
 */
export type PlanPanel = "forest" | "sage" | "sand";

/** The grounds available to a plan that is *not* the recommended one, in the
 *  order they are handed out. */
const QUIET_PANELS = ["sage", "sand"] as const satisfies readonly PlanPanel[];

/**
 * A ground per card, given each card's `recommended` flag in card order.
 *
 * Takes the whole row rather than one index because the answer for any card
 * depends on the cards before it — how many quiet grounds have already been
 * used. Wraps if a fourth plan ever exists, and copes with nothing or
 * everything being flagged.
 */
export function planPanels(recommended: readonly boolean[]): PlanPanel[] {
  let quiet = 0;
  return recommended.map((isRecommended) =>
    isRecommended ? "forest" : QUIET_PANELS[quiet++ % QUIET_PANELS.length],
  );
}

/** SPEC §4 — `PLAN#<planId> / WEEK#<1..4>`. A template, copied into
 *  `SUB#<subId> / WEEK#<deliveryDate>` at subscription creation and
 *  deliberately not read live, so changing a pack never alters what an
 *  already-paid customer receives. */
export type PlanWeek = {
  planId: string;
  week: number;
  /** Variety `contentKey`s (SPEC §4.3), not names — a rotation references
   *  varieties by their stable key so renaming a green never rewrites a
   *  plan. */
  varietyKeys: string[];
};

/**
 * Top-level navigation taxonomy — SPEC §18.2. This is the site's information
 * architecture, not catalogue content, so it is structural and lives in code.
 * Labels move to `messages/*.json` when next-intl lands (SPEC §4.4).
 *
 * Microgreens leads the list and behaves differently from the rest: it opens
 * the variety image grid (overlay level 2) rather than navigating, because
 * greens are a variety catalogue with their own detail pages, not a product
 * category. Everything after it goes straight to /shop/<slug>.
 */
export const NAV_CATEGORIES = [
  { slug: "microgreens", label: "Microgreens" },
  { slug: "racks", label: "Racks" },
  { slug: "seeds", label: "Seeds" },
  { slug: "trays", label: "Trays" },
  { slug: "snacks", label: "Snacks" },
] as const;

/** A pinned delivery location — SPEC §7. Optional on every address: it comes
 *  from the browser's Geolocation API, which the visitor can refuse, so
 *  nothing may depend on it being present. Captured because a written address
 *  in a large Bengaluru layout is often not enough to find a door. */
export type Geo = { lat: number; lng: number; accuracyM?: number };

/**
 * Delivery address — SPEC §4, `USER#<id> / ADDR#<addrId>`.
 *
 * `pincode` is the field the whole serviceability rule turns on, so it is
 * stored as a string: PIN codes are identifiers, not quantities, and a number
 * would lose a leading zero the day the service area leaves Karnataka.
 */
export type Address = {
  userId: string;
  addrId: string;
  /** Home / Work / Mum's — the customer's own word for this place. */
  label: string;
  /** Who receives it. Not necessarily the account holder. */
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  pincode: string;
  /** Gate code, which floor, where to leave it. Read by the rider. */
  notes?: string;
  geo?: Geo;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Customer profile — SPEC §4, `USER#<id> / PROFILE`.
 *
 * Deliberately thin. Email lives on the Auth.js user item and is authoritative
 * there, because it is the login identifier; duplicating it here would create
 * two answers to "who is this". `name` starts as whatever Google supplied and
 * becomes the customer's own once they edit it.
 */
export type UserProfile = {
  userId: string;
  name?: string;
  phone?: string;
  updatedAt: string;
};

/** SPEC §13 — the one-off order lifecycle. */
export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "packed",
  "out_for_delivery",
  "delivered",
  "failed",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** What `/account/orders` renders per row. Not the stored order — that lands
 *  with checkout (SPEC §14 phase 5) — but the shape the list needs. */
export type OrderSummary = {
  id: string;
  placedAt: string;
  deliveryDate: string | null;
  status: OrderStatus;
  itemCount: number;
  total: number;
};
