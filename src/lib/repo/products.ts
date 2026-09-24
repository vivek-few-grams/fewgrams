import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { ProductEntity } from "@/lib/db/entities";
import { CATEGORIES, type Category, type Product } from "@/lib/types";

/**
 * Product repository — seeds, racks, trays and snacks (SPEC §3 / §4). The key
 * layout lives in src/lib/db/entities.ts.
 *
 * Listing one category is a Query on GSI1; listing everything is four
 * Queries, one per category, rather than a Scan. See src/lib/db/client.ts
 * for why every read passes options.
 */

/**
 * The categories a `Product` row can carry — every `Category` except grow
 * media, which arrived on 24 Sep 2026 with its own entity (see `GrowMedium`)
 * and was never a value of `ProductEntity.category`. Excluded here rather than
 * added to that enum, because widening the enum would invite a grow-media row
 * nothing reads.
 */
export type ProductCategory = Exclude<Category, "media">;
const PRODUCT_CATEGORIES = CATEGORIES.filter((c): c is ProductCategory => c !== "media");

export async function listByCategory(
  category: ProductCategory,
  opts: { activeOnly?: boolean } = {},
): Promise<Product[]> {
  const { data } = await ProductEntity.query
    .byCategory({ category })
    .go(LIST_OPTS);
  return opts.activeOnly ? data.filter((p) => p.active) : data;
}

export async function listProducts(
  opts: { activeOnly?: boolean } = {},
): Promise<Product[]> {
  const groups = await Promise.all(
    PRODUCT_CATEGORIES.map((c) => listByCategory(c, opts)),
  );
  return groups.flat();
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data } = await ProductEntity.get({ id }).go(READ_OPTS);
  return data;
}

/** Active product count per category, for the home page tiles. */
export async function countsByCategory(): Promise<Record<ProductCategory, number>> {
  const groups = await Promise.all(
    PRODUCT_CATEGORIES.map(
      async (c) =>
        [c, (await listByCategory(c, { activeOnly: true })).length] as const,
    ),
  );
  return Object.fromEntries(groups) as Record<ProductCategory, number>;
}

export async function putProduct(p: Product): Promise<void> {
  await ProductEntity.put(p).go();
}

export async function deleteProduct(id: string): Promise<void> {
  await ProductEntity.delete({ id }).go();
}
