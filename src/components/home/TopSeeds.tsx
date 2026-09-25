import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Tile } from "@/components/catalogue/Tile";
import { QuickAdd } from "@/components/catalogue/QuickAdd";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { quickAddFor } from "@/lib/cart/quick-add";
import { seedMaxUnits } from "@/lib/seeds/stock";
import { seedCutout, seedHero, type SeedContent } from "@/lib/content/seeds";
import type { Seed } from "@/lib/types";

/**
 * The seed strip under the category tiles — the owner, 25 Sep 2026: "top 5 seeds and
 * an arrow to show more", which goes to `/seeds`.
 *
 * The page ranks them (`rankBySales`) and passes them in; this only draws
 * them, with the same `Tile` and quick add as the `/seeds` grid so a seed
 * looks and buys the same in both places.
 *
 * The heading is honest about the ranking: "Our best-selling seeds" only once
 * something has sold, because before that the five are simply the first of
 * the grid and calling them best sellers would be a claim with nothing
 * behind it.
 */
export async function TopSeeds({
  seeds,
  ranked,
}: {
  seeds: (Seed & { content: SeedContent })[];
  /** True when at least one of `seeds` has sold. */
  ranked: boolean;
}) {
  if (seeds.length === 0) return null;

  const t = await getTranslations("home.topSeeds");
  const ts = await getTranslations("seeds");
  const quickAdd = await quickAddFor();

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-14 md:px-12 md:pb-20">
      <div className="flex items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="font-body text-[11px] uppercase tracking-widest text-stone">{t("eyebrow")}</p>
          <h2 className="mt-3 font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
            {ranked ? t("headingRanked") : t("heading")}
          </h2>
        </div>
        <Link
          href="/seeds"
          className="group flex shrink-0 items-center gap-3 font-body text-sm font-medium text-forest transition-colors hover:text-forest-deep"
        >
          <span className="hidden sm:inline">{t("seeAll")}</span>
          <span className="sr-only sm:hidden">{t("seeAll")}</span>
          <span className="grid size-11 place-items-center rounded-full bg-forest text-cream transition-colors group-hover:bg-forest-deep">
            <ArrowRight size={20} strokeWidth={2.25} aria-hidden="true" />
          </span>
        </Link>
      </div>

      <div className="mt-10">
        <ScrollRow
          itemClass="basis-[calc((100%-1.25rem)/2)] md:basis-[calc((100%-6rem)/5)]"
          gapClass="gap-5 md:gap-6"
          prevLabel={t("scrollPrev")}
          nextLabel={t("scrollNext")}
        >
          {seeds.map((s, i) => (
            <Tile
              key={s.contentKey}
              href={`/seeds/${s.contentKey}`}
              name={s.content.text.name}
              meta={ts("meta", { price: s.pricePer50g })}
              index={i}
              cutout={seedCutout(s.content)}
              hero={seedHero(s.content)}
              words={(s.content.text.specs ?? []).map((spec) => spec.label)}
              action={<QuickAdd {...quickAdd("seed", s.contentKey, s.content.text.name, seedMaxUnits(s.stockGrams))} />}
            />
          ))}
        </ScrollRow>
      </div>
    </section>
  );
}
