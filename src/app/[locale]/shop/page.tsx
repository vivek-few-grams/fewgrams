import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { MarqueeCard } from "@/components/ui/MarqueeCard";
import {
  CategoryMedia,
  categoryMediaClass,
} from "@/components/catalogue/CategoryMedia";
import { categoryCounts } from "@/lib/catalogue/counts";
import { enabledCategories, isProductTypeEnabled } from "@/lib/catalogue/visibility";
import { listVarieties } from "@/lib/repo/varieties";
import { varietyNameMap } from "@/lib/content/varieties";
import { listSeeds } from "@/lib/repo/seeds";
import { seedNameMap } from "@/lib/content/seeds";
import { listTrays } from "@/lib/repo/trays";
import { trayNameMap } from "@/lib/content/trays";
import { RACK_RANGES } from "@/lib/racks/cart-key";
import { CATEGORY_COUNT, CATEGORY_HREF, CATEGORY_PANELS } from "@/lib/shop";
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
  const rackRanges = await getTranslations("shop.racks.ranges");
  const [counts, varieties, varietyNames, seeds, seedNameById, trays, trayNameById, categories, microgreensOn] =
    await Promise.all([
      categoryCounts(),
      listVarieties({ activeOnly: true }),
      varietyNameMap(locale),
      listSeeds({ activeOnly: true }),
      seedNameMap(locale),
      listTrays({ activeOnly: true }),
      trayNameMap(locale),
      enabledCategories(),
      isProductTypeEnabled("microgreens"),
    ]);
  /* Every variety on the shelf, for the microgreens tile's marquee — see
     `MarqueeCard`'s `scatter` prop. Named through the content file, same as
     the card the count above already reads: a row without one is skipped
     rather than showing a blank line in the scroll. */
  const microgreenNames = varieties
    .map((v) => varietyNames[v.contentKey])
    .filter((name): name is string => Boolean(name));
  /* The three ranges, for the racks tile's marquee — same `scatter` treatment,
     standing in for a per-item name list the way a rack has no content file
     to draw individual names from (SPEC §19.5). */
  const rackRangeNames = RACK_RANGES.map((range) => rackRanges(`${range}.name`));
  /* Seed and tray names for their own tiles' word clouds, 20 Sep 2026 — same
     "the real names, not the category label twice" call as microgreens and
     racks. `staticMarquee` on both (see `MarqueeCard`): their photographs
     already fill most of the panel, so scrolling type behind it read as
     motion for its own sake rather than the loop's actual job. */
  const seedNames = seeds
    .map((s) => seedNameById[s.contentKey])
    .filter((name): name is string => Boolean(name));
  const trayItemNames = trays
    .map((tr) => trayNameById[tr.contentKey])
    .filter((name): name is string => Boolean(name));

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-6 md:px-12 md:pb-24 md:pt-8">
      <CategoryStrip />

      <h1 className="mt-8 max-w-2xl font-display text-[clamp(1.25rem,2.5vw,1.9rem)] font-bold leading-tight tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-4 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-5">
        {microgreensOn && (
          <MarqueeCard
            href="/microgreens"
            label={label("microgreens")}
            note={counted("varieties", { count: varieties.length })}
            words={microgreenNames}
            scatter
            panelClass="bg-mint/40"
            marqueeClass="text-forest/25"
            media={
              <Image
                src="/shop/microgreens-cutout.webp"
                alt=""
                fill
                sizes="(min-width: 768px) 22vw, 42vw"
                className="object-contain"
              />
            }
            mediaClass="aspect-[3/2] w-[86%]"
          />
        )}

        {categories.map((c, i) => {
          const n = counts[c] ?? 0;
          const WORDS: Record<typeof c, string[]> = {
            racks: rackRangeNames,
            seeds: seedNames,
            trays: trayItemNames,
            snacks: [label(c), label(c)],
          };
          return (
            <MarqueeCard
              key={c}
              href={CATEGORY_HREF[c]}
              label={label(c)}
              note={counted(CATEGORY_COUNT[c], { count: n })}
              words={WORDS[c]}
              scatter={c !== "snacks"}
              panelClass={CATEGORY_PANELS[c].panelClass}
              marqueeClass={CATEGORY_PANELS[c].marqueeClass}
              media={<CategoryMedia category={c} index={i} />}
              mediaClass={categoryMediaClass(c)}
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
