import { getTranslations } from "next-intl/server";
import { HeroCarousel } from "./HeroCarousel";

/**
 * Full-bleed hero — SPEC §18.3 section 2. Four frames, each with its own copy
 * and its own call to action, over a cream panel that fades into the
 * photograph. The panel layout follows the brand references; the reasoning for
 * dark-on-light is in `HeroCarousel`.
 *
 * A frame is one entry here plus one `slides.<key>.*` group in
 * `messages/<locale>/home.json` and one `public/brand/hero-<key>.jpg`. Order is
 * the rotation order. Only structure lives in this array — crop anchor and
 * destination. Every word is a message key, including the alt text and the
 * button label.
 *
 * The file is named for its subject and `src` is derived from `key`, which is
 * not just tidiness: Next's image optimiser caches on the URL path, so reusing
 * one filename (`hero-1.jpg`) for successive photographs served the *first*
 * one forever. A different picture now means a different URL by construction.
 *
 * `position` is the `object-cover` anchor, and it is per frame because the crop
 * is per frame. One anchor covers both breakpoints because only one axis is
 * ever cropped: the desktop band is wider than every frame, so the crop there
 * is purely vertical, and the phone band is taller, so it is purely horizontal.
 *
 * Both destinations appear on every frame — `/#plans` for the subscription,
 * `/microgreens` for the library — so neither is a property of a frame and
 * neither is in this array. `/#plans` is an in-page anchor rather than a route
 * (SPEC §18.3), so its button goes through `onSectionClick`; without that it
 * works exactly once per page load.
 */
/** Declared so `hash` is optional on every frame rather than absent from the
 *  two that omit it — without it the inferred union has no common `hash`. */
type HeroFrame = {
  key: string;
  position: string;
};

const HERO_SLIDES: readonly HeroFrame[] = [
  /* The only frame needing a different anchor per breakpoint. Its bowl sits in
     the right half with the left half deliberately empty, which is perfect for
     the desktop panel — and fatal on a phone, where the 3:2 crop shows the
     middle 75% and lands on the empty side. Safe to split: the desktop band is
     wider than this 2:1 frame, so the crop there is vertical only and the
     horizontal anchor has nothing to do. */
  { key: "bowl", position: "object-right md:object-center" },
  { key: "plate", position: "object-center" },
  { key: "trays", position: "object-center" },
  { key: "harvest", position: "object-center" },
];

export async function Hero() {
  const t = await getTranslations("home.hero");
  const b = await getTranslations("common.brand");

  return (
    <section>
      {/*
       * The page's real heading, and the only `<h1>` on it.
       *
       * It is visually hidden because the words in the band rotate: promoting
       * one frame's headline to `<h1>` would make the document outline depend
       * on which photograph happens to be showing, and four `<h1>`s is worse.
       * So the stable brand line is the heading, and the frame headlines are
       * styled paragraphs — which is what they are.
       */}
      <h1 className="sr-only">{b("tagline")}</h1>

      <HeroCarousel
        slides={HERO_SLIDES.map(({ key, position }) => ({
          src: `/brand/hero-${key}.jpg`,
          position,
          alt: t(`slides.${key}.alt`),
          eyebrow: t(`slides.${key}.eyebrow`),
          headline: t(`slides.${key}.headline`),
          body: t(`slides.${key}.body`),
        }))}
        actions={{ plans: t("ctaPlans"), greens: t("ctaGreens") }}
        dotLabels={HERO_SLIDES.map((_, index) => t("goToSlide", { number: index + 1 }))}
      />
    </section>
  );
}
