import { brand } from "@/lib/brand";
import { Sprout } from "@/components/ui/Sprout";
import { PinCheck } from "./PinCheck";

/**
 * Full-bleed hero — SPEC §18.3 section 2. Image spans the full viewport width;
 * the headline sits below it rather than over it.
 *
 * TODO: replace the placeholder panel with real photography. When you do, use
 * next/image with `priority`, an explicit `sizes`, and an AVIF/WebP source —
 * a full-bleed hero is the single biggest risk to first-load speed, and
 * without `sizes` a 4000px photo gets shipped to a phone. The image must also
 * be decoded before the loader (§17.5) retracts, or the reveal flashes empty.
 */
export function Hero() {
  return (
    <section>
      <div className="relative flex h-[52vh] min-h-[320px] w-full items-center justify-center overflow-hidden bg-forest md:h-[68vh]">
        <svg className="absolute inset-0 h-full w-full opacity-10" aria-hidden="true">
          <defs>
            <pattern id="hero-veins" width="180" height="180" patternUnits="userSpaceOnUse">
              <path
                d="M0 90 Q45 40 90 90 T180 90 M90 0 Q40 45 90 90 T90 180"
                fill="none"
                stroke="#FBF9F3"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-veins)" />
        </svg>
        <div className="relative flex items-end gap-2 opacity-70">
          {[0, 1, 2, 3, 4].map((i) => (
            <Sprout key={i} className="h-28 w-28 md:h-44 md:w-44" stroke="#A8CF8E" seed={i} />
          ))}
        </div>
        <p className="absolute bottom-4 right-5 font-body text-[10px] uppercase tracking-widest text-mint/40">
          placeholder — hero photograph needed
        </p>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 pt-10 md:px-12 md:pt-14">
        <div className="max-w-3xl">
          <h1 className="font-display text-[clamp(2rem,5.5vw,4.2rem)] font-bold leading-[1.05] tracking-tight text-forest">
            {brand.tagline}
          </h1>
          <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-stone md:text-lg">
            {brand.subline}
          </p>
          <div className="mt-7">
            <PinCheck />
          </div>
        </div>
      </div>
    </section>
  );
}
