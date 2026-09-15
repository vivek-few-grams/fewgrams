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

export async function listByCategory(
  category: Category,
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
    CATEGORIES.map((c) => listByCategory(c, opts)),
  );
  return groups.flat();
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data } = await ProductEntity.get({ id }).go(READ_OPTS);
  return data;
}

/** Active product count per category, for the home page tiles. */
export async function countsByCategory(): Promise<Record<Category, number>> {
  const groups = await Promise.all(
    CATEGORIES.map(
      async (c) =>
        [c, (await listByCategory(c, { activeOnly: true })).length] as const,
    ),
  );
  return Object.fromEntries(groups) as Record<Category, number>;
}

export async function putProduct(p: Product): Promise<void> {
  await ProductEntity.put(p).go();
}

export async function deleteProduct(id: string): Promise<void> {
  await ProductEntity.delete({ id }).go();
}
