import { isValidContentKey } from "@/lib/content/content-key";
import { isValidRackCartKey } from "@/lib/racks/cart-key";

/**
 * The ad-hoc cart — SPEC §18.6. Pure logic only; no cookies, no database.
 *
 * ## What the cart stores, and what it deliberately does not
 *
 * A line is **a kind, a content key and a quantity**. That is all. What one
 * unit means is the kind's business, not the cookie's — one tray of a green,
 * 100 g of a seed, one pack of trays.
 *
 * **No prices.** The cart lives in a cookie, which is client-supplied data, so
 * a price stored there is a price the customer can edit. SPEC §9 is explicit:
 * "never trust a client-reported amount". Every figure shown is recomputed
 * from the DynamoDB row on each read, which also means a price change reaches
 * an abandoned cart instead of being quoted from last week.
 *
 * **No names.** Same reason the key is the key: the display name lives in the
 * content file and may be edited at any time (SPEC §4.3). Storing it would
 * freeze a stale name into the cart.
 *
 * **No stock figure and no delivery date either.** Both are re-read on every
 * request: a seed's grams decide whether its line is promised for tomorrow or
 * the vendor run, and a tray's lead time comes off its row. A cookie carrying
 * either would let a customer keep a stale promise alive by never reloading.
 *
 * Order snapshots are the opposite case — SPEC §4.3 requires an *order* line to
 * snapshot name and price at purchase time so history cannot be rewritten. A
 * cart is not an order; it is a wish, and it should track the catalogue.
 *
 * ## Why a line carries a kind
 *
 * Seeds arrived on 17 Sep 2026 and are keyed in their own content folder, so
 * `radish` is both a microgreen you eat and a seed you sow — two products, two
 * pages, two prices. A cart keyed on the content key alone would merge them
 * into one line and then quote one of the two prices for both.
 *
 * Trays followed the same day and made the kind carry a second job: **what a
 * unit *is*.** A seed unit is 100 g; a tray-product unit is one pack, of two
 * trays or five mats. A variety unit joined them on 19 Sep 2026 — it is now
 * one grown tray, not 100 g — so `GRAMS_PER_UNIT` applies to a shrinking
 * minority of kinds, and `isWeighed` is what says which. A cart holding one
 * green tray or one tray-product pack has a weight of zero and a real
 * subtotal, and both of those are correct.
 *
 * The kind is therefore part of a line's identity everywhere: `unitsFor`,
 * `upsertLine` and `removeFromCart` all take it, and there is no overload that
 * omits it. That is what makes the collision unrepresentable rather than
 * merely unlikely.
 *
 * ## Wire format
 *
 * `v:broccoli:3|s:radish:2|t:tray-pair:1|r:rk-6f-5s-1x3-1.4-orange:1` — one
 * character per kind, chosen
 * over JSON because it is a fraction of the bytes on a cookie sent with every
 * request, and because there is nothing to parse that is not already validated
 * by `isValidKeyFor`.
 *
 * **Neither separator can appear in a key.** A content key is letters and
 * hyphens; a rack key adds digits and dots. No kind's key may contain `:` or
 * `|`, which is what keeps the format unambiguous without escaping.
 *
 * **A two-part chunk is read as a variety**, which is the format every cookie
 * written before 17 Sep 2026 used. Cheaper than a migration nobody can run —
 * the cookies are on other people's machines — and it costs one branch in the
 * parser. It can be dropped once no live cookie predates the change; they
 * expire 30 days after their last write.
 */

/** What a cart line can refer to.
 *
 *  The first three have a content folder, a DynamoDB entity and a detail page
 *  each. **A rack has none of those** — it is one combination out of a rate
 *  card, so it has no content file, its key is a SKU rather than a name, and
 *  its price comes from a model row joined to that card (`findSellableRack`).
 *  That is why `keyRuleFor` exists. */
export const CART_KINDS = ["variety", "seed", "tray", "rack"] as const;
export type CartKind = (typeof CART_KINDS)[number];

/** A quantity of one item. **What one unit means depends on the kind** — see
 *  `isWeighed` and `GRAMS_PER_UNIT`. */
export type CartLine = { kind: CartKind; key: string; units: number };

