"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { brand } from "@/lib/brand";

/**
 * The brand curtain — a forest panel carrying the logo that covers the page and
 * retracts to reveal it. SPEC §17.5.
 *
 * It runs in two situations, and they are not the same event:
 *
 *   1. **First visit in a session.** Decided by `loaderInitScript`, which runs
 *      synchronously in `<head>` before first paint, so a repeat visitor never
 *      sees a flash of a panel that was about to be dismissed.
 *   2. **Every internal navigation** (added 15 Sep 2026, the reference being
 *      donmolinico.es). A circle of forest **opens from the middle of the
 *      screen**, covers the page being left, holds, and closes back to the
 *      middle on the page that arrived.
 *
 *      Three origins, in order: the click point (wrong — a click on a variety
 *      card sits in the middle of the grid, so the circle came from nowhere in
 *      particular), the brand logo (better, but off in a corner, so the sweep
 *      arrived edge-first), and now the centre. The centre is also the only one
 *      that needs no JavaScript at all: `circle(72% at 50% 50%)` resolves
 *      against the viewport, so there is nothing to measure, nothing to hand
 *      across a document load, and a resize mid-animation is free.
 *
 * ## It survives a full document load
 *
 * Not every internal navigation is client-side — the language switch loads a
 * new document, and so does any link followed before React has hydrated. The
 * curtain therefore hands itself over through `sessionStorage`: raising one
 * sets a flag, and the init script on the *next* document finds the flag and
 * comes up already covered (`hold`) rather than animating in. Without that the
 * curtain vanished with the old document and the new page cut in abruptly,
 * which is exactly the jump the curtain exists to hide.
 *
 * ## The rules that keep it from becoming a tax on every click
 *
 * · **Never gated on the network.** The curtain retracts when the route has
 *   committed *or* when `FAILSAFE_MS` expires, whichever is first. A navigation
 *   that never arrives — a blocked click, a route that throws — cannot leave
 *   the page covered.
 * · **Capped.** `MIN_COVER_MS` is the floor that stops a prefetched route from
 *   strobing; nothing sets a ceiling above `FAILSAFE_MS`.
 * · **Skipped entirely under `prefers-reduced-motion`**, both paths.
 * · **Only for a change of page.** A link to the current pathname, an in-page
 *   hash, a new tab, a download, `mailto:`, an external host and any modified
 *   click all pass through untouched. A curtain over a jump to `/#plans` would
 *   hide the very thing it scrolled to.
 *
 * ## Why the DOM rather than React state
 *
 * The state lives in `html[data-loader]`, written imperatively. Two reasons:
 * the inline head script has to set it before React exists, and the click
 * handler has to cover the page in the same tick as the click — a state update
 * would land a frame later, after the browser had already begun the navigation.
 */

/**
 * Floor on a navigation curtain, measured from the click.
 *
 * It is not a cosmetic pause: it has to be at least `--curtain-enter`, or a
 * prefetched route would start closing the circle while it was still opening
 * and the whole gesture would collapse into a blink. The excess over the open
 * is the hold on the logo.
 */
const MIN_COVER_MS = 1180;

/** Fade-out duration. **Must match `--curtain-exit` in globals.css** — this
 *  timer only removes the attribute once the animation it drives has ended. */
const EXIT_MS = 650;

/** Hard ceiling on a navigation curtain. Past this the page is uncovered
 *  whether or not the route ever arrived. */
const FAILSAFE_MS = 3000;

/** First-visit hold. Shorter than a navigation's, because nothing is pending —
 *  the page underneath is already painted and interactive. */
const INTRO_MS = 650;

/** Hold after a handed-over curtain. Much shorter: the document load the
 *  visitor just waited through was itself the hold. */
const HANDOFF_MS = 220;

/** Set while a curtain is up, and read by the init script of the next
 *  document — see "It survives a full document load". */
const HANDOFF_KEY = "fg:curtain";

function markHandoff(on: boolean) {
  /* Private browsing and a full quota both throw on write. A curtain is
     decoration; it must never be the reason a page fails. */
  try {
    /* A timestamp, not a boolean: the flag is only honoured while fresh,
       because a page that never consumes it must not leave a curtain armed for
       later — and one exists. The global 404 is outside `[locale]`, so it runs
       neither the init script nor this component. */
    if (on) sessionStorage.setItem(HANDOFF_KEY, String(Date.now()));
    else sessionStorage.removeItem(HANDOFF_KEY);
  } catch {}
}

