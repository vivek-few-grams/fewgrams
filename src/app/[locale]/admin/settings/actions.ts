"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { getDisabledProductTypes, setProductTypeEnabled } from "@/lib/repo/catalogue-visibility";
import { switchTo } from "@/lib/forms";
import { PRODUCT_TYPES, type ProductType } from "@/lib/types";

const isProductType = (v: string): v is ProductType => (PRODUCT_TYPES as readonly string[]).includes(v);

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

/** Show or hide a whole category. The button posts the state it is asking
 *  for (`switchTo`), so a second press, or one from a stale tab, cannot
 *  undo the first — "Hide" on a category already hidden leaves it hidden. */
export async function toggleProductType(fd: FormData): Promise<void> {
  await assertRole("admin");
  const type = String(fd.get("type"));
  if (!isProductType(type)) throw new Error(`Unknown product type: ${type}`);
  const enable = switchTo(fd);
  if (enable === null) throw new Error("No target state posted");
  const disabled = await getDisabledProductTypes();
  if (disabled.includes(type) !== enable) return;
  await setProductTypeEnabled(type, enable);
  refresh();
}
