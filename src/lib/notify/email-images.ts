import { brand } from "@/lib/brand";
import type { CartKind } from "@/lib/cart/cart";
import { rackRangeOfKey } from "@/lib/racks/cart-key";
import type { PackPart } from "@/lib/types";
import manifest from "./email-images.json";

/**
 * The emails' pictures, as absolute addresses an inbox can load — the files
 * `npm run images:email` writes to `public/img/email/` (see
 * `scripts/email-images.mjs` for why they are copies). From `brand.url`, never
 * a request, like every other link in an email.
 */
const absolute = (rel: string) => `${brand.url}/${rel}`;
const THUMBS: Readonly<Record<string, string>> = manifest.thumbs;

/** The stacked lockup, PNG. */
export const EMAIL_LOGO = absolute(manifest.logo);
/** Trays of microgreens with a bowl of seed, across the top of a receipt. */
export const EMAIL_BANNER = absolute(manifest.banner);

const FOLDER = { variety: "varieties", seed: "seeds", tray: "trays", media: "grow-media" } as const;

/**
 * A line's thumbnail, or null when its product has no photo yet — the row then
 * goes without one. A rack shows its range, as on the cart; a starter pack
 * shows the rack inside it, or its trays when it has none.
 */
export function lineThumb(line: { kind: CartKind; key: string; parts?: PackPart[] | null }): string | null {
  const at = (key: string) => (THUMBS[key] ? absolute(THUMBS[key]) : null);
  switch (line.kind) {
    case "rack": {
      const range = rackRangeOfKey(line.key);
      return range ? at(`racks/${range}`) : null;
    }
    case "pack": {
      const rack = line.parts?.find((p) => p.kind === "rack");
      if (rack) return lineThumb({ kind: "rack", key: rack.key });
      const tray = line.parts?.find((p) => p.kind === "tray");
      return tray ? at(`trays/${tray.key}`) : null;
    }
    default:
      return at(`${FOLDER[line.kind]}/${line.key}`);
  }
}
