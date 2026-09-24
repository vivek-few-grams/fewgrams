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

/** Every kind of thing the site sells, for the admin on/off switch
 *  (`src/lib/catalogue/visibility.ts`). Microgreens is not a `Category` — it
 *  is the described catalogue at `/microgreens`, not a `/shop/<slug>` grid —
 *  but it is still a product type an owner may want to pull from sale, so the
 *  switch covers it too. */
export const PRODUCT_TYPES = ["microgreens", ...CATEGORIES] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * SPEC §3.1 / §4.3. `yieldGramsPerTray` and `growDays` are the two fields the
 * whole operation computes from, so every variety must publish both.
 *
 * **No text.** As of 15 Sep 2026 a variety carries no name and no description
 * in DynamoDB: every word lives in `content/varieties/<contentKey>.json` and
 * is loaded by src/lib/content/varieties.ts. What is left here is exactly
 * what the business tunes — price, yield, grow days, seed rate, active.
 *
 * **Sold by the tray, not by weight (changed 19 Sep 2026).** `pricePer100g`
 * priced a green the same way as a seed, but a green is never weighed out of
 * a sack — it is cut from a tray that was sown whole, so a per-100 g rate
 * implied a precision the operation does not have. `pricePerTray` is what the
 * customer is actually charged per unit ordered; `yieldGramsPerTray` stays,
 * but its job changed too — it is now the owner's **approximate** weight a
 * tray of this variety yields, published for a customer's information, and it
 * prices nothing. See `isWeighed` in `src/lib/cart/cart.ts`.
 *
 * **The yield is a range, not one number (also 19 Sep 2026).** A tray never
 * cuts to exactly the same weight twice, so a single `yieldGramsPerTray`
 * implied a precision the owner does not have. `yieldGramsPerTrayMin`/`Max`
 * publish the owner's observed low and high instead — still informational,
 * still pricing nothing.
 */
