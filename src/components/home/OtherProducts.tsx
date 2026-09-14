import { MarqueeCard } from "@/components/ui/MarqueeCard";
import { Sprout } from "@/components/ui/Sprout";
import { CATEGORIES, type Category } from "@/lib/types";

/**
 * Other products — SPEC §18.3 section 5. Four tiles, full Don Molinico
 * treatment (§17.4), clearly secondary to the plans above.
 *
 * The categories themselves are the site's information architecture (SPEC §3),
 * so they are structural. The counts underneath come from DynamoDB, which is
 * what makes an empty category read honestly as "coming soon" rather than
 * linking to a bare page.
 */
const LABELS: Record<Category, string> = {
  racks: "Racks",
  trays: "Trays",
  seeds: "Seeds",
  snacks: "Snacks",
};

const PANELS: Record<Category, { panelClass: string; marqueeClass: string }> = {
  racks: { panelClass: "bg-sand", marqueeClass: "text-forest/15" },
  trays: { panelClass: "bg-sage", marqueeClass: "text-forest/25" },
  seeds: { panelClass: "bg-forest", marqueeClass: "text-mint/25" },
  snacks: { panelClass: "bg-mint", marqueeClass: "text-forest/20" },
};

export function OtherProducts({
  counts,
}: {
  counts: Record<Category, number>;
}) {
  return (
    <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-12 md:py-32">
      <div className="max-w-2xl">
        <p className="font-body text-[11px] uppercase tracking-widest text-stone">
          Everything else
        </p>
        <h2 className="mt-3 font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
          Grow your own, or eat them ready-made.
        </h2>
        <p className="mt-4 font-body text-sm text-stone">
          Ordered any time and delivered on the same Saturday run as the greens.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-6">
        {CATEGORIES.map((c, i) => {
          const n = counts[c] ?? 0;
          return (
            <MarqueeCard
              key={c}
              href={`/${c}`}
              label={LABELS[c]}
              note={n === 0 ? "Coming soon" : `${n} ${n === 1 ? "product" : "products"}`}
              words={[LABELS[c], LABELS[c]]}
              panelClass={PANELS[c].panelClass}
              marqueeClass={PANELS[c].marqueeClass}
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
    </section>
  );
}
