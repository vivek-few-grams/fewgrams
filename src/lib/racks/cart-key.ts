import { isRackColour, type RackColour } from "./colours";

/**
 * How a rack is named in a cart — SPEC §19.9.
 *
 * ## Why a rack cannot use a content key
 *
 * Every other cart kind is keyed by a **content key**: `broccoli`, `radish`,
 * `tray-pair` — the filename of a content file, lowercase letters and hyphens
 * with no digits at all (`isValidContentKey`). That rule exists to stop
 * `amaranth-2` from ever being a name.
 *
 * A rack has no content file and never will. It is not an item somebody wrote
 * copy for; it is **one combination out of a rate card** (§19), and what
 * identifies it is precisely the figures a content key forbids — 6 feet, 5
 * shelves, a 1¼ × 3 ft footprint, 1.4 mm steel. So the cart's key rule had to
 * become kind-aware rather than be loosened for everyone: digits stay banned
 * where they would be a naming failure, and are required here.
 *
 * ## It is the SKU, which already existed
 *
 * `rackSku` and friends already produce `RK-6F-5S-1.25x3-1.4`, built for
 * packing slips on the argument that a readable identifier beats a UUID "when
 * the person picking it is the person who priced it". That argument applies
 * exactly as well to a cart line, an order line and a URL, so this reuses it
 * rather than inventing a parallel scheme.
 *
 * Lowercased, because a cart key is also a URL segment and a cookie value, and
 * `RK-6F` and `rk-6f` being two keys for one rack is a bug waiting to happen.
 *
 * ## Colour is part of the key, not part of the model
 *
 * `RackConfig` deliberately has **no colour**: it was removed on 17 Sep 2026
 * because orange, green and purple are the same rack at the same price, and
 * three models for one product is three rows to keep in step. Colour is
 * *"chosen at purchase, not published"* — so it has to attach to the line
 * rather than the model, and the cart has no per-line attributes: a line is a
 * kind, a key and a quantity, full stop.
 *
 * Appending it to the key is what reconciles those two facts. It also gets the
 * behaviour right for free: two racks of the same size in different colours are
 * two cart lines, because they are two things to build — which is the same
 * reason `lineId` carries the kind.
 *
 * **A pipe rack has no colour segment.** There is one pipe spec and it is
 * white (§21), so `pr-6f-5s-1.5x3` is complete and appending `-white` would
 * imply a choice nobody is offered.
 */

/** The three ranges, keyed as `/shop/racks` and `public/racks/` key them. */
export const RACK_RANGES = ["shelf", "angle", "pipe"] as const;
export type RackRange = (typeof RACK_RANGES)[number];

/** The SKU prefix each range's own `*Sku` builder emits. */
const SKU_PREFIX: Record<RackRange, string> = { shelf: "rk", angle: "ar", pipe: "pr" };

const RANGE_BY_PREFIX: Record<string, RackRange> = { rk: "shelf", ar: "angle", pr: "pipe" };

export function rackRangeOf(range: string): RackRange | null {
  return (RACK_RANGES as readonly string[]).includes(range) ? (range as RackRange) : null;
}

/** Which range a rack cart key belongs to, from its SKU prefix — or null for
 *  a key that is not a rack's. */
export function rackRangeOfKey(key: string): RackRange | null {
  return RANGE_BY_PREFIX[key.slice(0, 2)] ?? null;
}

/**
 * The cart key for one buyable rack.
 *
 * `colour` is required for the steel ranges and must be `null` for pipe —
 * passing the wrong one is refused rather than ignored, because a key that
 * silently drops a colour would put an unpainted rack in somebody's cart.
 */
export function rackCartKey(sku: string, colour: RackColour | null): string {
  const base = sku.toLowerCase();
  const range = RANGE_BY_PREFIX[base.split("-")[0]];
  if (!range) throw new Error(`not a rack SKU: ${sku}`);
  if (range === "pipe") {
    if (colour !== null) throw new Error("a pipe rack has no colour to choose");
    return base;
  }
  if (colour === null) throw new Error(`a ${range} rack needs a colour`);
  return `${base}-${colour}`;
}

/**
 * Pulls a key apart again — the range, the SKU and the colour.
 *
 * **Shape only.** It says a string could be a rack key, not that the rack
 * exists: whether that model is published and active is a database question,
 * answered by `findSellableRack`. Same division as `isValidContentKey`, which
 * says a key is well-formed and nothing about whether the file is there.
 *
 * Returns null rather than throwing, because the input is a cookie or a form
 * field — see `parseCart` on why nothing in the cart may throw on bad input.
 */
export function parseRackCartKey(
  key: string,
): { range: RackRange; sku: string; colour: RackColour | null } | null {
  if (key !== key.toLowerCase() || key.length > 60) return null;

  const parts = key.split("-");
  const range = RANGE_BY_PREFIX[parts[0]];
  if (!range) return null;

  /* A steel key ends in a colour and a pipe key does not, so the SKU is
     everything up to that point. Length is checked too: `rk-6f-5s-1x3-1.4` has
     five segments plus a colour, `pr-6f-5s-1x3` has four and no colour. */
  const wantsColour = range !== "pipe";
  const expected = wantsColour ? 6 : 4;
  if (parts.length !== expected) return null;

  const colour = wantsColour ? parts[parts.length - 1] : null;
  if (colour !== null && !isRackColour(colour)) return null;

  const sku = (wantsColour ? parts.slice(0, -1) : parts).join("-");
  /* `1.4` and `1.25x3` are the two segments carrying dots, so the character
     set has to admit them — which is exactly why a content key cannot be
     reused here. */
  if (!/^[a-z]{2}-\d+f-\d+s-[\d.]+x[\d.]+(?:-[\d.]+)?$/.test(sku)) return null;
  if (SKU_PREFIX[range] !== parts[0]) return null;

  return { range, sku, colour: colour as RackColour | null };
}

/** Whether a string is shaped like a rack cart key. The cheap test `parseCart`
 *  applies before it will keep a cookie line. */
export function isValidRackCartKey(key: string): boolean {
  return parseRackCartKey(key) !== null;
}

/**
 * Where a cart line linking back to its rack should point.
 *
 * `rk-6f-5s-1x2-1.4-orange` → `/shop/racks/shelf?h=6&s=1x2&c=orange`.
 *
 * Derived from the key rather than stored on the cart item, because it already
 * is: the SKU's segments *are* the height and the footprint, which is the whole
 * argument for a readable SKU over a UUID. A second `href` field would be the
 * same facts in a second place, free to disagree.
 *
 * Returns null for a key that does not parse, so the caller falls back rather
 * than linking somewhere wrong — a cart holding a stale line should still
 * render it.
 */
export function rackLineHref(key: string): string | null {
  const parsed = parseRackCartKey(key);
  if (!parsed) return null;

  const parts = parsed.sku.split("-");
  /* `6f` → 6, and `1x2` is already the query spelling — one spelling for the
     SKU, the URL and the packing slip. */
  const height = parts[1].replace(/f$/, "");
  const size = parts[3];

  const q = new URLSearchParams({ h: height, s: size });
  if (parsed.colour) q.set("c", parsed.colour);
  return `/shop/racks/${parsed.range}?${q.toString()}`;
}
