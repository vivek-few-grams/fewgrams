import { Leaf, ShieldCheck, Snowflake, Sprout as SproutIcon } from "lucide-react";

/**
 * Trust band — SPEC §18.3 section 6. Icon badges, sage on forest, matching the
 * Organic Mandya stats-band reference.
 *
 * Testimonials were deliberately dropped from the home page (SPEC §18.3):
 * there are no customers yet, an empty carousel signals that nobody buys this,
 * and invented quotes are an unacceptable trade for a food brand. This band
 * does the same job honestly.
 */
const tags = [
  { icon: Leaf, title: "Organically grown", note: "Soil and water, nothing else" },
  { icon: ShieldCheck, title: "No chemicals", note: "No pesticides, no growth agents" },
  { icon: SproutIcon, title: "Trusted seed sources", note: "Untreated seed only" },
  { icon: Snowflake, title: "Never frozen", note: "Cut and delivered the same morning" },
];

export function TrustTags() {
  return (
    <section className="bg-forest">
      <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-20">
        <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-cream/15">
          {tags.map((t) => (
            <li key={t.title} className="lg:px-8 lg:first:pl-0 lg:last:pr-0">
              <span className="grid size-12 place-items-center rounded-full bg-sage text-forest">
                <t.icon size={22} strokeWidth={1.5} />
              </span>
              <h3 className="mt-5 font-display text-base font-semibold text-cream">
                {t.title}
              </h3>
              <p className="mt-1.5 font-body text-sm text-mint/70">{t.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