export type Variety = {
  id: string;
  /** Kebab-case, e.g. `red-amaranth`. Names the content file and the URL. */
  contentKey: string;
  /** ₹ for **one tray**, the same unit the cart counts in. */
  pricePerTray: number;
  /** The owner's measured, approximate low and high grams a tray yields —
   *  informational, shown to the customer as a range, and no part of any
   *  price calculation. `yieldGramsPerTrayMax >= yieldGramsPerTrayMin`. */
  yieldGramsPerTrayMin: number;
  yieldGramsPerTrayMax: number;
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

/* ────────────────────────────── Seeds ──────────────────────────────── */

/**
 * A seed variety held in stock and sold by weight — SPEC §3 / §22.
 *
 * **Modelled on `Variety`, not on `Product`**, and that is the whole design.
 * A seed is the one thing in the shop that is simultaneously (a) real stock
 * measured in grams, and (b) something a customer reads about at length before
 * buying — which is exactly the shape a variety already has. So it carries no
 * text at all: name, description, how to sow it and what it germinates like
 * all live in `content/seeds/<contentKey>.json` (SPEC §4.3), and this record
 * holds only the two numbers the business changes — what 100 g costs, and how
 * many grams are on the shelf this morning.
 *
 * It is deliberately **not** a `Product` with `category: "seeds"` and a
 * `stockGrams` variant, which is what SPEC §3 originally described:
 *
 * - `Product.name` is a `LocalisedString` typed into the admin UI. Every
 *   catalogue entity that a customer reads about has since moved its text to
 *   content files, and a seed has more to say than a tray does, not less.
 * - Variants earn their place on trays (virgin vs PP, 10×20 vs 10×10). A seed
 *   has one attribute — how much you want — and it is a quantity, not a
 *   variant. Expressing "100 g / 250 g / 500 g" as three SKUs would multiply
 *   the rows and then have to keep three stock figures consistent against one
 *   sack.
 * - Stock on a variant is stock per SKU. The owner holds one sack of radish
 *   seed, and one number is the honest model of one sack.
 *
 * Racks were pulled out for their own reason (computed pricing, SPEC §19),
 * and trays followed on 17 Sep 2026 for a third one (`Tray`, below). Only
 * snacks are still on `Product`, and nothing writes one yet.
 */
export type Seed = {
  id: string;
  /** Kebab-case, e.g. `sunflower`. Names the content file and the URL.
   *
   *  Seed keys live in their own folder, so `radish` as a seed and `radish`
   *  as a microgreen are two different files and two different pages — which
   *  is correct, because they are two different things to buy. The cart
   *  therefore cannot key a line on the content key alone; see
   *  `src/lib/cart/cart.ts`. */
  contentKey: string;
  /** ₹ per 100 g, the same unit the cart counts in and the same unit the
   *  minimum order is expressed in, so a customer never has to convert
   *  anything. */
  pricePer100g: number;
  /** Grams on the shelf, as the owner last counted them. **Not a cap** — it
   *  decides how fast an order ships, not whether it can be placed: up to
   *  this figure goes out next day, beyond it is bought in on the vendor's
   *  lead time (SPEC §22.2). Zero is a legitimate value and still sells.
   *
   *  **Set, not decremented.** Nothing in the app reduces this yet, because
   *  nothing in the app takes payment yet (SPEC §9); checkout is where a paid
   *  order has to decrement it under a conditional write. Until then it is
   *  what the owner counted, and a promise rather than a reservation. */
  stockGrams: number;
  active: boolean;
};

/* ─────────────────── Trays & drainage (bought in) ───────────────────── */

/**
 * A tray or a drainage mat: **hard goods bought in from a supplier and
 * resold** — SPEC §23.
 *
 * ## Why this is one record shape for two different objects
 *
 * A drain cell mat is not a tray. It is in here anyway, because what this
 * record models is not the object — it is the way the object is sold, and on
 * that the three items launched on 17 Sep 2026 are identical:
 *
 * - **Nothing is held.** No stock figure, because there is no shelf; the
 *   supplier holds it.
 * - **Every order is a purchase order.** The owner's words: *"even these are
 *   ordered based on the request this would take minimum of seven days to
 *   deliver"*. So there is no next-day path at all, which is the one thing
 *   that makes this different from a seed (§22.2) — a seed can come off our
 *   own shelf, a tray never can.
 * - **Sold as a pack at a fixed price**, not by weight. What the pack contains
 *   is a fact about the product, not a quantity a customer chooses.
 *
 * One shape for all three beats a `kind` discriminator that nothing would
 * branch on. The category is labelled **"Trays & drainage"** for the same
 * reason: it is what the owner calls it, and it is honest about holding both.
 *
 * ## No text, like every other catalogue record since 15 Sep 2026
 *
 * `/admin/trays` owns **two numbers and a toggle** — the price and the lead
 * time — and not one word. The name, the one-line description and the spec
 * table live in `content/trays/<contentKey>.json` (SPEC §4.3), where the
 * supplier's dimensions and material get a git history and a diff.
 *
 * That is the right split here for a reason beyond consistency: these figures
 * are **the supplier's, and they never change**. A 60 × 30 cm tray 3 mm thick
 * is 60 × 30 cm 3 mm thick forever; what moves is what we charge for it.
 */
export type Tray = {
  id: string;
  /** Kebab-case, e.g. `drain-cell-mat`. Names the content file.
   *
   *  Its own folder and its own namespace, like seeds: `content/trays/` can
   *  hold a `radish` one day without colliding with the seed or the green of
   *  that name. `keys.test.ts` pins the partition separation. */
  contentKey: string;
  /** ₹ for the pack as sold, whole. Not per piece and not per kilo: a pack of
   *  five mats has one price, and dividing it by five would invite an order
   *  for one mat that the supplier will not break a pack for. */
  price: number;
  /**
   * Working days from order to delivery, as the owner promises them.
   *
   * **Per row, not one constant.** Seven days is the owner's stated minimum
   * and it is what all three items launched with, but the three come from two
   * different suppliers already, so one global figure would be an average
   * pretending to be a promise. This is the same mistake §22.8 flags as still
   * open for seeds, avoided here because the divergence is visible on day one.
   *
   * Bounded at both ends by `src/lib/trays/lead-time.ts` — never below the
   * owner's seven, never past what the delivery-date arithmetic will print.
   */
  leadDays: number;
  active: boolean;
  /**
   * Packing, for the courier (SPEC §7). All six or none — absent until the
   * owner has measured the item, and a courier order for it is then refused
   * rather than guessed. A "piece" is what stacks: one tray, or one
   * drainage-mat set of five, recorded as one piece so every row has the same
   * fields (the owner's call, 23 Sep 2026).
   */
  packPieces?: number;
  pieceLengthCm?: number;
  pieceWidthCm?: number;
  /** Height of the first piece. */
  pieceHeightCm?: number;
  /** Height each further stacked piece adds. */
  pieceStackCm?: number;
  pieceGrams?: number;
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
  /** Only on addresses saved before 23 Sep 2026, when the form asked for a
   *  city. District replaced it; `formatPlace` shows whichever is there. */
  city?: string;
  /** From the PIN via India Post, correctable by the customer. Absent on
   *  addresses saved before 23 Sep 2026. */
  district?: string;
  state?: string;
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

/**
 * SPEC §13 — the one-off order lifecycle. `paid` is a new order nobody has
 * started; `picked` means someone has taken it on and is putting it
 * together; `ready_for_delivery` means it is complete and waiting for the
 * delivery agent. `packed` was here before picking was split out, and no row
 * ever held it.
 */
export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "picked",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "failed",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** What `/account/orders` renders per row — a projection of the stored
 *  `Order` (src/lib/orders/order.ts). */
export type OrderSummary = {
  id: string;
  /** Null only if payment landed but the receipt number was not yet drawn. */
  receiptNo: number | null;
  placedAt: string;
  deliveryDate: string | null;
  status: OrderStatus;
  itemCount: number;
  total: number;
};

/* ────────────────────────────── Racks ──────────────────────────────── */

/**
 * Racks are **computed from a component rate card**, not entered as finished
 * products with a typed-in price (SPEC §3 / §19).
 *
 * The reason is the owner's: vendor rates move — a bolt goes from ₹2 to ₹2.50,
 * steel goes up — and nobody should re-derive a price list by hand when they
 * do. Storing what a rack costs makes every rate change a spreadsheet
 * exercise; storing what a rack is *made of* makes it one edited number.
 *
 * Three layers, and the separation matters:
 *
 * | Layer | Changes | Type |
 * |---|---|---|
 * | rates — what parts cost | often, from the vendor | `RackSettings`, `ShelfPlate`, `AngleGrade` |
 * | rules — how a rack is assembled | rarely | `RackSettings` |
 * | models — the racks actually sold | when the range changes | `ProductVariant.build` |
 *
 * A model's **price is stored, and rewritten whenever a rate changes** — the
 * cascade in `src/lib/racks/reprice.ts`. It is not derived on read, so a cart
 * and an order line always have one concrete number to quote, but it is not
 * frozen either: editing a rate reprices every rack that uses it immediately.
 *
 * It was frozen until 17 Sep 2026, when the owner asked for the cascade:
 * *"we need to add logic to update prices of all variants as soon as primary
 * raw material cost is updated, No need of approval."* `costAtPublish` stayed —
 * it is now the record of which cost a stored price was computed from, and the
 * screens still flag a row where the two have come apart, which after the
 * cascade should only happen if something wrote to the table behind the app.
 */

/** A shelf. Priced per size, never per square foot: the vendor's own figures
 *  are not linear in area — 1×3 ft works out at ₹67/sq ft and 2×3 ft at
 *  ₹92/sq ft, because thickness climbs with depth. One row per size the
 *  vendor sells is the only faithful model. */
export type ShelfPlate = {
  id: string;
  depthFt: number;
  lengthFt: number;
  thicknessMm: number;
  /** Vendor's stated load per shelf, uniformly distributed. */
  capacityKg: number;
  /** Cost of one plate, in rupees. */
  price: number;
  active: boolean;
  /** Packed weight per shelf, legs and fixings shared in — SPEC §7. Absent
   *  until weighed; a courier order for a rack on it is then refused. */
  gramsPerShelf?: number;
};

/** Slotted angle, sold by the foot and used for the four legs.
 *
 *  `colours` belongs to the grade rather than to the rack because the vendor
 *  couples them: each gauge comes in its own set. A rack picks a grade and then
 *  a colour *from that grade*, so an impossible combination cannot be entered.
 *
 *  **No `finish`.** There was one, `"painted" | "powder"`, and it went on
 *  17 Sep 2026 when the owner settled on powder coat for every rack. A field
 *  with one possible value carries no information, and the add form defaulting
 *  it to "Painted" was worse than useless — it offered a product that is not
 *  sold. Powder coat is now a fact about the range, stated once in copy rather
 *  than stored per row. Bring it back only if a second finish really is sold. */
export type AngleGrade = {
  id: string;
  thicknessMm: number;
  colours: string[];
  /** Cost per running foot, in rupees. */
  ratePerFt: number;
  active: boolean;
};

/** The rates and rules that are not a table — one row, edited in one form. */
export type RackSettings = {
  /** ₹ for one bolt **and** its nut. The vendor quotes the pair, so this is
   *  one figure and the counts below are in pairs, not in bolts. */
  boltSetPrice: number;
  bushPrice: number;
  legsPerRack: number;
  boltSetsPerShelf: number;
  /** Per rack, not per shelf — confirmed with the vendor 16 Sep 2026. */
  bushesPerRack: number;
  /** Heights offered, in feet. Angle is priced per foot so any height is
   *  buildable; this is the range on sale. */
  heightsFt: number[];
  /* No `shelfPitchInches`. It held "minimum clear height per tier" and capped
     the shelf count at 14 in, which produced the right figures but expressed a
     ceiling — so a 6 ft rack could be published with 2 shelves. The vendor's
     rule is an identity: shelves are `height − 1`, derived by
     `shelvesForHeight`, so there is no setting and no field. */
  /** Applied to material cost to reach the retail price. Starts at 0 so the
   *  screen never shows a margin nobody chose. */
  markupPercent: number;
  /** Retail prices are rounded **up** to this multiple, never down — rounding
   *  down would quietly eat the margin the markup just added. 1 disables it. */
  roundUpToNearest: number;
};

/**
 * What a rack model is: a height, a shelf count, and which parts. Stored on
 * the published model so its price can be recomputed later without the owner
 * re-entering anything.
 *
 * **No colour** (17 Sep 2026). There was one, and a rack had to pick a colour
 * from its grade at publish — which made "6 ft, 5 shelves, 1¼ × 3 ft" in
 * orange, green and purple three separate models at an identical price. The
 * angle grade already records which colours it comes in, that list applies to
 * every rack built on it, and the colour changes nothing about the cost. So it
 * is a choice the customer makes at purchase, from the grade's list, not a
 * variant the owner publishes.
 */
export type RackConfig = {
  heightFt: number;
  shelves: number;
  plateId: string;
  angleId: string;
};

/**
 * A rack actually on sale: a config, and the price that was published for it.
 *
 * **The price is stored, and follows the rates.** A rate edit reprices it
 * immediately (`repriceAllRacks`), so the three-layer split now does the whole
 * job the owner wanted from it: change one number, and every rack that uses it
 * is correct without anyone accepting anything.
 *
 * It is stored rather than derived on read so that a cart, a receipt and an
 * order line have one concrete figure to quote, and so that a rack whose parts
 * have been retired keeps its last good price instead of reading as ₹0.
 * `costAtPublish` records the cost this price was computed from — the margin
 * on the row, and the check that the cascade actually reached it.
 *
 * **No name field.** A model is identified by what it is — 6 ft, 5 shelves,
 * 1¼ × 3 ft, green — which is what the admin table shows and what a packing
 * slip needs. Customer-facing names ("Starter", "Grower") belong with the
 * customer view, which is not built yet; declaring the field now would leave
 * one more thing in the schema that nothing reads.
 *
 * **No `sortOrder` either.** There was one, and it was a number the owner had
 * to type for every rack. Removed 17 Sep 2026: display order is *shortest
 * rack first*, which is a fact about the config and not a decision anyone
 * needs to make. Deriving it also removed the field's own bug — an empty input
 * read as a deliberate 0, so every rack added without one sorted together.
 * See `listRackModels` for the comparison.
 */
export type RackModel = {
  id: string;
  config: RackConfig;
  /** What a customer pays. Set by the owner at publish, from `retailPrice`. */
  price: number;
  /** Material cost when `price` was set — the staleness baseline. */
  costAtPublish: number;
  publishedAt: string;
  active: boolean;
};

/** The itemised material cost, kept itemised because the admin screen shows
 *  the working. A single total is impossible to check against a vendor
 *  invoice; these four lines are.
 *
 *  Shared by both rack categories, so `shelves` is "whatever the shelves
 *  cost": the plates on a plated rack, the angle framing on an open one. */
export type RackCost = {
  legs: number;
  shelves: number;
  bolts: number;
  bushes: number;
  total: number;
};

/* ───────────────────── Slotted-angle racks (open frame) ─────────────── */

/**
 * The second rack category (17 Sep 2026): **a rack built entirely from
 * slotted angle, with no shelf plates at all.**
 *
 * The owner's description: each shelf level is a rectangle of angle — two
 * along the length, two across the depth — plus **one more along the length
 * down the middle**, which braces the span and is where an LED tube mounts.
 * So a 4 ft × 1 ft level takes three 4 ft pieces and two 1 ft pieces, and
 * `frameFeetPerShelf` is the whole of that rule.
 *
 * What it shares with a plated rack, and why it is a separate page rather
 * than a flag on `RackModel`:
 *
 * - **Shared:** every rate. Bolt, bush, legs per rack, bolt pairs per shelf,
 *   bushes per rack, the heights on sale, markup and rounding all come from
 *   the same `RackSettings`, and the legs and the framing are priced from the
 *   same `AngleGrade.ratePerFt`. Duplicating any of those would defeat the
 *   point of the three-layer split — a bolt going from ₹2 to ₹2.50 must stay
 *   one edited number, not two.
 * - **Not shared:** what a shelf *is*. A plated shelf is a bought part with
 *   its own price and load rating; an open frame is five lengths of angle, so
 *   it has no price of its own and no vendor capacity figure. That is a
 *   different table, which is why it is a different screen.
 *
 * Bolt and nut counts are taken as identical to a plated rack — the owner's
 * call: *"even if there is any additional it will be very negligible so we
 * don't have to consider it."*
 */

/**
 * A shelf footprint for an open-frame rack. **No price and no capacity**, and
 * both absences are the point.
 *
 * No price, because an open frame is not a part the vendor sells: it is
 * `3 × length + 2 × depth` feet of angle, priced from the grade's rate per
 * foot. Storing a price would be storing the answer to a sum — exactly what
 * the plated rack's rate card was built to avoid.
 *
 * No capacity, because there is no deck to load. The vendor's `capacityKg`
 * rates a steel plate; what an open frame holds depends on what the buyer
 * rests on it, and inventing a figure here would repeat the mistake of the
 * "trays per shelf" column removed on 16 Sep 2026.
 *
 * Unlike `ShelfPlate` the list is **Fewgrams' choice, not the vendor's** —
 * any footprint is buildable from angle by the foot, so this is the range on
 * offer rather than a catalogue of stocked sizes.
 */
export type FrameSize = {
  id: string;
  depthFt: number;
  lengthFt: number;
  active: boolean;
  /** Packed weight per shelf — see `ShelfPlate.gramsPerShelf`. */
  gramsPerShelf?: number;
};

/** Same shape as `RackConfig` with a frame footprint in place of a plate.
 *  Shelves are still `height − 1` and colour still belongs to the grade. */
export type AngleRackConfig = {
  heightFt: number;
  shelves: number;
  frameId: string;
  angleId: string;
};

/** An open-frame rack on sale. Price stored and recomputed on every rate
 *  change, against `costAtPublish`, for the reasons set out on `RackModel`. */
export type AngleRackModel = {
  id: string;
  config: AngleRackConfig;
  price: number;
  costAtPublish: number;
  publishedAt: string;
  active: boolean;
};

/* ────────────────────────── UPVC pipe racks ─────────────────────────── */

/**
 * The third rack category (17 Sep 2026): **a rack built from 1 inch UPVC
 * pipe, joined with four-way connectors.**
 *
 * The owner's reason for it is not price: *"in this the stability is a bit
 * important."* It is the lightest of the three to move, it does not rust in a
 * wet grow room, and it wipes clean. It is also the **most expensive** of the
 * three — see `pipeRackCost` — because the fittings cost more than the pipe.
 *
 * What it shares with the other two ranges, and what it does not:
 *
 * - **Shared:** the four corner legs, the heights on sale, markup and
 *   rounding. Those are commercial policy and frame geometry, not materials.
 * - **Its own:** every material rate. No other range buys pipe, connectors or
 *   pipe bushes, so there is nothing to share and `PipeSettings` is a separate
 *   row — putting ₹25/ft on `RackSettings` would leave three fields the
 *   plated rates form neither shows nor writes.
 *
 * Three things are deliberately *absent* compared to the other ranges:
 *
 * 1. **No grade and no colour.** Pipe is pipe; there is one spec and it is
 *    white. So a footprint and a height are the whole of a model, which is
 *    why `PipeRackConfig` has three fields where `RackConfig` has four.
 * 2. **No bolts.** The joint *is* the connector. There is nothing to bolt.
 * 3. **No capacity figure**, for the same reason as the open frame: there is
 *    no vendor-rated deck, and inventing a number would repeat the "trays per
 *    shelf" column removed on 16 Sep 2026.
 */

/** The three material rates that exist only in this range.
 *
 *  A separate DynamoDB row rather than three more fields on `RackSettings`,
 *  because nothing else buys any of them: on the shared row they would be
 *  three attributes the plated rates form does not render and does not write,
 *  which is the "unread schema field" the project rules say to cut. */
export type PipeSettings = {
  /** ₹ per running foot of 1 inch UPVC pipe. ₹25 as quoted. */
  ratePerFt: number;
  /** ₹ for one four-way connector. ₹110 as quoted — and it is the single
   *  largest line in the bill, not the pipe. */
  connectorPrice: number;
  /** ₹ for one bottom bush, **per leg** — which is where this range parts
   *  company with the other two. A plated rack takes four bushes whatever its
   *  shelf count (`RackSettings.bushesPerRack`); a pipe rack takes one per
   *  leg, so a 4 ft rack with its middle support takes six. */
  bushPrice: number;
};

/**
 * A shelf footprint for the pipe range. Same shape as `FrameSize`, and a
 * separate list rather than a shared one because the **sizes are different**:
 * the owner dropped 1¼ ft depth and added 2½ ft length, which no other range
 * offers.
 *
 * No price and no capacity, for the reasons on `FrameSize`.
 */
export type PipeSize = {
  id: string;
  depthFt: number;
  lengthFt: number;
  active: boolean;
  /** Packed weight per shelf — see `ShelfPlate.gramsPerShelf`. */
  gramsPerShelf?: number;
};

/** A height and a footprint, and that is all there is to choose. No grade and
 *  no colour — see the note above. Shelves are still `height − 1`. */
export type PipeRackConfig = {
  heightFt: number;
  shelves: number;
  pipeSizeId: string;
};

/** A pipe rack on sale. Price stored and recomputed on every rate change,
 *  against `costAtPublish`, for the reasons set out on `RackModel`. */
export type PipeRackModel = {
  id: string;
  config: PipeRackConfig;
  price: number;
  costAtPublish: number;
  publishedAt: string;
  active: boolean;
};

/**
 * The itemised cost of a pipe rack.
 *
 * A separate type from `RackCost` rather than a reuse of it, because the four
 * lines are genuinely different things. `RackCost.bolts` is a bag of ₹2
 * fasteners and rounds to noise; the connector line here is the **biggest
 * number in the bill**, routinely more than all the pipe put together. Calling
 * a ₹110 fitting a bolt would hide exactly the figure an operator needs to see.
 */
export type PipeRackCost = {
  /** Pipe in the uprights — the corner legs plus any middle support. */
  legs: number;
  /** Pipe in the shelf frames. */
  shelves: number;
  /** Four-way connectors: one per leg, per shelf level. */
  connectors: number;
  /** Bottom bushes: one per leg, once per rack. */
  bushes: number;
  total: number;
};
