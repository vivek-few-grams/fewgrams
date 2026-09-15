import { PackageCheck, ScanSearch, Sprout as SproutIcon, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Our process — SPEC §18.3 section 3. The core differentiator and the answer
 * to "is this safe to eat", so it sits immediately below the hero and above
 * any pricing.
 */
const steps = [
  { key: "seed", icon: PackageCheck },
  { key: "quality", icon: ScanSearch },
  { key: "sown", icon: SproutIcon },
  { key: "harvest", icon: Truck },
] as const;

export async function Process() {
  const t = await getTranslations("home.process");

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-20 md:px-12 md:py-28">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h2 className="max-w-xl font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h2>
        <p className="font-display text-lg font-semibold text-forest md:text-xl">
          {t("aside")}
        </p>
      </div>

      <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.key}>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sage text-forest">
                <s.icon size={20} strokeWidth={1.5} />
              </span>
              <span className="font-body text-xs tabular-nums text-stone">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold text-forest">
              {t(`steps.${s.key}.title`)}
            </h3>
            <p className="mt-2 font-body text-sm leading-relaxed text-stone">
              {t(`steps.${s.key}.body`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
