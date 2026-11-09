import { HeartHandshake, Leaf, ShieldCheck, Snowflake, Sprout as SproutIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Trust band — SPEC §18.3 section 6. Icon badges on sand, after the
 * Organic Mandya stats-band reference.
 *
 * Testimonials were deliberately dropped from the home page (SPEC §18.3):
 * there are no customers yet, an empty carousel signals that nobody buys this,
 * and invented quotes are an unacceptable trade for a food brand. This band
 * does the same job honestly.
 */
const tags = [
  { key: "organic", icon: Leaf },
  { key: "noChemicals", icon: ShieldCheck },
  { key: "seed", icon: SproutIcon },
  { key: "neverFrozen", icon: Snowflake },
  /* Last, so the page closes on it (the owner, 26 Sep 2026): nothing is
     grown only for customers — the family eats from the same trays, so there
     is no second grade. "Same trays" is the proof; "no quality difference"
     is what the reader concludes. */
  { key: "sameTrays", icon: HeartHandshake },
] as const;

export async function TrustTags() {
  const tr = await getTranslations("home.trust");

  return (
    /* The home page's last section (25 Sep 2026), so it meets the footer:
       `data-footer-flush` tells the footer to drop its top margin rather
       than leave a cream strip above it. On sand, not forest: a forest band
       straight onto the forest footer read as one block (the owner, same
       day), and sand also sets it apart from the cream sections above. */
    <section data-footer-flush className="bg-sand">
      <div className="mx-auto max-w-[1400px] px-6 py-6 md:px-12 md:py-8">
        {/* Badges rather than a row of small line icons (the owner, 25 Sep
            2026: "big but not so promising"; then smaller on 26 Sep,
            so the band is a closing line rather than a section). The
            old 48px circle was `bg-forest` on a `bg-forest` band, so only the
            22px glyph showed.
            Now a forest medallion with a cream glyph — the house rule for an
            icon in a circle — inside a thin forest ring, so each one reads as
            a seal. Centred, so the five sit as a set of badges.

            A wrapping row centred on the band rather than a grid (the owner,
            9 Nov 2026): five badges in two columns left the fifth alone under
            the first, and in three the last two sat to the left. Centring the
            row puts a short last line in the middle at every width. The
            column widths are the grid's — half, a third, a fifth — with the
            gutter as padding on each badge.

            Smaller below `md` (the owner, 9 Nov 2026): at phone width the
            desktop sizes made each badge a block of its own, and the Kannada
            titles ran to two lines. From `md` the sizes are as before. */}
        <ul className="-mx-2 flex flex-wrap justify-center gap-y-6 md:gap-y-8 lg:-mx-3">
          {tags.map((t) => (
            <li
              key={t.key}
              className="flex basis-1/2 flex-col items-center px-2 text-center sm:basis-1/3 lg:basis-1/5 lg:px-3"
            >
              <span className="rounded-full border border-forest/25 p-1 md:p-1.5">
                <span className="grid size-11 place-items-center rounded-full bg-forest text-cream md:size-16">
                  <t.icon className="size-5 md:size-7" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </span>
              <h3 className="mt-2 font-display text-sm font-bold leading-snug text-forest md:mt-2.5 md:text-lg">
                {tr(`${t.key}.title`)}
              </h3>
              <p className="mt-0.5 max-w-[30ch] font-body text-[11px] leading-snug text-stone md:mt-1 md:text-sm md:leading-normal lg:max-w-none">
                {tr(`${t.key}.note`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
