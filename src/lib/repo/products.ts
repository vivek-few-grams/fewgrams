import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE, ddb, stripKeys } from "@/lib/ddb";
import { CATEGORIES, type Category, type Product } from "@/lib/types";

/**
 * Product records — SPEC §4:
 *   PK = PRODUCT#<id>  SK = META
 *   GSI1PK = CAT#<category>   GSI1SK = <slug>
 *
 * Listing a category is therefore a Query on GSI1, and listing everything is
 * one Query per category — four in total, not a Scan.
 */

const key = (id: string) => ({ PK: `PRODUCT#${id}`, SK: "META" });

const toRow = (p: Product) => ({
  ...p,
  ...key(p.id),
  GSI1PK: `CAT#${p.category}`,
  GSI1SK: p.slug,
});

const strip = (r: Record<string, unknown>) => stripKeys<Product>(r);

export async function listByCategory(
  category: Category,
  opts: { activeOnly?: boolean } = {},
): Promise<Product[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `CAT#${category}` },
    }),
  );
  const all = (res.Items ?? []).map(strip);
  return opts.activeOnly ? all.filter((p) => p.active) : all;
}

export async function listProducts(
  opts: { activeOnly?: boolean } = {},
): Promise<Product[]> {
  const groups = await Promise.all(
    CATEGORIES.map((c) => listByCategory(c, opts)),
  );
  return groups.flat();
}

/** Active product count per category, for the home page tiles. */
export async function countsByCategory(): Promise<Record<Category, number>> {
  const groups = await Promise.all(
    CATEGORIES.map(async (c) => [c, (await listByCategory(c, { activeOnly: true })).length] as const),
  );
  return Object.fromEntries(groups) as Record<Category, number>;
}

export async function putProduct(p: Product): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: toRow(p) }));
}

export async function deleteProduct(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: key(id) }));
}