/** The single character each kind is written as in the cookie. Short because
 *  this string rides on every request. */
const KIND_CODE: Record<CartKind, string> = {
  variety: "v",
  seed: "s",
  tray: "t",
  rack: "r",
};
const KIND_BY_CODE: Record<string, CartKind> = {
  v: "variety",
  s: "seed",
  t: "tray",
  r: "rack",
};

/**
 * What a valid key looks like **for this kind**, because the three content
 * kinds and racks do not agree — and must not be made to.
 *
 * A content key is the filename of a content file and a URL segment, so it is
 * lowercase letters and hyphens with **no digits at all**: that ban is the
 * whole point of the rule, because `amaranth-2` is the naming failure it
 * exists to prevent (`isValidContentKey`).
 *
 * A rack has no content file to name. It is identified by the figures a
 * content key forbids — 6 feet, 5 shelves, a 1.25 × 3 ft footprint, 1.4 mm
 * steel — so it is keyed by its SKU plus its colour (`isValidRackCartKey`).
 *
 * Kind-aware rather than a union of the two patterns, so that loosening one
 * cannot loosen the other. The two sets are provably disjoint — pinned in
 * `cart-key.test.ts` — which is what stops one string addressing two products.
 */
export function isValidKeyFor(kind: CartKind, key: string): boolean {
  return kind === "rack" ? isValidRackCartKey(key) : isValidContentKey(key);
}

/**
 * Which kinds are sold **by weight**, and so have a gram figure at all.
 *
 * Only seed is. A green moved off weight on 19 Sep 2026 — the owner's
 * instruction: ordering and pricing both move to the **tray**, with
 * `Variety.yieldGramsPerTray` staying only as an approximate, informational
 * figure a customer is told, not one anything is priced or counted from. A
 * tray or a drainage mat is sold by the pack (SPEC §23.1) — its weight is a
 * shipping fact about a moulded plastic object, not the thing being bought,
 * and printing "1 pack · 100 g" would be an invented figure. A rack is sold
 * by the rack, and weighs enough that quoting it would read as a shipping
 * figure we have not quoted.
 *
 * Declared as a set rather than `kind !== "tray"` so that adding a kind forces
 * a decision here instead of inheriting the wrong default — which is exactly
 * what happened when racks arrived and this list did not have to change.
 */
const WEIGHED: ReadonlySet<CartKind> = new Set<CartKind>(["seed"]);

export function isWeighed(kind: CartKind): boolean {
  return WEIGHED.has(kind);
}

/**
 * One line caps at twenty units of a single item — twenty trays of a green,
 * 2 kg of a seed, or twenty packs of trays. Past this it is not an ad-hoc
 * order, it is a wholesale enquiry, and the sow plan (or the supplier) should
 * be told about it deliberately rather than by a spinner someone held down.
 *
 * **The only cap left in the cart.** A seed line was once capped by stock as
 * well; since 17 Sep 2026 that is a delivery date rather than a ceiling (SPEC
 * §22.2), and a tray has no stock to cap against at all (§23.1).
 */
export const MAX_UNITS_PER_LINE = 20;

/** Distinct items in one cart, across every kind. Keeps the cookie well
 *  inside the 4 KB limit and the "one delivery on the slowest date" rule
 *  tolerable. */
export const MAX_LINES = 12;

export const CART_COOKIE = "fewgrams_cart";

/** Grams in one unit **of a weighed kind** — a seed's minimum order (SPEC
 *  §22.2). It does not apply to a green, a tray or a rack — see `isWeighed`. */
export const GRAMS_PER_UNIT = 100;

/** A line's identity — kind **and** key. Used as a React key and to compare
 *  lines, so that `radish` the seed and `radish` the green never collide. */
export function lineId(line: { kind: CartKind; key: string }): string {
  return `${line.kind}:${line.key}`;
}

function clampUnits(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), MAX_UNITS_PER_LINE);
}

/** Narrows a string from a form field or a cookie to a kind, or null. Nothing
 *  else in the app may cast to `CartKind`. */
export function asCartKind(raw: string | null | undefined): CartKind | null {
  return (CART_KINDS as readonly string[]).includes(raw ?? "")
    ? (raw as CartKind)
    : null;
}

