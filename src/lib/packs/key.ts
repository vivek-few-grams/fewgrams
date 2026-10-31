import { isValidContentKey } from "@/lib/content/content-key";
import { isRackColour, type RackColour } from "@/lib/racks/colours";

/**
 * A starter pack's cart key — SPEC §29.3.
 *
 * A pack is **one cart line at one price**, but the customer chooses what goes
 * in it: a rack colour (when it has racks) and which seeds. The cart line is
 * only `{kind, key, units}` and has nowhere else to keep a choice, so the
 * choice is the key — the same answer a rack's colour got (`rackCartKey`):
 *
 *     single-rack-pack~orange~beetroot.dill.kale.radish
 *     tray-pack~~basil.mustard.radish.rocket
 *
 * Three parts split on `~`: the pack's content key, the colour (empty for a
 * pack with no rack), and the seed content keys joined by `.`. Neither
 * separator can occur in a content key or a colour slug, and neither is one of
 * the cookie's own (`:` and `|`, see `parseCart`).
 *
 * **The seeds are sorted**, and the builder sorts them, so one choice is one
 * string: picking radish then dill and picking dill then radish land on the
 * same cart line instead of two lines of the same pack.
 *
 * Shape only, like `parseRackCartKey`: whether the pack is on sale, the colour
 * is one its rack comes in and the seeds are on its menu are database
 * questions, answered by `src/lib/packs/catalogue.ts`.
 *
 * No Node imports — the pack page's client component builds the key it posts.
 */

/** Long enough for a pack name, a colour and a dozen seed keys; well inside
 *  the cookie's 4 KB across `MAX_LINES` lines. */
export const PACK_KEY_MAX = 240;

export type PackChoice = {
  /** The pack's content key — `content/packs/<packKey>.json`. */
  packKey: string;
  colour: RackColour | null;
  /** Seed content keys, sorted, no repeats. */
  seeds: string[];
};

/** Builds the key. Sorts and de-duplicates the seeds, so the caller's order
 *  never matters. */
export function packCartKey(packKey: string, colour: RackColour | null, seeds: readonly string[]): string {
  const sorted = [...new Set(seeds)].sort();
  return `${packKey}~${colour ?? ""}~${sorted.join(".")}`;
}

/** Pulls a key apart, or null when it is not shaped like one. A key whose
 *  seeds are out of order or repeated is refused rather than repaired, because
 *  it can only come from a hand-made cookie or form. */
export function parsePackCartKey(key: string): PackChoice | null {
  if (key !== key.toLowerCase() || key.length > PACK_KEY_MAX) return null;
  const parts = key.split("~");
  if (parts.length !== 3) return null;
  const [packKey, colour, seedList] = parts;

  if (!isValidContentKey(packKey)) return null;
  if (colour !== "" && !isRackColour(colour)) return null;

  const seeds = seedList.split(".");
  if (seeds.length === 0 || !seeds.every(isValidContentKey)) return null;
  for (let i = 1; i < seeds.length; i++) {
    if (seeds[i - 1] >= seeds[i]) return null;
  }

  return { packKey, colour: colour === "" ? null : colour, seeds };
}

export function isValidPackCartKey(key: string): boolean {
  return parsePackCartKey(key) !== null;
}

/** The pack's content key from a cart key, for a link back to its page or a
 *  short courier SKU. Null when the key will not parse. */
export function packKeyOf(key: string): string | null {
  return parsePackCartKey(key)?.packKey ?? null;
}
