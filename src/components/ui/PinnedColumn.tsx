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
 * `.pin-column` in `globals.css` pins it at `--pin-top`, desktop only.
 *
 * **The column grows; it never scrolls inside itself** (the owner, 18 Oct
 * 2026 — a long order sat in a little scroll box). One taller than the window
 * would never show its bottom if it were pinned by its top, so then it is
 * pinned by its bottom instead: `--pin-top` goes negative by the overflow,
 * the column rides up with the page until its last line is on screen, and
 * stays there. Its own size changing (an address picked, lines set aside)
 * re-measures too.
 */
/** Space kept under a column too tall to pin by its top, in px. */
const BOTTOM_GAP = 16;

export function PinnedColumn({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const column = ref.current;
    const grid = column?.parentElement;
    if (!column || !grid) return;
    const measure = () => {
      const top = grid.getBoundingClientRect().top + window.scrollY;
      const fits = window.innerHeight - column.offsetHeight - BOTTOM_GAP;
      column.style.setProperty("--pin-top", `${Math.round(Math.min(top, fits))}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    observer.observe(column);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <aside ref={ref} className={`pin-column ${className}`}>
      {children}
    </aside>
  );
}