function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Is this click a navigation to another page of this site?
 *
 * Everything here is a reason the curtain would be wrong, not merely
 * unnecessary — see the class list in the header comment.
 */
function navigatedAnchor(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor) return null;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return null;
  if (anchor.hasAttribute("download")) return null;
  /* `_blank` and a named frame both leave this document on screen. */
  if (anchor.target && anchor.target !== "_self") return null;

  let url: URL;
  try {
    url = new URL(anchor.href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;

  /* Same pathname covers two cases worth keeping uncovered: the link to the
     page you are on, and a link that only changes the query string — a filter
     or a page number, where a full-screen wipe is far more motion than the
     change deserves. */
  if (url.pathname === location.pathname) return null;

  return anchor as HTMLAnchorElement;
}

export function PageLoader() {
  /**
   * Deliberately `next/navigation`, not `@/i18n/navigation`.
   *
   * The project rule is to use the locale-aware wrappers, and that rule is
   * about *navigating*. This is change *detection*, and it needs the raw URL:
   * next-intl's `usePathname` strips the locale segment, so `/en/shop` →
   * `/kn/shop` would look like no change at all and the language switch would
   * hang on the failsafe instead of retracting when the page arrived.
   */
  const pathname = usePathname();

  /** When the current navigation curtain went up, or null if none is up. */
  const coveredAt = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* One helper for both paths: every timer is registered so a click during a
     retraction, or an unmount mid-animation, cannot leave a stale callback to
     uncover a curtain that a later navigation has since raised. */
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const retract = (delay: number) => {
    const root = document.documentElement;
    clearTimers();
    later(() => {
      root.dataset.loader = "out";
      coveredAt.current = null;
      /* The navigation resolved inside this document, so there is nothing to
         hand over. Left set, it would raise a curtain on the next full load
         for no reason. */
      markHandoff(false);
      later(() => delete root.dataset.loader, EXIT_MS);
    }, delay);
  };

  /* Already covered at first paint. `loaderInitScript` decided which of the two
     reasons applies; if neither, this does nothing. */
  useEffect(() => {
    const state = document.documentElement.dataset.loader;
    if (state !== "in" && state !== "hold") return;
    retract(state === "hold" ? HANDOFF_MS : INTRO_MS);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Raise the curtain on the click, not on the route change: by the time a new
     pathname reaches React the browser has been working for some time, and a
     panel that appears late reads as a glitch rather than a transition. */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (prefersReducedMotion()) return;
      /* A curtain already up is either this navigation or the intro; in both
         cases raising a second one would restart the animation. */
      if (document.documentElement.dataset.loader) return;
      if (!navigatedAnchor(event)) return;

      document.documentElement.dataset.loader = "nav";
      coveredAt.current = Date.now();
      /* Set before the browser gets a chance to tear this document down: if
         the click turns out to be a full load, the next document reads this
         and keeps the curtain up across it. */
      markHandoff(true);
      clearTimers();
      later(() => {
        if (coveredAt.current !== null) retract(0);
      }, FAILSAFE_MS);
    };

    /* Capture, so the curtain is up even if a component's own handler calls
       `stopPropagation` on the way up. */
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The route has committed. Retract, honouring the minimum hold so a route
     that was already prefetched does not flash. */
  useEffect(() => {
    if (coveredAt.current === null) return;
    retract(Math.max(0, MIN_COVER_MS - (Date.now() - coveredAt.current)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="loader" aria-hidden="true">
      {/* `alt=""`, and the container is `aria-hidden`: the route change is
          already announced by Next's route announcer, and a screen reader
          meeting the brand name on every navigation learns nothing.

          `priority` because on a first visit this is the only thing on screen.
          `unoptimized` because it is an SVG — the optimiser would need
          `dangerouslyAllowSVG` and has nothing to gain on vector art. */}
      <Image
        src={brand.logoLight.src}
        alt=""
        width={brand.logoLight.width}
        height={brand.logoLight.height}
        unoptimized
        priority
        className="loader__mark h-auto w-[clamp(190px,44vw,330px)]"
      />
    </div>
  );
}
