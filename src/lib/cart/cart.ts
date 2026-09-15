import { isValidContentKey } from "@/lib/content/content-key";

/**
 * The ad-hoc cart — SPEC §18.6. Pure logic only; no cookies, no database.
 *
 * ## What the cart stores, and what it deliberately does not
 *
 * A line is **a content key and a number of 100 g units**. That is all.
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
 * Order snapshots are the opposite case — SPEC §4.3 requires an *order* line to
 * snapshot name and price at purchase time so history cannot be rewritten. A
 * cart is not an order; it is a wish, and it should track the catalogue.
 *
 * ## Wire format
 *
 * `broccoli:3|mustard:2` — chosen over JSON because it is a fraction of the
 * bytes on a cookie sent with every request, and because there is nothing to
 * parse that is not already validated by `isValidContentKey`.
 */

/** 100 g units of one variety. */
export type CartLine = { key: string; units: number };

/** One line caps at 2 kg of a single green. Past this it is not an ad-hoc
 *  order, it is a wholesale enquiry, and the sow plan should be told about it
 *  deliberately rather than by a spinner someone held down. */
export const MAX_UNITS_PER_LINE = 20;

/** Distinct varieties in one cart. Keeps the cookie well inside the 4 KB
 *  limit and the "one delivery on the slowest date" rule tolerable. */
export const MAX_LINES = 12;

export const CART_COOKIE = "fewgrams_cart";

/** Grams in one unit. Greens are sold by the 100 g (SPEC §18.6). */
export const GRAMS_PER_UNIT = 100;

function clampUnits(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), MAX_UNITS_PER_LINE);
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
    const [key, rawUnits] = chunk.split(":");
    if (!key || !isValidContentKey(key) || seen.has(key)) continue;
    const units = clampUnits(Number(rawUnits));
    if (units <= 0) continue;
    seen.add(key);
    lines.push({ key, units });
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

export function serialiseCart(lines: CartLine[]): string {
  return lines
    .filter((l) => l.units > 0)
    .slice(0, MAX_LINES)
    .map((l) => `${l.key}:${clampUnits(l.units)}`)
    .join("|");
}

/**
 * Set a line to an exact quantity, creating it if absent.
 *
 * **Absolute, never a delta.** This replaced an `addToCart(lines, key, +n)` on
 * 15 Sep 2026, because the variety page's stepper now shows how much is
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
 */
export function upsertLine(lines: CartLine[], key: string, units: number): CartLine[] {
  if (!isValidContentKey(key)) return lines;
  const next = clampUnits(units);
  if (next <= 0) return removeFromCart(lines, key);

  if (lines.some((l) => l.key === key)) {
    return lines.map((l) => (l.key === key ? { ...l, units: next } : l));
  }
  if (lines.length >= MAX_LINES) return lines;
  return [...lines, { key, units: next }];
}

/** Units of one variety currently in the cart, or 0. This is what seeds the
 *  variety page's stepper, so the control and the header badge agree. */
export function unitsFor(lines: CartLine[], key: string): number {
  return lines.find((l) => l.key === key)?.units ?? 0;
}

export function removeFromCart(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Total 100 g units across the cart — what the header badge shows. */
export function cartUnitCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.units, 0);
}

export function cartGrams(lines: CartLine[]): number {
  return cartUnitCount(lines) * GRAMS_PER_UNIT;
}
