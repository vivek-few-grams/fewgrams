import { cookies } from "next/headers";
import { listVarieties } from "@/lib/repo/varieties";
import { attachContent, varietyHero } from "@/lib/content/varieties";
import { adhocOrderReadyDate, adhocReadyDate } from "@/lib/delivery-date";
import {
  CART_COOKIE,
  GRAMS_PER_UNIT,
  cartUnitCount,
  parseCart,
  unitsFor,
  serialiseCart,
  type CartLine,
} from "./cart";

/**
 * Server-side cart reading — SPEC §18.6.
 *
 * The cookie holds keys and quantities; **everything else is recomputed here**
 * from DynamoDB and the content files on every read. That is what makes the
 * displayed price the current price rather than whatever was true when the
 * customer added the item, and what makes a client-supplied total impossible
 * (SPEC §9).
 *
 * Mutations live in `src/app/[locale]/cart/actions.ts`. A server *component*
 * cannot write a cookie, so this module only reads.
 */

/** One hydrated line, with everything a page needs to render it. */
export type CartItem = {
  key: string;
  units: number;
  grams: number;
  name: string;
  pricePer100g: number;
  growDays: number;
  /** `units × pricePer100g`, in rupees. Computed, never stored. */
  lineTotal: number;
  image: { src: string; alt: string } | null;
  /** When this variety alone would be ready. Shown per line so a customer can
   *  see which green is holding the order back. */
  readyDate: Date;
};

export type HydratedCart = {
  items: CartItem[];
  unitCount: number;
  grams: number;
  /** Sum of the line totals. Delivery is **not** included: SPEC §7 has no
   *  ad-hoc greens rate yet, and inventing one here would quote a number the
   *  business has not set. */
  subtotal: number;
  /** One delivery on the slowest variety's date (SPEC §18.6). Null when empty. */
  readyDate: Date | null;
  /** True when the cart mixes grow windows, so the page can explain why
   *  everything arrives on one later date instead of leaving it a surprise. */
  splitDates: boolean;
  /**
   * Keys that were in the cookie but no longer resolve to a sellable variety —
   * deactivated in admin, deleted, or its content file removed.
   *
   * Surfaced rather than silently swallowed: the customer put it there, so
   * "it is gone" is information they are owed. The stale cookie entry is
   * cleaned up by the next mutation; a read cannot write.
   */
  unavailable: string[];
};

/** The raw cookie lines. Cheap — no database work. */
export async function readCartLines(): Promise<CartLine[]> {
  const store = await cookies();
  return parseCart(store.get(CART_COOKIE)?.value);
}

/** Total 100 g units, for the header badge. One catalogue read is avoided
 *  entirely: the badge needs no names or prices. */
export async function readCartCount(): Promise<number> {
  return cartUnitCount(await readCartLines());
}

/**
 * How many 100 g units of one variety are already in the cart.
 *
 * Seeds the stepper on `/microgreens/[key]` so the control and the header badge
 * cannot disagree — the stepper used to mount at 1 while the badge read 3.
 * Cookie-only, so it costs no catalogue read.
 */
export async function readCartUnitsFor(key: string): Promise<number> {
  return unitsFor(await readCartLines(), key);
}

/**
 * Join the cookie to the catalogue.
 *
 * Only `active` varieties with a content file are sellable, which is the same
 * test `/microgreens` and `/microgreens/[key]` apply — so a variety cannot be
 * unbuyable on its own page yet checkout-able from the cart.
 */
export async function hydrateCart(
  locale: string,
  now: Date = new Date(),
): Promise<HydratedCart> {
  const lines = await readCartLines();
  if (lines.length === 0) {
    return {
      items: [],
      unitCount: 0,
      grams: 0,
      subtotal: 0,
      readyDate: null,
      splitDates: false,
      unavailable: [],
    };
  }

  const rows = await listVarieties({ activeOnly: true });
  const withContent = await attachContent(rows, locale);
  const byKey = new Map(
    withContent
      .filter((v) => v.content !== null)
      .map((v) => [v.contentKey, v] as const),
  );

  const items: CartItem[] = [];
  const unavailable: string[] = [];

  /* Cookie order is preserved — it is the order the customer added things in,
     and re-sorting a cart makes a line appear to move when you edit it. */
  for (const line of lines) {
    const match = byKey.get(line.key);
    if (!match || !match.content) {
      unavailable.push(line.key);
      continue;
    }
    items.push({
      key: line.key,
      units: line.units,
      grams: line.units * GRAMS_PER_UNIT,
      name: match.content.text.name,
      pricePer100g: match.pricePer100g,
      growDays: match.growDays,
      lineTotal: line.units * match.pricePer100g,
      image: varietyHero(match.content),
      readyDate: adhocReadyDate(match.growDays, now),
    });
  }

  const growDays = items.map((i) => i.growDays);
  return {
    items,
    unitCount: items.reduce((n, i) => n + i.units, 0),
    grams: items.reduce((n, i) => n + i.grams, 0),
    subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
    readyDate: adhocOrderReadyDate(growDays, now),
    splitDates: new Set(growDays).size > 1,
    unavailable,
  };
}

/** Cookie options, in one place so a mutation cannot set them differently
 *  from the read path's expectations. */
export function cartCookieOptions() {
  return {
    /* No client script needs to read this, and one that could read it could
       also forge it. Every mutation goes through a server action. */
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    /* 30 days. Long enough that a cart survives a weekend of deliberation,
       short enough that prices are not being re-quoted from last quarter. */
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  };
}

/** Write cart lines back to the cookie. Only callable from a server action or
 *  route handler — Next refuses a cookie write during a component render. */
export async function writeCartLines(lines: CartLine[]): Promise<void> {
  const store = await cookies();
  const value = serialiseCart(lines);
  if (!value) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, value, cartCookieOptions());
}
