"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A right-hand column that stays exactly where it starts while the left one
 * scrolls — `/cart` and `/checkout`.
 *
 * A fixed `top` cannot do that: the column's starting offset depends on the
 * header and on the heading, whose size is a `clamp()` of the window width,
 * so any constant makes it travel a few pixels and then stop. So the grid —
 * the parent — is measured rather than the column itself, because a stuck
 * sticky element reports where it is stuck, not where it began. Any change in
 * the page's size (resize, fonts arriving) re-measures.
 *
 * `.pin-column` in `globals.css` pins it at `--pin-top`, desktop only. Put the
 * height cap (`.pin-column__scroll`) on an inner box, never on this one: a
 * pinned panel taller than the window would never show its bottom, and
 * `overflow` here would clip anything hung outside it.
 */
export function PinnedColumn({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const column = ref.current;
    const grid = column?.parentElement;
    if (!column || !grid) return;
    const measure = () => {
      const top = grid.getBoundingClientRect().top + window.scrollY;
      column.style.setProperty("--pin-top", `${Math.round(top)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  return (
    <aside ref={ref} className={`pin-column ${className}`}>
      {children}
    </aside>
  );
}
