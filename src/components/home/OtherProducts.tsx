import { MarqueeCard } from "@/components/ui/MarqueeCard";
import {
  CategoryMedia,
  categoryMediaClass,
} from "@/components/catalogue/CategoryMedia";
import { getTranslations } from "next-intl/server";
import { CATEGORIES, type Category } from "@/lib/types";
import { CATEGORY_COUNT, CATEGORY_HREF, CATEGORY_PANELS } from "@/lib/shop";

/**
 * Other products — SPEC §18.3 section 5. Four tiles, full Don Molinico
 * treatment (§17.4), clearly secondary to the plans above.
 *
 * The categories themselves are the site's information architecture (SPEC §3),
 * so they are structural. The counts underneath come from DynamoDB, which is
 * what makes an empty category read honestly as "coming soon" rather than
 * linking to a bare page.
 *
 * Labels and panel colours are shared with the shop overlay and /shop, so a
 * category looks and reads the same wherever it appears.
 */
export async function OtherProducts({
  counts,
}: {
  counts: Record<Category, number>;
}) {
  const t = await getTranslations("home.otherProducts");
  const label = await getTranslations("common.categories");
  const counted = await getTranslations("common.counts");

  /* `md:py-20`, matching `Process` and `TrustTags` — see the note there. */
  return (
    <section className="mx-auto max-w-[1400px] px-6 py-14 md:px-12 md:py-20">
      <div className="max-w-2xl">
        <p className="font-body text-[11px] uppercase tracking-widest text-stone">
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h2>
        <p className="mt-4 font-body text-sm text-stone">
          {t("body")}
        </p>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-6">
        {CATEGORIES.map((c, i) => {
          const n = counts[c] ?? 0;
          return (
            <MarqueeCard
              key={c}
              href={CATEGORY_HREF[c]}
              label={label(c)}
              note={counted(CATEGORY_COUNT[c], { count: n })}
              words={[label(c), label(c)]}
              panelClass={CATEGORY_PANELS[c].panelClass}
              marqueeClass={CATEGORY_PANELS[c].marqueeClass}
              media={<CategoryMedia category={c} index={i} />}
              mediaClass={categoryMediaClass(c)}
            />
          );
        })}
      </div>
    </section>
  );
}
