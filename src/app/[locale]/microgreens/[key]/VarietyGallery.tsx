"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type Shot = { src: string; alt: string };

/**
 * The variety photographs — one large image with a thumbnail strip under it.
 *
 * Replaced a separate "Closer look" band lower down the page on 15 Sep 2026.
 * The band buried the second photograph a full screen below the first and
 * read as a different subject; a picker keeps every angle of the same green
 * in one place, which is what a product page is expected to do.
 *
 * **Only the images you have actually looked at are mounted.** Rendering all
 * of them up front would fetch every full-size photograph on load and hand
 * the LCP metric a queue of images nobody asked for; rendering *only* the
 * active one would re-fetch on every switch and flash. So a shot is mounted
 * the first time it is selected and then kept, and switching is an opacity
 * change from then on.
 *
 * Every label arrives pre-translated. A server component cannot hand a
 * function across the client boundary (it is not serialisable), so the
 * per-thumbnail labels come in as a finished array rather than a formatter.
 */
export function VarietyGallery({
  shots,
  thumbLabels,
  prevLabel,
  nextLabel,
}: {
  shots: Shot[];
  thumbLabels: string[];
  prevLabel: string;
  nextLabel: string;
}) {
  const [active, setActive] = useState(0);
  /* Index 0 is mounted from the start — it is the one `priority` preloads. */
  const [mounted, setMounted] = useState<number[]>([0]);
  const strip = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  function select(i: number) {
    setActive(i);
    setMounted((prev) => (prev.includes(i) ? prev : [...prev, i]));
  }

  /* Arrows appear only when the strip genuinely cannot show every thumbnail.
     Measured rather than derived from a count, because how many fit depends
     on the viewport — at five photographs a desktop needs no arrows and a
     phone does. */
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shots.length]);

  /* Keeps the selected thumbnail visible when the keyboard moves the
     selection past the edge of the strip. */
  useEffect(() => {
    strip.current
      ?.querySelectorAll("button")
      [active]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  const nudge = (dir: 1 | -1) => {
    const el = strip.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const single = shots.length < 2;

  return (
    /* `min-w-0` is load-bearing, not tidiness. A grid item defaults to
       `min-width: auto`, so without it the thumbnail strip's intrinsic width
       overrides its column: at nine photographs on a 390px phone the strip
       stopped scrolling, pushed the whole page 378px wide, and — because
       `scrollWidth` then equalled `clientWidth` — the arrows measured
       themselves as unnecessary and disappeared exactly where they were most
       needed. It has to repeat on each nested level; a single `min-w-0` on the
       outer div is not enough, because each child re-introduces the default. */
    <div className="min-w-0">
      {/* 3:2, matching the photography, and `object-contain` rather than
          `object-cover`.

          The frame was `aspect-square` with `object-cover` until 15 Sep 2026,
          which threw away a third of the width of every 1536x1024 photo — on
          the broccoli hero that cut the tray and half the baked-in title.
          `cover` guarantees a full frame by guaranteeing a crop, which is the
          wrong guarantee for a product photograph the grower composed.

          `bg-sand` (#f2ebe3) is not an arbitrary neutral: the studio backdrop
          in these photographs measures around rgb(240, 231, 225) along its top
          and bottom edges, so where an odd ratio does letterbox, the bars read
          as part of the photograph rather than as bars. */}
      <div className="mcard relative aspect-[3/2] overflow-hidden bg-sand">
        {shots.map((shot, i) =>
          mounted.includes(i) ? (
            <Image
              key={`${i}-${shot.src}`}
              src={shot.src}
              alt={shot.alt}
              fill
              priority={i === 0}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className={`object-contain transition-opacity duration-300 ${
                i === active ? "opacity-100" : "opacity-0"
              }`}
              /* The inactive photographs stay in the DOM so switching back is
                 instant, but they are not part of the page for a screen
                 reader — two descriptions of one visible image is noise. */
              aria-hidden={i === active ? undefined : true}
            />
          ) : null,
        )}
      </div>

      {!single && (
        <div className="relative min-w-0 mt-4">
          <div
            ref={strip}
            /* `scrollbar-none` is deliberate: the arrows and the visible
               partial thumbnail already signal that the strip scrolls, and a
               scrollbar under six 72px squares is heavier than the control. */
            className="flex min-w-0 gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const step = event.key === "ArrowRight" ? 1 : -1;
              const next = (active + step + shots.length) % shots.length;
              select(next);
              strip.current?.querySelectorAll("button")[next]?.focus();
            }}
          >
            {shots.map((shot, i) => (
              <button
                key={`${i}-${shot.src}`}
                type="button"
                onClick={() => select(i)}
                aria-pressed={i === active}
                aria-label={thumbLabels[i]}
                /* Same 3:2 as the main frame. A square thumbnail would crop
                   differently from the image it opens, so what you tap would
                   not be what you get. */
                className={`relative h-14 w-[84px] shrink-0 overflow-hidden rounded-xl border-2 bg-sand transition-colors md:h-16 md:w-24 ${
                  i === active
                    ? "border-forest"
                    : "border-transparent hover:border-forest/40"
                }`}
              >
                <Image
                  src={shot.src}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-contain"
                />
              </button>
            ))}
          </div>

          {overflow && (
            <>
              <StripArrow side="left" label={prevLabel} onClick={() => nudge(-1)} />
              <StripArrow side="right" label={nextLabel} onClick={() => nudge(1)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StripArrow({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-forest/15 bg-cream/95 text-forest shadow-sm transition-colors hover:bg-sand ${
        side === "left" ? "-left-2" : "-right-2"
      }`}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}
