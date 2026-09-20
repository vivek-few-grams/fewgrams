import { redirect } from "@/i18n/navigation";
import { getDisabledProductTypes } from "@/lib/repo/catalogue-visibility";
import { CATEGORIES, PRODUCT_TYPES, type Category, type ProductType } from "@/lib/types";

/**
 * Turning a product type off (SPEC §12 "settings") has to do two things
 * everywhere it is checked: drop it from every menu, and stop serving its
 * pages to a visitor who still has an old link. This module is the one place
 * both questions are answered, so a new category cannot add a menu entry
 * without also getting the redirect, or the other way round.
 */

export async function isProductTypeEnabled(type: ProductType): Promise<boolean> {
  const disabled = await getDisabledProductTypes();
  return !disabled.includes(type);
}

/** For a menu that lists every product type — the footer and the settings
 *  screen itself. */
export async function enabledProductTypes(): Promise<ProductType[]> {
  const disabled = await getDisabledProductTypes();
  return PRODUCT_TYPES.filter((type) => !disabled.includes(type));
}

/** For a menu that only ever lists `Category` — the category strip, /shop and
 *  the home page's "other products" tiles. Microgreens is a `ProductType` but
 *  never a `Category` (it is not a `/shop/<slug>` grid), so those call sites
 *  need this narrower list rather than filtering `enabledProductTypes()`
 *  themselves against `CATEGORIES` every time. */
export async function enabledCategories(): Promise<Category[]> {
  const disabled = await getDisabledProductTypes();
  return CATEGORIES.filter((c) => !disabled.includes(c));
}

/**
 * Sends a visitor back to `/shop` when `type` has been switched off — the
 * bookmarked-URL half of the switch. Call this first, before any data is
 * read for the page, in every route a disabled type would otherwise still
 * serve: the category's own list page, its detail page, and (for racks and
 * trays) the range/model pages underneath it.
 */
export async function guardProductTypeEnabled(
  type: ProductType,
  locale: string,
): Promise<void> {
  if (!(await isProductTypeEnabled(type))) {
    redirect({ href: "/shop", locale });
  }
}
