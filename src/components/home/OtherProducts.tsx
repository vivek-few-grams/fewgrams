import Image from "next/image";
import { MarqueeCard } from "@/components/ui/MarqueeCard";
import { ScrollRow } from "@/components/ui/ScrollRow";
import {
  CategoryMedia,
  categoryMediaClass,
} from "@/components/catalogue/CategoryMedia";
import { getTranslations } from "next-intl/server";
import type { Category } from "@/lib/types";
import { CATEGORY_COUNT, CATEGORY_HREF, CATEGORY_PANELS } from "@/lib/shop";

/**
 * Other products — SPEC §18.3 section 5. One scrolling row of tiles, full Don Molinico
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
  categories,
  microgreensOn,
  varietyCount,
  microgreenNames,
  rackRangeNames,
  seedNames,
  trayItemNames,
  mediumNames,
}: {
  counts: Record<Category, number>;
  /** Already filtered to what admin has switched on — see
   *  `@/lib/catalogue/visibility`. Fetched by the page rather than here so it
   *  shares the one cached read with the category strip and the header. */
  categories: readonly Category[];
  /** Microgreens is not a `Category` (SPEC §18.6) — it gets its own leading
   *  tile here, exactly as it does on `/shop`, rather than folding into the
   *  `categories` grid. */
  microgreensOn: boolean;
  varietyCount: number;
  /** Real names for the word clouds behind each tile — the same
   *  "the real names, not the category label twice" rule `/shop` follows
   *  (CLAUDE.md). */
  microgreenNames: string[];
  rackRangeNames: string[];
  seedNames: string[];
  trayItemNames: string[];
  mediumNames: string[];
}) {
  /* All four switched off is not a state anyone is expected to leave the site
     in, but the section heading and body still shouldn't sit above an empty
     grid if they do — same "not rendered at all" rule as an empty rack range. */
  if (categories.length === 0 && !microgreensOn) return null;

  const t = await getTranslations("home.otherProducts");
  const label = await getTranslations("common.categories");
  const counted = await getTranslations("common.counts");
  const row = await getTranslations("common.categoryRow");

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

      {/* One sideways-scrolling row (the owner, 25 Sep 2026; /shop keeps its grid).
          The basis subtracts the gaps so four tiles fill the width from md. */}
      <div className="mt-12">
      <ScrollRow
        itemClass="basis-[calc((100%-1.25rem)/2)] md:basis-[calc((100%-4.5rem)/4)]"
        gapClass="gap-5 md:gap-6"
        prevLabel={row("prev")}
        nextLabel={row("next")}
      >
        {microgreensOn && (
          <MarqueeCard
            href="/microgreens"
            label={label("microgreens")}
            note={counted("varieties", { count: varietyCount })}
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
            mediaClass="aspect-[3/2] w-[93%]"
          />
        )}

        {categories.map((c, i) => {
          const n = counts[c] ?? 0;
          const WORDS: Record<typeof c, string[]> = {
            racks: rackRangeNames,
            seeds: seedNames,
            trays: trayItemNames,
            media: mediumNames,
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
      </ScrollRow>
      </div>
    </section>
  );
}
