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
            a seal. Centred, so the five sit as a set of badges. */}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6">
          {tags.map((t) => (
            <li key={t.key} className="flex flex-col items-center text-center">
              <span className="rounded-full border border-forest/25 p-1.5">
                <span className="grid size-14 place-items-center rounded-full bg-forest text-cream md:size-16">
                  <t.icon className="size-6 md:size-7" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </span>
              <h3 className="mt-2.5 font-display text-base font-bold text-forest md:text-lg">
                {tr(`${t.key}.title`)}
              </h3>
              <p className="mt-1 max-w-[30ch] font-body text-xs text-stone md:text-sm lg:max-w-none">{tr(`${t.key}.note`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
