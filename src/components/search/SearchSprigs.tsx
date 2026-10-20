"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Image from "next/image";

/**
 * Two painted sprigs reaching into the search band from opposite corners —
 * top right and bottom left, crossed the way the login page sets them (the
 * owner, 20 Oct 2026; SPEC §27.2). The same artwork.
 *
 * **Each grows in from its corner.** The sprig is turned so its stem points
 * into the corner, the band clips at its edges (`overflow-clip`), and the
 * rise (`.search-sprig` in globals.css) runs along the stem in the sprig's own
 * turned frame — so it comes out of the edge rather than fading in on the
 * band. Behind everything (`-z-10` in an `isolate`d band): where a leaf
 * reaches the column, the pill and the tiles cover it.
 *
 * From `lg` only: below that the column is the whole band and a corner sprig
 * would sit on the field. Smaller at 1024px (`w-36`), where the column's edge
 * is 176px from the window's, and tucked less far into the corner there —
 * the same offsets as at full size cropped most of a smaller sprig away.
 *
 * **Each waits for its own picture.** The band mounts on a tap, and an
 * animation started before the file arrived would play to an empty box and
 * pop the sprig in at the end; so `data-grown` is set on load, and the rise
 * starts then. From cache that is at once.
 *
 * **Then each sways about its stem**, 3° to either side, the two in opposite
 * directions and at different paces (`--sway-time`) so they never move as a
 * pair. Clearly moving, as the owner asked — 1.5° one way over 7s could not
 * be seen to move.
 *
 * **They need the band's height**, which is why the band keeps the tallest it
 * has been while open (`SearchBox`): fitted to "Nothing matches", it cut
 * both sprigs to stumps.
 *
 * Decorative: `alt=""`, no pointer events, and still under reduced motion.
 * No blurred stand-in, as on the login page — a smear growing out of a corner
 * would read as a fault, not a sprig.
 */
const SPRIGS = [
  {
    src: "/img/brand/login-sprig-sage.webp",
    width: 520,
    height: 526,
    /* The login page's own corner and turn. */
    place: "-right-8 -top-9 rotate-[200deg] xl:-right-12 xl:-top-14",
    delay: "250ms",
    sway: "3deg",
    swayTime: "3.4s",
  },
  {
    src: "/img/brand/login-sprig-chard.webp",
    width: 520,
    height: 525,
    place: "-bottom-9 -left-6 rotate-[25deg] xl:-bottom-14 xl:-left-10",
    delay: "420ms",
    sway: "-3deg",
    swayTime: "3.9s",
  },
] as const;

export function SearchSprigs() {
  const [grown, setGrown] = useState<ReadonlySet<string>>(new Set());

  return SPRIGS.map((sprig) => (
    <span
      key={sprig.src}
      aria-hidden="true"
      data-grown={grown.has(sprig.src) ? "" : undefined}
      style={{ "--delay": sprig.delay, "--sway": sprig.sway, "--sway-time": sprig.swayTime } as CSSProperties}
      className={`search-sprig pointer-events-none absolute -z-10 hidden select-none lg:block ${sprig.place}`}
    >
      <span className="search-sprig__rise block">
        <span className="search-sprig__sway block">
          <Image
            src={sprig.src}
            alt=""
            width={sprig.width}
            height={sprig.height}
            sizes="(min-width: 1536px) 240px, (min-width: 1280px) 208px, 144px"
            onLoad={() => setGrown((was) => new Set(was).add(sprig.src))}
            /* `max-w-none`: an absolute box with no width of its own lets
               the base `max-width: 100%` shrink the picture to nothing. */
            className="w-36 max-w-none xl:w-52 2xl:w-60"
          />
        </span>
      </span>
    </span>
  ));
}
