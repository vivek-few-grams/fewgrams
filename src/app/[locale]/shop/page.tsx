import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { MarqueeCard } from "@/components/ui/MarqueeCard";
import { Sprout } from "@/components/ui/Sprout";
import { CATEGORIES } from "@/lib/types";
import { countsByCategory } from "@/lib/repo/products";
import { listVarieties } from "@/lib/repo/varieties";
import { CATEGORY_PANELS } from "@/lib/shop";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";

/**
 * /shop — SPEC §12. The overlay's landing page, and the destination for
 * anyone who arrives without using the menu.
 *
 * Microgreens leads and is a different kind of thing from the rest: a variety
 * catalogue sold by the 100 g (SPEC §18.6), not a product category. It gets
 * its own tile pointing at /microgreens rather than a /shop/<slug> page.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/shop">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.index" });
  return { title: t("title"), alternates: localeAlternates("/shop") };
}

export default async function ShopIndex({ params }: PageProps<"/[locale]/shop">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("shop.index");
  const label = await getTranslations("common.categories");
  const counted = await getTranslations("common.counts");
  const [counts, varieties] = await Promise.all([
    countsByCategory(),
    listVarieties({ activeOnly: true }),
  ]);

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
      <CategoryStrip />

      <h1 className="mt-8 max-w-2xl font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-4 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-3 md:gap-6">
        <MarqueeCard
          href="/microgreens"
          label={label("microgreens")}
          note={counted("varieties", { count: varieties.length })}
          words={[label("microgreens"), label("microgreens")]}
          panelClass="bg-forest"
          marqueeClass="text-mint/25"
          media={<Sprout className="h-full w-full" stroke="#A8CF8E" seed={1} />}
        />

        {CATEGORIES.map((c, i) => {
          const n = counts[c] ?? 0;
          return (
            <MarqueeCard
              key={c}
              href={`/shop/${c}`}
              label={label(c)}
              note={counted("products", { count: n })}
              words={[label(c), label(c)]}
              panelClass={CATEGORY_PANELS[c].panelClass}
              marqueeClass={CATEGORY_PANELS[c].marqueeClass}
              media={
                <Sprout
                  className="h-full w-full"
                  stroke={c === "seeds" ? "#ABE1CC" : "#033923"}
                  seed={i + 2}
                />
              }
            />
          );
        })}
      </div>

      <p className="mt-14 font-body text-sm text-stone">
        {t("plansPrompt")}{" "}
        <Link href="/#plans" className="text-forest underline underline-offset-4">
          {t("plansLink")}
        </Link>
        .
      </p>
    </section>
  );
}
