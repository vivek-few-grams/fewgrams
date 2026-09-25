import { Leaf, ShieldCheck, Snowflake, Sprout as SproutIcon } from "lucide-react";
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
      <div className="mx-auto max-w-[1400px] px-6 py-14 md:px-12 md:py-16">
        {/* Badges rather than a row of small line icons (the owner, 25 Sep
            2026: "big but not so promising"). The old 48px circle was
            `bg-forest` on a `bg-forest` band, so only the 22px glyph showed.
            Now a forest medallion with a cream glyph — the house rule for an
            icon in a circle — inside a thin forest ring, so each one reads as
            a seal. Centred, so the four sit as a set of badges. */}
        <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {tags.map((t) => (
            <li key={t.key} className="flex flex-col items-center text-center">
              <span className="rounded-full border border-forest/25 p-2">
                <span className="grid size-20 place-items-center rounded-full bg-forest text-cream md:size-24">
                  <t.icon className="size-9 md:size-10" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </span>
              <h3 className="mt-5 font-display text-lg font-bold text-forest md:text-xl">
                {tr(`${t.key}.title`)}
              </h3>
              <p className="mt-1.5 max-w-[26ch] font-body text-sm text-stone">{tr(`${t.key}.note`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
