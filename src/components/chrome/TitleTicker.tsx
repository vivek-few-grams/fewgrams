"use client";

import { useEffect } from "react";

/**
 * The rotating tab title — `Fewgrams | Microgreens`, `Fewgrams | Seeds`, and
 * so on, cycling **while the tab is in the background**. Borrowed from
 * palmo.co.in, which rotates `Flavours | Chilling / Pressing / Pouring`.
 *
 * A browser tab is the one piece of brand surface that stays visible after the
 * visitor leaves the page, and a catalogue that names itself there is a
 * cheaper reminder than any of the alternatives.
 *
 * **Only while hidden** (20 Oct 2026). It used to rotate all the time, which
 * replaced the page's own title: on `/microgreens/mustard` the tab stopped
 * naming the page the visitor was on, a bookmark took whatever word was
 * showing, and — the reason it changed — Google renders pages with
 * JavaScript and can record the title a script set, so a product page could
 * be indexed as "Fewgrams | Racks". The page's real title is back the moment
 * the tab is looked at, and a crawler, which never hides the tab, only ever
 * sees the real one.
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

    /* The page's own title, captured each time the tab is hidden rather than
       once: a client-side navigation changes it, and Next sets the new
       route's title without knowing this component exists. */
    let original = document.title;
    let id: number | undefined;
    let i = 0;

    const show = () => {
      document.title = `${brand} | ${words[i % words.length]}`;
      i += 1;
    };
    const stop = () => {
      if (id === undefined) return;
      window.clearInterval(id);
      id = undefined;
      document.title = original;
    };
    const onVisibility = () => {
      if (!document.hidden) return stop();
      if (id !== undefined) return;
      original = document.title;
      show();
      id = window.setInterval(show, HOLD_MS);
    };

    /* Nothing on mount, even for a tab opened in the background: Next
       applies the route's metadata title after hydration, so a word written
       now is overwritten, and the title captured as "original" might not be
       the page's yet. Such a tab starts ticking the first time it is looked
       at and left. */
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
    /* `words` is an array literal from the server component, so a new
       reference every render — joined into a string to compare by value and
       stop the listener being re-attached on every parent re-render. */
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
