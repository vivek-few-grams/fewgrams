import Image from "next/image";
import type { StoryPage } from "@/lib/content/story";

/**
 * One face of the storybook — SPEC §18.5.
 *
 * A page of this book is a **spread**: the illustration on the left leaf, the
 * words on the right. In the book those are two faces of two different sheets
 * (see `StoryBook` for how they pair up); in the mobile stack they are one
 * card. So this renders whichever part it is asked for, and `both` is the
 * stack — three call sites, one set of margins, and no way for the phone to
 * end up with different copy spacing from the desktop.
 *
 * ## The whole illustration, every time
 *
 * The thirteen masters run 1.34 to 3.0, on a leaf that is taller than it is
 * wide at every viewport the book runs at. `object-cover` threw away a third
 * to a half of each picture — heads cropped, the tray cut off, the one thing
 * the page is *about* pushed out of frame. The plate is drawn at its own
 * size inside a `max-w` / `max-h` box instead, so every picture is shown
 * whole at every viewport and the leftover paper is allowed to be paper.
 *
 * That leftover is what `caption` fills. It is not decoration: without it the
 * left leaf is a picture floating in an acre of cream, which looks like a
 * layout bug rather than a book.
 *
 * ## The plate carries no border and no soft edge
 *
 * Both were tried on 22 Sep 2026 and rejected. A radial-gradient mask
 * dissolved each rectangle into the paper, on the theory that thirteen hard
 * rectangles down a book read as thirteen screenshots; in practice it read as
 * a blur, and it ate whatever the illustration happened to have near its
 * edge. The masters already sit on near-white backgrounds, so they meet cream
 * paper softly on their own. Show the whole picture and add nothing.
 *
 * ## Type is sized in `cqw`, against the face's own width
 *
 * `.story-page` is a container (globals.css), so the same heading is ~34px on
 * a 700px leaf and ~24px on a 390px phone. A `vw` clamp gets this exactly
 * backwards: it sets the largest type on the widest viewport, which is the
 * one where a leaf is *narrowest* relative to the screen.
 */
