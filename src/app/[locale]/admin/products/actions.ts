"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deleteProduct, putProduct } from "@/lib/repo/products";
import { CATEGORIES, type Category, type Product } from "@/lib/types";


const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function saveProduct(fd: FormData) {
  await assertRole("admin");
  const nameEn = String(fd.get("nameEn") ?? "").trim();
  if (!nameEn) throw new Error("English name is required");

  const category = String(fd.get("category")) as Category;
  if (!CATEGORIES.includes(category)) throw new Error("Unknown category");

  const id = String(fd.get("id") ?? "").trim() || crypto.randomUUID();
  const nameKn = String(fd.get("nameKn") ?? "").trim();
  const basePrice = Number(fd.get("basePrice") ?? 0);

  /**
   * Variants, one per line: `sku | key=value,key=value | price | stockGrams?`
   *
   * SPEC §3.0.1 — trays are the reason variants exist (virgin vs PP plastic,
   * plus size), and SPEC §3 gives seeds real stock in grams while racks,
   * trays and snacks carry none.
   */
  const variants = String(fd.get("variants") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [sku, attrs, price, stock] = line.split("|").map((p) => p.trim());
      if (!sku) throw new Error(`Variant line missing a SKU: "${line}"`);
      return {
        sku,
        attributes: Object.fromEntries(
          (attrs ?? "")
            .split(",")
            .map((kv) => kv.split("=").map((x) => x.trim()))
            .filter((kv) => kv.length === 2 && kv[0]) as [string, string][],
        ),
        price: Number(price || basePrice),
        ...(stock ? { stockGrams: Number(stock) } : {}),
        active: true,
      };
    });

  const product: Product = {
    id,
    slug: String(fd.get("slug") ?? "").trim() || slugify(nameEn),
    category,
    name: { en: nameEn, ...(nameKn ? { kn: nameKn } : {}) },
    basePrice,
    variants,
    active: fd.get("active") === "on",
  };

  await putProduct(product);
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function removeProduct(fd: FormData) {
  await assertRole("admin");
  await deleteProduct(String(fd.get("id")));
  revalidatePath("/admin/products");
  revalidatePath("/");
}
