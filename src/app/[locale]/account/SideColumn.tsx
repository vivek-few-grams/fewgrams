"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * The account page's right-hand column (from `lg`): whatever the page puts
 * above the menu (`@aside`), then the menu. Two things line it up with the
 * page beside it (the owner, 26 Sep 2026):
 *
 * - **Its top meets the first card, not the page's intro.** Every account
 *   page opens with an unboxed heading and a sentence, marked
 *   `data-account-intro`; the column is pushed down to where the element
 *   after it begins, so the menu card and the first content card share a top
 *   edge. The order page has no intro, so its hero starts level already.
 * - **When the page marks a block with `data-side-align`** — the order's
 *   green hero — the column is stretched to that block's height, so the two
 *   also end on the same line. The extra height goes to the first card in the
 *   column (`lg:flex-1` on the aside card).
 *
 * CSS cannot do either: the page and the column sit in different subtrees.
 * Measured with a ResizeObserver, so it follows the intro and the hero as
 * their text wraps, and re-run per path because each page has its own. Below
 * `lg` the column is not a column and nothing is set.
 */
export function SideColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const self = useRef<HTMLDivElement>(null);

  /* Written straight to the element's style rather than through state: this
     syncs the DOM to other elements' sizes, and a state round-trip would
     only add a render. */
  useEffect(() => {
    const column = self.current;
    const row = column?.parentElement;
    if (!column || !row) return;
    const intro = document.querySelector<HTMLElement>("[data-account-intro]");
    const start = intro?.nextElementSibling ?? null;
    const target = document.querySelector<HTMLElement>("[data-side-align]");
    const wide = window.matchMedia("(min-width: 64rem)");
    const measure = () => {
      const on = wide.matches;
      column.style.marginTop =
        on && start ? `${Math.max(0, start.getBoundingClientRect().top - row.getBoundingClientRect().top)}px` : "";
      column.style.minHeight = on && target ? `${target.getBoundingClientRect().height}px` : "";
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [intro, target]) if (el) observer.observe(el);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", measure);
      column.style.marginTop = "";
      column.style.minHeight = "";
    };
  }, [pathname]);

  return (
    <div ref={self} className="lg:sticky lg:top-28 lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:gap-4 xl:w-80">
      {children}
    </div>
  );
}