export function StoryFace({
  page,
  folio,
  part,
  heading: Heading = "h2",
  priority = false,
}: {
  page: StoryPage;
  /**
   * The page number as the reader sees it — "3 / 13", already formatted and
   * translated by `StoryBook`.
   *
   * A string rather than two numbers, because the separator is a message
   * (`story.folio`) and this component has no translator of its own. It is
   * also the only reason this file does not need one.
   */
  folio: string;
  part: "plate" | "text" | "both";
  /** `h1` on the first page, `h2` everywhere else. Passed in rather than
   *  derived, because a face has no idea whether it is first. */
  heading?: "h1" | "h2";
  /** Fetch this illustration eagerly. Only the opening spread earns it —
   *  everything after is a scroll away, and thirteen eager illustrations is
   *  most of a megabyte spent before a visitor has turned anything. */
  priority?: boolean;
}) {
  /* Top right of the spread — so, the words leaf, and **only** the words
     leaf. Two things are deliberate here.

     Not the outer bottom corner a printed book uses: on screen the foot of
     the page is where the scroll hint and the browser's own chrome live, and
     at full bleed the folio was competing with both. The head of the page is
     empty on every spread.

     And not once per leaf. A "page" of this story is a whole spread, so both
     leaves carry the same number — printing it on each put two identical
     figures on one screen, one of them hard against the gutter, which reads
     as a bug rather than as pagination. */
  const folioMark = (
    <span
      aria-hidden="true"
      className="absolute right-8 top-6 font-body text-xs tabular-nums text-stone/50"
    >
      {folio}
    </span>
  );

  /**
   * The illustration, at its own aspect, as large as the leaf allows.
   *
   * `width` / `height` are the file's real pixels (`story.ts` reads them out
   * of the WebP header) and the CSS is `w-auto h-auto` inside a `max-w` /
   * `max-h` box — so the element **is** the picture, not a container the
   * picture sits inside. The thirteen masters run 1.34 to 3.0; inside one
   * fixed `aspect-[3/2]` box the wide ones letterboxed and the tall ones left
   * cream bars down each side, and either way the caption sat a random
   * distance below the picture.
   *
   * `max-h-[62%]` caps how much of the leaf a tall picture may take, so the
   * caption stays under the picture rather than being pushed to the foot of
   * the page.
   */
  const plate = (
    <div className="story-page relative flex h-full w-full flex-col items-center justify-center gap-7 bg-cream px-6 py-10">
      <Image
        src={page.src}
        alt={page.text.imageAlt}
        width={page.width}
        height={page.height}
        /* **No `sizes` here, deliberately.** `width: auto` on a replaced
           element uses the image's *density-corrected* intrinsic width, and
           with a `w`-descriptor srcset that is derived from `sizes` rather
           than from the file — which rendered every plate at 450px instead of
           filling the leaf. Without it the browser uses the real 1200px and
           the `max-*` pair below does what it says. The x-descriptor srcset
           Next falls back to costs nothing measurable, because the masters
           are only 1200px wide to begin with.

           `w-auto h-auto` with `max-w-full` and `max-h` is the one CSS
           combination that fits a replaced element inside a box while
           preserving its aspect, whatever shape the master happens to be. */
        className="h-auto max-h-[62%] w-auto max-w-full"
        priority={priority}
      />
      <p className="max-w-[30ch] px-10 text-center font-display text-[clamp(0.95rem,2.3cqw,1.35rem)] font-semibold leading-snug text-forest/70">
        {page.text.caption}
      </p>
    </div>
  );

  const words = (
    <div className="story-page relative flex h-full w-full flex-col justify-center bg-cream py-12 pl-14 pr-10 lg:pl-20 lg:pr-14">
      <div className="mx-auto w-full max-w-[46ch]">
        <p className="ui-label font-body text-stone [--label-size:12px]">
          {page.text.eyebrow}
        </p>
        <Heading className="mt-4 font-display text-[clamp(1.4rem,4.4cqw,2.5rem)] font-bold leading-[1.12] tracking-tight text-forest">
          {page.text.heading}
        </Heading>
        <div className="mt-5 space-y-4 font-body text-[clamp(0.85rem,1.9cqw,1.05rem)] leading-relaxed text-stone">
          {page.text.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
      {folioMark}
    </div>
  );

  if (part === "plate") return plate;
  if (part === "text") return words;

  /* The stack. One card per page, illustration over words — the whole
     picture, edge to edge, exactly as the book shows it. */
  return (
    <div className="flex h-full w-full flex-col bg-cream">
      <Image
        src={page.src}
        alt={page.text.imageAlt}
        width={page.width}
        height={page.height}
        sizes="100vw"
        className="h-auto w-full shrink-0"
        priority={priority}
      />
      <div className="story-page relative flex-1 px-6 pb-12 pt-5">
        {/* `pr-14` keeps the caption clear of the folio, which is in this
            block's top-right corner here rather than the illustration's —
            the picture bleeds to the card edge and a numeral over it would
            land on whatever the artwork happens to have there. */}
        <p className="pr-14 font-display text-[clamp(0.95rem,3.6cqw,1.2rem)] font-semibold leading-snug text-forest/70">
          {page.text.caption}
        </p>
        <p className="ui-label mt-6 font-body text-stone [--label-size:11px]">
          {page.text.eyebrow}
        </p>
        <Heading className="mt-3 font-display text-[clamp(1.25rem,6cqw,1.9rem)] font-bold leading-[1.15] tracking-tight text-forest">
          {page.text.heading}
        </Heading>
        <div className="mt-4 space-y-3 font-body text-[clamp(0.85rem,3.4cqw,0.95rem)] leading-relaxed text-stone">
          {page.text.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        {folioMark}
      </div>
    </div>
  );
}
