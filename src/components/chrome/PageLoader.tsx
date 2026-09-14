"use client";

import { useEffect } from "react";
import { brand } from "@/lib/brand";

/**
 * Full-screen brand panel that retracts to reveal the page — SPEC §17.5.
 *
 * Loaders are usually a net loss, so this one is deliberately constrained:
 *   · first visit only, remembered in sessionStorage — never on navigation
 *   · hard-capped at ~800ms, and never gated on a network request
 *   · skipped entirely under prefers-reduced-motion
 *
 * Whether the panel shows at all is decided by `loaderInitScript` below, which
 * runs synchronously in <head> before first paint. A repeat visitor therefore
 * never sees a flash of it. This component only retracts the panel, by writing
 * to the DOM rather than through React state — the page underneath is already
 * painted and interactive, so the loader hides work instead of adding delay.
 */
export function PageLoader() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.loader !== "in") return;

    const retract = setTimeout(() => {
      root.dataset.loader = "out";
    }, 650);

    const remove = setTimeout(() => {
      delete root.dataset.loader;
    }, 1500);

    return () => {
      clearTimeout(retract);
      clearTimeout(remove);
    };
  }, []);

  return (
    <div className="loader" aria-hidden="true">
      <span className="loader__mark font-display text-[clamp(2rem,7vw,5rem)] font-bold tracking-tight text-cream">
        {brand.name}
      </span>
    </div>
  );
}

/**
 * Runs before first paint, so the panel is either already covering the page or
 * never rendered — no flash either way. Kept tiny and dependency-free on
 * purpose; it is inlined into the document head.
 */
export const loaderInitScript = `(function(){
try {
  if (!sessionStorage.getItem('fg:loader') &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.dataset.loader = 'in';
  }
  sessionStorage.setItem('fg:loader', '1');
} catch (e) {}
})()`;
