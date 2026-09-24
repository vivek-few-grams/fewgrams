import type { Category } from "@/lib/types";

/**
 * Panel colours per category — SPEC §17. Shared by the home page tiles and
 * the /shop index so a category keeps the same colour wherever it appears,
 * which is what makes the grid readable at a glance.
 */
export const CATEGORY_PANELS: Record<
  Category,
  { panelClass: string; marqueeClass: string }
> = {
  racks: { panelClass: "bg-sand", marqueeClass: "text-forest/15" },
  /* Light, not dark forest — changed 20 Sep 2026 so the packet photo
     (`CategoryMedia`'s `seeds` cut-out) reads the way the microgreens tile's
     own photo does: a light ground under a full-colour photograph, rather
     than a photograph competing with a dark panel. */
  seeds: { panelClass: "bg-sage/30", marqueeClass: "text-forest/25" },
  trays: { panelClass: "bg-sage", marqueeClass: "text-forest/25" },
  /* Tan, 24 Sep 2026 — the colour of the coir itself, and the one ground no
     other category uses, so the tile reads as a different thing to buy. */
  media: { panelClass: "bg-tan/45", marqueeClass: "text-bark/20" },
  snacks: { panelClass: "bg-mint", marqueeClass: "text-forest/20" },
};

/**
 * Where a category tile goes.
 *
 * Not `/shop/<category>` for every category any more (17 Sep 2026). **Seeds
 * has its own described catalogue at `/seeds`**, exactly as microgreens has
 * `/microgreens`: each seed carries a page of its own copy and a stock figure,
 * which is a different kind of thing from a grid of interchangeable trays.
 * `/shop/seeds` redirects there, so a guessed URL still works.
 *
 * Declared here rather than branched at each tile, because three surfaces
 * render these tiles — the home page, the /shop index and the category strip —
 * and a fourth branch is a fourth place to forget.
 */
export const CATEGORY_HREF: Record<Category, string> = {
  racks: "/shop/racks",
  seeds: "/seeds",
  trays: "/shop/trays",
  /* `media` is the key; the page says what it holds (SPEC §24.5). */
  media: "/shop/grow-media",
  snacks: "/shop/snacks",
};

/** Which `common.counts` message labels a category's tile. Seeds are counted
 *  as seeds, because "3 products" under a tile of seed is a word nobody used
 *  to describe it. */
export const CATEGORY_COUNT: Record<Category, "products" | "seeds"> = {
  racks: "products",
  seeds: "seeds",
  trays: "products",
  media: "products",
  snacks: "products",
};

/** The words behind the grow-media tile, as keys of `shop.growMedia.tileWords`
 *  — properties of coir, because two long product names make a sparse cloud.
 *  Flat keys rather than a message array: nothing in the codebase calls
 *  `t.raw()`. */
export const GROW_MEDIA_TILE_WORDS = [
  "cocopeat",
  "lowEc",
  "preWashed",
  "coconutHusk",
  "holdsWater",
  "airyRoots",
] as const;
