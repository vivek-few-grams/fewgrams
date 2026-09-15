import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { t as localised, CATEGORIES, type Category } from "@/lib/types";
import { listByCategory } from "@/lib/repo/products";
import { CATEGORY_PANELS } from "@/lib/shop";
import { redirect } from "@/i18n/navigation";
import { Sprout } from "@/components/ui/Sprout";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";
import { currentActor } from "@/lib/auth/guard";

/**
 * /shop/[category] — SPEC §12. One page per product category, read from
 * `fewgrams-catalogue` by a single GSI1 Query.
 *
 * Product detail pages (`/shop/[category]/[slug]`) are not built yet, so the
 * cards here are not links. Everything a buyer needs to compare — price,
 * variants, and seed stock in grams — is on the card itself, so the page is
 * useful before the detail route exists rather than a list of dead ends.
 */
export const dynamic = "force-dynamic";

const isCategory = (v: string): v is Category =>
  (CATEGORIES as readonly string[]).includes(v);

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/shop/[category]">) {
  const { locale, category } = await params;
  const t = await getTranslations({ locale, namespace: "common.categories" });
  const shop = await getTranslations({ locale, namespace: "shop" });
  return {
    title: isCategory(category) ? t(category) : shop("index.title"),
    alternates: localeAlternates(`/shop/${category}`),
  };
}

export default async function CategoryPage({
  params,
}: PageProps<"/[locale]/shop/[category]">) {
  const { locale, category } = await params;
  setRequestLocale(locale);

  /* Microgreens is in the shop menu but is not a product category — it is a
     variety catalogue with its own route (SPEC §18.6). Redirect rather than
     404 so the URL a visitor might guess still works. */
  if (category === "microgreens") redirect({ href: "/microgreens", locale });
  if (!isCategory(category)) notFound();

  const t = await getTranslations("shop.category");
  const label = await getTranslations("common.categories");
  const products = await listByCategory(category, { activeOnly: true });
  const panel = CATEGORY_PANELS[category];
  /* See the empty state below: the admin instruction is resolved only for an
     admin, so it never reaches a customer's HTML. */
  const actor = await currentActor();
  const isAdmin = actor?.role === "admin";
  const ta = await getTranslations("admin.publicEmpty");

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
      <CategoryStrip current={category} />

      <h1 className="mt-8 font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
        {label(category)}
      </h1>
      <p className="mt-3 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      {products.length === 0 ? (
        /* Customers get "no racks are listed right now"; only an admin gets
           told where to add them. */
        <p className="mt-12 rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          {isAdmin
            ? ta.rich("products", {
                category: label(category).toLowerCase(),
                link: (chunks) => (
                  <Link
                    href="/admin/products"
                    className="text-forest underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })
            : t("empty", { category: label(category).toLowerCase() })}
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-6">
          {products.map((p, i) => {
            const active = p.variants.filter((v) => v.active);
            const from = active.length
              ? Math.min(...active.map((v) => v.price))
              : p.basePrice;
            const stock = active.reduce(
              (sum, v) => (v.stockGrams === undefined ? sum : sum + v.stockGrams),
              0,
            );
            return (
              <li key={p.id}>
                <div
                  className={`flex aspect-square items-center justify-center rounded-2xl ${panel.panelClass}`}
                >
                  <div className="w-[58%]">
                    <Sprout
                      className="h-full w-full"
                      stroke={category === "seeds" ? "#ABE1CC" : "#033923"}
                      seed={i + 3}
                    />
                  </div>
                </div>
                <p className="mt-3 font-display text-sm font-semibold uppercase tracking-wide text-forest">
                  {localised(p.name)}
                </p>
                <p className="font-body text-xs text-stone">
                  {active.length > 1
                    ? `${t("from", { price: from })} · ${t("options", { count: active.length })}`
                    : t("price", { price: from })}
                </p>
                {category === "seeds" && stock > 0 && (
                  <p className="font-body text-xs text-stone/70">
                    {t("stock", { grams: stock })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
