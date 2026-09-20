import { cache } from "react";
import { READ_OPTS } from "@/lib/db/client";
import { CatalogueVisibilityEntity } from "@/lib/db/entities";
import { PRODUCT_TYPES, type ProductType } from "@/lib/types";

/**
 * The admin on/off switch for a whole product type — SPEC §12 "settings".
 *
 * `cache()`d because one request can ask several times: the header, the
 * footer, the category strip and the page itself all need to know what is
 * switched off, and it is one row.
 */
export const getDisabledProductTypes = cache(async (): Promise<ProductType[]> => {
  const { data } = await CatalogueVisibilityEntity.get({}).go(READ_OPTS);
  const stored = new Set((data?.disabled ?? []) as string[]);
  /* Filtered against `PRODUCT_TYPES` rather than trusted as-is, so a type
     retired from the union cannot leave a dangling entry that silently does
     nothing forever. */
  return PRODUCT_TYPES.filter((type) => stored.has(type));
});

export async function setProductTypeEnabled(type: ProductType, enabled: boolean): Promise<void> {
  const disabled = new Set(await getDisabledProductTypes());
  if (enabled) {
    disabled.delete(type);
  } else {
    disabled.add(type);
  }
  await CatalogueVisibilityEntity.put({ disabled: Array.from(disabled) }).go();
}
