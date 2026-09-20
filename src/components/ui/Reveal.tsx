"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Plays the CSS reveal animations inside it when the block scrolls into view.
 *
 * The animations themselves are CSS — `.reveal-pop`, `.reveal-rise` and
 * `.reveal-draw` in globals.css, staggered off an inline `--i`. This component
 * only decides *when* they run, and it is built so that the content is never
 * left invisible:
 *
 * - The server HTML carries **no** `data-reveal` attribute, so the animations
 *   run on load exactly like `.hero-copy` does. With JavaScript off, or if
 *   hydration never happens, the section still animates in and settles. The
 *   usual `opacity-0` + observer pattern gets this backwards and shows an
 *   empty page to anyone whose JS did not arrive.
 * - On mount, a block **already in the viewport** is left alone: its animation
 *   is mid-flight and the visitor is watching it. Restarting it would be a
 *   visible stutter, and there is nothing to defer — they can already see it.
 * - Only a block still **below the fold** is set to `out`, which stops the
 *   animation and hides it. That change happens off-screen, so it can never
 *   flash. Clearing the attribute later starts the animation from the top,
 *   because `animation: none` → `animation: <name>` is a new animation rather
 *   than a resumed one.
 *
 * Reduced motion returns before any of that: the CSS has already flattened
 * these classes to no animation, so marking anything `out` would hide content
 * that is never going to animate back.
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    setHidden(true);

    /* A negative bottom margin so the reveal fires once the block is properly
       on screen rather than the instant its first pixel clears the fold —
       otherwise the stagger plays out below the visitor's line of sight. */
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setHidden(false);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-reveal={hidden ? "out" : undefined}>
      {children}
    </div>
  );
}
