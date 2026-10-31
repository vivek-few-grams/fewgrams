import { getTranslations } from "next-intl/server";

const STEPS = ["step1", "step2", "step3"] as const;

/**
 * The three steps from choosing a pack to a first harvest (SPEC §29.3). On a
 * wide screen they fill the comparison's top-left corner, beside the packs'
 * heads; on a phone they follow the table, so the packs come first.
 */
export async function PackSteps({ className = "" }: { className?: string }) {
  const t = await getTranslations("shop.packs");
  return (
    <div className={className}>
      <p className="font-body text-xs font-semibold uppercase tracking-widest text-stone">
        {t("stepsHeading")}
      </p>
      <ol className="mt-4 grid gap-4 sm:max-lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest font-display text-xs font-bold text-cream"
            >
              {i + 1}
            </span>
            <span>
              <span className="block font-body text-sm font-semibold text-forest">{t(`${step}Title`)}</span>
              <span className="mt-0.5 block font-body text-xs leading-relaxed text-stone">
                {t(`${step}Body`)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
