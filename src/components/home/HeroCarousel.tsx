"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { onSectionClick } from "@/lib/section-scroll";

export type HeroSlide = {
  src: string;
  alt: string;
  /** `object-cover` anchor, per frame — see the note in `Hero.tsx`. */
  position: string;
  eyebrow: string;
  headline: string;
  body: string;
};

/** The two things the hero can usefully ask for, offered on every frame. */
export type HeroActions = { plans: string; greens: string };

/**
 * How long each frame holds before the next one fades in.
 *
 * The 600ms cross-fade is a literal in the `duration-[600ms]` classes below —
 * Tailwind only emits classes it can see in the source, so it cannot be
 * derived from a constant. Keep it well under this hold, or the band spends
 * more time dissolving than settled and reads as a permanent shimmer rather
 * than as four photographs.
 *
 * 4s leaves ~3.4s of stillness per frame, which is enough to read a headline
 * and a line of body copy. It is still short for *choosing* between two calls
 * to action, so the pause handlers below are what make them comfortably
 * reachable — see the note beside `hold`.
 */
const HOLD_MS = 4000;

/**
 * The hero band — SPEC §18.3 section 2.
 *
 * Each frame carries its own copy and its own call to action, cross-fading
 * together with its photograph, over a cream wash that runs from opaque on the
 * left to clear on the right. Dark copy on a light ground rather than the
 * reverse: it is the layout the brand references use, and it clears 4.5:1 with
 * room to spare instead of needing a heavy scrim that flattens the photo.
 *
 * Every frame is in the DOM from the first paint and only opacity moves, so a
 * transition never waits on a fetch and never flashes an empty band. Only frame
 * 0 is `priority`: it is the LCP candidate and must be decoded before the §17.5
 * curtain retracts, while the rest are wanted *eventually* and would otherwise
 * compete with it for bandwidth at the worst possible moment.
 *
 * Copy arrives pre-resolved from the server component. A `t()` function is not
 * serialisable across the boundary, and resolving it here would mean shipping
 * the `home` namespace to the client.
 */
export function HeroCarousel({
  slides,
  actions,
  dotLabels,
}: {
  slides: HeroSlide[];
  actions: HeroActions;
  dotLabels: string[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);

  /* Read the preference at runtime, not through a media query in CSS: the
     rotation is a timer, and a `@media` block cannot stop one. Someone who
     asked for less motion gets a still hero they can still step through. */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /* `active` is a dependency on purpose: choosing a frame restarts the hold, so
     one the visitor picked is never snatched away half a second later. */
  useEffect(() => {
    if (still || paused || slides.length < 2) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % slides.length), HOLD_MS);
    return () => window.clearInterval(id);
  }, [active, still, paused, slides.length]);

  /* Pointer in, or focus anywhere inside, stops the clock — without this a 2s
     rotation would move the CTA out from under the cursor on the way to it.
     Touch has no hover to leave, so a tap stops it for good: a visitor who
     reached into the band has taken it over, and resuming underneath their
     thumb would be the same bug in a different costume. */
  const hold = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false) };

  return (
    <div
      {...hold}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      /* No height on a phone: the image block and the copy block stack, so the
         band is as tall as its contents. A fixed viewport height here forced a
         0.54:1 box around a 2:1 photograph, and `object-cover` answered by
         showing the middle 27% of its width — which cropped the subject clean
         out of three of the four frames. From `md` the copy moves on top of
         the image and the fixed band comes back.

         48vh, so the band stays under half the viewport and the section below
         it is visible without scrolling. `min-h` is what it costs to hold the
         copy: the column needs ~260px for a two-line headline plus the button
         row, and below a ~835px-tall window 48vh stops being enough. */
      className="relative w-full overflow-hidden bg-cream md:h-[48vh] md:min-h-[400px]"
    >
      {/* 3:2 on a phone — wide enough to keep these 2:1–2.5:1 frames mostly
          intact, tall enough not to read as a letterbox strip. */}
      <div className="relative aspect-[3/2] w-full md:absolute md:inset-0 md:aspect-auto">
        {slides.map((slide, index) => (
          <div
            key={slide.src}
            aria-hidden={index !== active}
            className={`absolute inset-0 transition-opacity duration-[600ms] ease-[var(--ease-brand)] ${
              index === active ? "opacity-100" : "opacity-0"
            } ${still ? "transition-none" : ""}`}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={index === 0}
              sizes="100vw"
              className={`object-cover ${slide.position}`}
            />
          </div>
        ))}

      </div>

      {/* The cream panel, `md` and up only — on a phone the copy sits in its own
          block below the image and needs no wash at all.
          
          Two stops, not three, and clear by 58% of the width rather than 74%:
          the copy ends around the 35% mark, where this leaves ~0.70 alpha, and
          `forest/80` body text on that measures 5.1:1 against the darkest
          foliage likely to be underneath. Every stop past what the text needs
          is image the visitor paid for and cannot see. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-cream from-25% to-transparent to-58% md:block"
      />

      <div className="px-6 pb-4 pt-2 md:absolute md:inset-y-0 md:right-auto md:flex md:max-w-[46%] md:flex-col md:justify-center md:px-12 md:pb-0 md:pt-0">
        {/* Only the active frame's copy is mounted — see `.hero-copy` in
            globals.css for why it does not cross-fade like the photographs. The
            `key` is what makes the enter animation run again on every change:
            React remounts the subtree, so the animation restarts rather than
            being a no-op on an element that never left.

            `min-h` is what stops the buttons below from jogging up and down as
            the headline goes from one line to two. Measured against the longest
            frame, not guessed — see the sibling check in the review notes. */}
        <div key={active} className="min-h-[9.5rem] md:min-h-[13.5rem]">
          <p
            className="hero-copy font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-bark"
            style={{ "--i": 0 } as CSSProperties}
          >
            {slides[active].eyebrow}
          </p>
          <p
            className="hero-copy mt-3 font-display text-[clamp(1.85rem,4.2vw,3.4rem)] font-bold leading-[1.08] tracking-tight text-forest"
            style={{ "--i": 1 } as CSSProperties}
          >
            {slides[active].headline}
          </p>
          <p
            className="hero-copy mt-4 max-w-md font-body text-base leading-relaxed text-forest/80"
            style={{ "--i": 2 } as CSSProperties}
          >
            {slides[active].body}
          </p>
        </div>

        {/* Both actions on every frame, and deliberately OUTSIDE the keyed
            block: they are the same two buttons throughout, so re-mounting them
            four times a rotation would re-run their enter animation and — worse
            at a 2s hold — momentarily move the target out from under a cursor
            already travelling towards it. */}
        {/* `mt-7` is not decoration: the `min-h` above is a floor, not a gap, so
            a frame whose copy fills it exactly would run straight into this
            row. */}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/#plans"
            onClick={(event) => onSectionClick(event, "plans")}
            className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            {actions.plans}
            <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
          </Link>
          {/* Solid border, not a tint: every `forest/*` tint tops out at 2.57:1
              against cream, and 1.4.11 wants 3:1 for a control's own boundary. */}
          <Link
            href="/microgreens"
            className="inline-flex items-center gap-2 rounded-full border border-forest px-6 py-3 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
          >
            {actions.greens}
          </Link>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="flex gap-2.5 px-6 pb-8 md:absolute md:bottom-5 md:left-12 md:px-0 md:pb-0">
          {slides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => setActive(index)}
              aria-label={dotLabels[index]}
              aria-current={index === active}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === active ? "w-7 bg-forest" : "w-2 bg-forest/30 hover:bg-forest/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
