"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { getDisabledProductTypes, setProductTypeEnabled } from "@/lib/repo/catalogue-visibility";
import { PRODUCT_TYPES, type ProductType } from "@/lib/types";

const isProductType = (v: string): v is ProductType =>
  (PRODUCT_TYPES as readonly string[]).includes(v);

/** Every public route this switch can change what renders on. */
function refresh() {
  revalidatePath("/[locale]/admin/settings", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/shop", "page");
  revalidatePath("/[locale]/shop/racks", "page");
  revalidatePath("/[locale]/shop/trays", "page");
  revalidatePath("/[locale]/shop/grow-media", "page");
  revalidatePath("/[locale]/seeds", "page");
  revalidatePath("/[locale]/microgreens", "page");
}

export async function toggleProductType(fd: FormData): Promise<void> {
  await assertRole("admin");
  const type = String(fd.get("type"));
  if (!isProductType(type)) throw new Error(`Unknown product type: ${type}`);
  const disabled = await getDisabledProductTypes();
  await setProductTypeEnabled(type, disabled.includes(type));
  refresh();
}
