import { countsByCategory } from "@/lib/repo/products";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listSellableRacks } from "@/lib/racks/catalogue";
import type { Category } from "@/lib/types";

/**
 * Active items per category, for the home page and /shop tiles — SPEC §18.3.
 *
 * Exists because a category's count no longer comes from one place. Seeds
 * left `ProductEntity` on 17 Sep 2026 for their own entity (see the `Seed`
 * type) and trays followed the same day (see `Tray`), so two of the four tiles
 * are counted from their own tables. Only snacks is still counted from
 * products — and nothing writes one yet.
 *
 * One function rather than two calls at each of the three call sites: a tile
 * showing 0 because someone forgot the second read reads as "coming soon",
 * which is a lie that looks like a feature.
 *
 * **Racks are counted from the rate card** as of 17 Sep 2026, not from the
 * product catalogue. They never were projected into `ProductEntity` and still
 * are not — a rack is one combination out of three model tables (SPEC §19–§21),
 * so `countsByCategory` has always returned 0 for them.
 *
 * That was fine while the tile read "coming soon", which was true: there was no
 * rack page to send anyone to. It stopped being fine the moment `/shop/racks`
 * existed, because the tile then linked to a page showing 100 racks while
 * captioning itself "0 products" — the same class of lie, pointing the other
 * way. `listSellableRacks` is the one gate on what a customer can buy, so it is
 * also the honest count.
 *
 * It is `cache`d per request and the rack pages read it too, so on `/shop` this
 * costs nothing beyond what that page already pays.
 */
export async function categoryCounts(): Promise<Record<Category, number>> {
  const [products, seeds, trays, racks] = await Promise.all([
    countsByCategory(),
    listSeeds({ activeOnly: true }),
    listTrays({ activeOnly: true }),
    listSellableRacks(),
  ]);
  return {
    ...products,
    seeds: seeds.length,
    trays: trays.length,
    racks: racks.length,
  };
}
