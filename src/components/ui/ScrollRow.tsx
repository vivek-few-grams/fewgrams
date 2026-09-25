"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One row of cards that scrolls sideways, with an arrow at each end — the
 * home page's "Other products" tiles (the owner, 25 Sep 2026: five tiles in a four-column
 * grid left one alone on a second row).
 *
 * Each child keeps the width it had as a grid cell (`itemClass`), so the
 * cards look exactly as they did and the extra ones sit off to the right.
 * The row itself is a native scroller with snap points, so a trackpad, a
 * swipe and the keyboard all work without the arrows; the arrows are a
 * convenience on top, and each hides when there is nothing further its way.
 *
 * The server render shows the row with no arrows. They appear once the
 * browser has measured that the row overflows, so a row that fits never
 * shows an arrow that does nothing.
 */
export function ScrollRow({
  children,
  itemClass,
  gapClass = "gap-5",
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
  /** Width of one card, as a flex basis. It has to subtract the gaps, so
   *  it is written against `gapClass`. */
  itemClass: string;
  gapClass?: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    /* A pixel of slack either side: a fractional scroll position at the far
       end would otherwise keep the arrow up with nothing left to show. */
    const measure = () =>
      setEdges({
        prev: el.scrollLeft > 1,
        next: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      resized.disconnect();
    };
  }, []);

  /** One card's width plus the gap, so each press lands on the next card. */
  const step = (direction: 1 | -1) => {
    const el = row.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * (first.offsetWidth + gap), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={row}
        className={`flex snap-x snap-mandatory ${gapClass} overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {Children.toArray(children).map((child, i) => (
          <div key={i} className={`shrink-0 snap-start ${itemClass}`}>
            {child}
          </div>
        ))}
      </div>
      {edges.prev && <Arrow side="left" label={prevLabel} onClick={() => step(-1)} />}
      {edges.next && <Arrow side="right" label={nextLabel} onClick={() => step(1)} />}
    </div>
  );
}

function Arrow({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      /* Centred on the tile's picture rather than the whole card, which
         includes the caption under it. */
      className={`absolute top-[42%] z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-forest text-cream shadow-md transition-colors hover:bg-forest-deep ${
        side === "left" ? "-left-3 md:-left-5" : "-right-3 md:-right-5"
      }`}
    >
      <Icon size={22} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
