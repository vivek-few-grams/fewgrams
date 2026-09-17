import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { notFound } from "next/navigation";
import { t as localised, CATEGORIES, type Category } from "@/lib/types";
import { listByCategory } from "@/lib/repo/products";
import { CATEGORY_PANELS } from "@/lib/shop";
import { redirect } from "@/i18n/navigation";
import { Sprout } from "@/components/ui/Sprout";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";

/**
 * /shop/[category] — SPEC §12. One page per product category, read from
 * `fewgrams-catalogue` by a single GSI1 Query.
 *
 * **Two of the four categories have left this page.** Microgreens never
 * belonged to it (SPEC §18.6) and seeds left on 17 Sep 2026 (SPEC §22.5):
 * both are described catalogues where each item has a page of its own copy, so
 * both redirect to their own route. What is left here is trays and snacks —
 * interchangeable SKUs where a grid genuinely is the product listing — and
 * racks — whose customer view was deliberately unbuilt until 17 Sep 2026 and
 * now lives at `/shop/racks` and `/shop/racks/[range]` (SPEC §19.6, §19.7), so
 * a static segment takes that URL off this page exactly as trays did.
 *
 * Product detail pages (`/shop/[category]/[slug]`) are not built, so the cards
 * here are not links. Everything a buyer needs to compare is on the card
 * itself, so the page is useful before the detail route exists rather than a
 * list of dead ends.
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

  /* Two categories in the shop menu are **described catalogues with their own
     routes**, not grids of interchangeable SKUs: microgreens (SPEC §18.6) and,
     since 17 Sep 2026, seeds (SPEC §22.5). Both redirect rather than 404, so
     the URL a visitor might guess — or an old link — still works. */
  if (category === "microgreens") redirect({ href: "/microgreens", locale });
  if (category === "seeds") redirect({ href: "/seeds", locale });
  if (!isCategory(category)) notFound();

  const t = await getTranslations("shop.category");
  const label = await getTranslations("common.categories");
  const products = await listByCategory(category, { activeOnly: true });
  const panel = CATEGORY_PANELS[category];

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
      <CategoryStrip current={category} />

      <h1 className="mt-8 font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
        {label(category)}
      </h1>
      <p className="mt-3 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      {products.length === 0 ? (
        /* One sentence for everybody, including an admin (changed 17 Sep
           2026). It used to offer an admin a link to `/admin/products`, and
           that screen is gone: it was one generic form for four categories
           that have nothing in common, and the two categories with real
           content — seeds and racks — now have screens of their own. Trays and
           snacks have no admin screen yet, so there is nowhere honest to send
           anyone, and a link to a 404 is worse than the plain truth. */
        <p className="mt-12 rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          {t("empty", { category: label(category).toLowerCase() })}
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-6">
          {products.map((p, i) => {
            const active = p.variants.filter((v) => v.active);
            const from = active.length
              ? Math.min(...active.map((v) => v.price))
              : p.basePrice;
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
