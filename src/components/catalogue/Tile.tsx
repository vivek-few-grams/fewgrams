import type { ReactNode } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Sprout } from "@/components/ui/Sprout";
import { ScatterMarquee } from "@/components/ui/ScatterMarquee";

/**
 * One tile in a catalogue grid — the §17.4 card motion, applied to whatever
 * the grid is listing. `/microgreens` and `/seeds` both use it.
 *
 * Written for varieties and moved here on 17 Sep 2026 when seeds got their own
 * grid. Only one prop needed generalising: the marquee's words — see `words`.
 *
 * On hover the punnet scales out 10% and tilts 4° while the panel clips
 * inward 4% and a marquee of the variety's nutrients scrolls up behind it.
 * All CSS: `.mcard` in globals.css, no animation library, and nothing here
 * runs on the client.
 *
 * **List page only.** The detail page shows the same nutrients as a table
 * with their qualitative values and the note explaining why they are
 * qualitative — a reader who has arrived there wants to read them, not watch
 * them go past. It carries no `.mcard__media` or `.mcard__marquee`, and
 * should not gain any.
 *
 * Three treatments, because the photography arrives one variety at a time:
 *
 * | | When |
 * |---|---|
 * | cut-out on a colour panel, with the marquee | `images.cutout` exists |
 * | flat hero photograph filling the tile | `images.hero` only |
 * | `Sprout` mark with the name scrolling behind | neither |
 *
 * The hero photograph is *not* dropped into the media box as a substitute for
 * a cut-out: it carries its own background, so it would sit on the panel as a
 * rectangle and the tilt would read as a skewed picture. The flat treatment
 * is the honest version of "no cut-out yet".
 */

/**
 * The grounds a tile can sit on, handed out by position.
 *
 * Pale tints, and no `forest`: the punnets photograph on unbleached kraft
 * pulp, which needs a light ground to read as fibre rather than as a
 * silhouette, and the greens themselves are the only saturated thing that
 * should be in the tile. `sage` and `mint` at full strength competed with the
 * leaf colour — the violet of amaranthus against solid mint read as two
 * brand colours arguing — so both are dropped to a tint over the cream page.
 *
 * One light family also means one text colour for the marquee everywhere, so
 * there is one contrast pair to verify rather than six.
 *
 * By position rather than by variety, for the same reason `planPanels` is:
 * there is nothing in a variety record that should decide between sage and
 * sand. Keying the ground to each green's own colour — violet behind red
 * cabbage, the Don Molinico move — would be better still, but that is design
 * metadata and it would have to live somewhere; worth doing when there are
 * enough varieties for the rotation to start repeating visibly.
 */
const PANELS = ["bg-sage/30", "bg-sand", "bg-mint/40"] as const;

export function Tile({
  href,
  name,
  meta,
  index,
  cutout,
  hero,
  words,
  action,
}: {
  href: string;
  name: string;
  meta: string;
  /** Position in the grid — picks the ground, and stands in for `priority`. */
  index: number;
  cutout: { src: string; alt: string } | null;
  hero: { src: string; alt: string } | null;
  /** Scrolls behind the cut-out — see `Marquee`. */
  words: string[];
  /** Under the card, outside the link — `QuickAdd` on a grid that sells
   *  straight from the card. A button inside an anchor is invalid HTML and
   *  its click would also navigate. */
  action?: ReactNode;
}) {
  const panel = PANELS[index % PANELS.length];

  return (
    <div>
      {/* The picture and the caption are two links to one page, so the quick
          add can sit beside the caption without being inside an anchor. The
          picture is taken out of the tab order and the accessibility tree:
          one stop per card, on the name. */}
      <Link href={href} tabIndex={-1} aria-hidden="true" className="group block">
        <div
          className={`mcard flex aspect-square items-center justify-center ${
            cutout ? panel : "bg-forest"
          }`}
        >
          {cutout ? (
            <>
              <ScatterMarquee words={words} toneClass="text-forest/45" />
              {/* 96%, against the 70% `.mcard` uses elsewhere. The cut-out is
                  itself padded to 86% of its own frame by the build step, so the
                  punnet lands at ~83% of the tile at rest.

                  Wider than the reference because the subject is different: Don
                  Molinico's jar is a tall portrait object in a portrait card, so
                  70% of the width still reads as substantial. A punnet shot at a
                  three-quarter angle is a 1.34:1 landscape silhouette inside a
                  square box, which means its own height only reaches two thirds
                  of the box before its width runs out — at 70% it looked like a
                  thumbnail floating in colour. The marquee keeps the top and
                  bottom bands, which is where it is legible anyway; the lines
                  that pass behind the punnet were never readable.

                  **96% is close to the ceiling, and the ceiling is the hover.**
                  The subject is 86% of the box wide and 64% tall, and hover
                  scales it 1.1 and rotates it 4°, which takes the rotated
                  bounding width to 0.993 × the box. So a box at 100% of the tile
                  would put the punnet's corners inside the tile's own 20px
                  border radius and `overflow: hidden` would shave them. At 96%
                  the hovered subject is ~294px in a 308px tile — 7px of
                  clearance each side, verified in the browser. Anything larger
                  needs the cut-out re-padded tighter than 86%, not a wider box. */}
              <div className="mcard__media relative aspect-square w-[96%]">
                <Image
                  src={cutout.src}
                  alt={cutout.alt}
                  fill
                  priority={index < 4}
                  sizes="(min-width: 768px) 18vw, 35vw"
                  className="object-contain"
                />
              </div>
            </>
          ) : hero ? (
            /* `sizes` matches the 2-up / 4-up grid so no phone downloads a
               desktop image. `priority` on the first row only: the top-left tile
               is this page's Largest Contentful Paint element, and lazy-loading
               it delays the metric by a round trip — but marking everything
               priority defeats the point and floods the connection. */
            <Image
              src={hero.src}
              alt={hero.alt}
              fill
              priority={index < 4}
              sizes="(min-width: 768px) 25vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <>
              <div className="mcard__marquee text-mint/20" aria-hidden="true">
                <div className="mcard__marquee-inner">
                  {[0, 1].map((copy) => (
                    <div key={copy} className="px-2">
                      <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                        {name}
                      </span>
                      <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mcard__media w-[62%]">
                <Sprout className="h-full w-full" stroke="#A8CF8E" seed={index} />
              </div>
            </>
          )}
        </div>
      </Link>
      {/* Name and price on the left, quick add on the right, on one line.
          The price is forest and semibold — it is the figure being decided
          on, and in stone at 12px it read as a caption.

          `flex-wrap` with a 5rem floor on the caption: a phone tile is ~160px,
          which fits the small "Add" beside the name but not the wider − n +
          stepper, so once an item is in the cart the stepper drops to its own
          line instead of crushing the name to nothing. */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-2 gap-y-2">
        <Link href={href} className="group min-w-20 flex-1">
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-forest transition-colors group-hover:text-stone">
            {name}
          </p>
          <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-forest">
            {meta}
          </p>
        </Link>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