/**
 * Parse the cookie.
 *
 * **Every failure is silent and total for the offending line**, never an
 * exception: this input arrives from the browser and may be truncated, stale
 * from an older format, or hand-edited. A cart that throws would turn a junk
 * cookie into a 500 on every page that shows a basket count. A dropped line
 * costs the customer one re-add.
 */
export function parseCart(raw: string | undefined | null): CartLine[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const lines: CartLine[] = [];

  for (const chunk of raw.split("|")) {
    const parts = chunk.split(":");
    /* Three parts is the current format; two is a cookie written before kinds
       existed, when every line was a variety. Anything else is junk. */
    const [kind, key, rawUnits] =
      parts.length === 3
        ? [KIND_BY_CODE[parts[0]], parts[1], parts[2]]
        : parts.length === 2
          ? (["variety", parts[0], parts[1]] as const)
          : [undefined, "", ""];

    if (!kind || !key || !isValidKeyFor(kind, key)) continue;
    const id = `${kind}:${key}`;
    if (seen.has(id)) continue;
    const units = clampUnits(Number(rawUnits));
    if (units <= 0) continue;
    seen.add(id);
    lines.push({ kind, key, units });
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

export function serialiseCart(lines: CartLine[]): string {
  return lines
    .filter((l) => l.units > 0)
    .slice(0, MAX_LINES)
    .map((l) => `${KIND_CODE[l.kind]}:${l.key}:${clampUnits(l.units)}`)
    .join("|");
}

/**
 * Set a line to an exact quantity, creating it if absent.
 *
 * **Absolute, never a delta.** This replaced an `addToCart(lines, key, +n)` on
 * 15 Sep 2026, because the detail page's stepper now shows how much is
 * already in the cart rather than starting at 1 every time. Given a stepper
 * reading 3, "add 3" would silently make it 6; "make it 3" is what the control
 * is showing.
 *
 * Absolute also makes the mutation idempotent, which matters for a form that a
 * double-click or a retried request can submit twice.
 *
 * Zero removes the line, which is what lets the cart page's stepper delete by
 * decrementing to nothing — there is no state where a line reads 0 and is
 * still in the cart.
 *
 * **It does not know about stock.** A seed's cap depends on a DynamoDB read,
 * so it is enforced in the action and re-checked on every render
 * (`src/lib/cart/server.ts`); this function stays pure.
 */
export function upsertLine(
  lines: CartLine[],
  kind: CartKind,
  key: string,
  units: number,
): CartLine[] {
  if (!isValidKeyFor(kind, key)) return lines;
  const next = clampUnits(units);
  if (next <= 0) return removeFromCart(lines, kind, key);

  const matches = (l: CartLine) => l.kind === kind && l.key === key;
  if (lines.some(matches)) {
    return lines.map((l) => (matches(l) ? { ...l, units: next } : l));
  }
  if (lines.length >= MAX_LINES) return lines;
  return [...lines, { kind, key, units: next }];
}

/** Units of one item currently in the cart, or 0. This is what seeds a detail
 *  page's stepper, so the control and the header badge agree. */
export function unitsFor(lines: CartLine[], kind: CartKind, key: string): number {
  return lines.find((l) => l.kind === kind && l.key === key)?.units ?? 0;
}

export function removeFromCart(
  lines: CartLine[],
  kind: CartKind,
  key: string,
): CartLine[] {
  return lines.filter((l) => !(l.kind === kind && l.key === key));
}

/**
 * Total units across the cart — what the header badge shows.
 *
 * Deliberately **mixes the kinds**: the badge counts things you are buying, and
 * "3" for two punnets and a tray pack is what a customer would count. It is
 * not a weight and has never been used as one.
 */
export function cartUnitCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.units, 0);
}

/**
 * Total weight of the cart, counting **only the kinds sold by weight**.
 *
 * It used to be `cartUnitCount × 100`, which was right while every kind was
 * weighed and became a lie the moment trays arrived — a cart holding one tray
 * pack would have reported 100 g of nothing.
 */
export function cartGrams(lines: CartLine[]): number {
  return lines
    .filter((l) => isWeighed(l.kind))
    .reduce((sum, l) => sum + l.units * GRAMS_PER_UNIT, 0);
}
