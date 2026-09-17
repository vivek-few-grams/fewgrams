"use client";

import { useEffect } from "react";

/**
 * The rotating tab title — `Fewgrams | Microgreens`, `Fewgrams | Seeds`, and
 * so on, cycling while the tab is open. Borrowed from palmo.co.in, which
 * rotates `Flavours | Chilling / Pressing / Pouring`.
 *
 * A browser tab is the one piece of brand surface that stays visible after the
 * visitor leaves the page, and a catalogue that names itself there is a
 * cheaper reminder than any of the alternatives.
 *
 * **It replaces the per-page title, which is the cost.** On
 * `/microgreens/mustard` the server renders `Mustard` and this overwrites it,
 * so the tab stops naming the page the visitor is actually on, and a bookmark
 * taken mid-rotation is saved as whatever was showing. Search engines are
 * unaffected — crawlers read the server-rendered `<title>`, not a title a
 * `useEffect` set afterwards — so the trade is a navigational one, not an SEO
 * one. Restoring the real title and rotating only while `document.hidden` is
 * the variant that avoids it; the reference does not do that, and neither does
 * this.
 *
 * The words arrive pre-resolved. A `t()` function is not serialisable across
 * the server boundary, and the labels already exist translated in
 * `common.categories` — inventing a second set of category words for the tab
 * is how the tab and the nav end up disagreeing.
 */
export function TitleTicker({ brand, words }: { brand: string; words: string[] }) {
  useEffect(() => {
    if (words.length === 0) return;
    /* A tab title changing on a timer is moving content in the sense WCAG
       2.2.2 means, and it cannot be paused. Someone who asked for less motion
       keeps the title the page shipped with. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* Captured before the first write so the page's own title can be put back.
       Without this, a client-side navigation away from a rotating page would
       inherit whichever word was last showing — Next only sets the title on
       the new route, and the interval from the old one would already have
       clobbered it. */
    const original = document.title;
    let i = 0;

    const show = () => {
      document.title = `${brand} | ${words[i % words.length]}`;
      i += 1;
    };

    /* No immediate call. Writing the first word here loses it: Next applies
       the route's metadata title *after* hydration, so `Microgreens` was set,
       overwritten back to `Mustard`, and the first word a visitor saw was
       whatever the interval reached next — `Racks`. Letting the first tick be
       `words[0]` also leaves the page's real title up for the first 2.5s,
       which is the moment it is most worth reading. */
    const id = window.setInterval(show, HOLD_MS);

    return () => {
      window.clearInterval(id);
      document.title = original;
    };
    /* `words` is an array literal from the server component, so a new
       reference every render — joined into a string to compare by value and
       stop the interval restarting on every parent re-render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, words.join("|")]);

  return null;
}

/**
 * How long each word holds.
 *
 * 2.5s, deliberately slower than the 4s hero and much slower than a marquee:
 * the tab strip is peripheral, and a title flicking past faster than it can be
 * read is the kind of thing that reads as a broken page rather than as a
 * flourish. Slow enough that a glance lands on a whole word.
 */
const HOLD_MS = 2500;
