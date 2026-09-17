import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The Don Molinico product card — SPEC §17.4.
 *
 * On hover the coloured panel pulls inward 4% while the media scales outward
 * 10%, and an oversized marquee of `words` scrolls vertically behind it. All
 * of it is `clip-path` + `transform` + one keyframe (see globals.css); no
 * animation library is involved.
 *
 * `words` is rendered twice — the keyframe translates -50%, so a single copy
 * would visibly jump at the loop point.
 */
export function MarqueeCard({
  href,
  label,
  note,
  words,
  panelClass,
  marqueeClass,
  labelClass = "text-forest",
  media,
  mediaClass = "aspect-square w-[70%]",
  cursorLabel = "Order",
}: {
  href: string;
  label: string;
  note?: string;
  words: string[];
  panelClass: string;
  marqueeClass: string;
  labelClass?: string;
  media: ReactNode;
  /**
   * The media box's shape and size. Square at 70% of the width by default,
   * which is the reference's own figure and right for a `Sprout` mark or a
   * punnet.
   *
   * Overridable because the subject decides it: a rack is a tall object, and
   * `object-contain` in a square box fits it by its height, leaving it small
   * in a portrait tile. Whatever is passed has to clear the hover — the media
   * scales 1.1 and rotates 4° inside `overflow: hidden` — so a larger box
   * means re-padding the cut-out, not just a bigger number here.
   */
  mediaClass?: string;
  cursorLabel?: string;
}) {
  const lines = (
    <div className="ta-c px-2">
      {words.map((w, i) => (
        <span
          key={i}
          className="mcard__marquee-line text-[clamp(2rem,4.5vw,3.4rem)] tracking-tight"
        >
          {w}
        </span>
      ))}
    </div>
  );

  return (
    <Link href={href} className="group block" aria-label={`${label}${note ? ` — ${note}` : ""}`}>
      <div
        className={`mcard flex aspect-[580/660] items-center justify-center ${panelClass}`}
        data-cursor={cursorLabel}
      >
        <div className={`mcard__marquee ${marqueeClass}`} aria-hidden="true">
          <div className="mcard__marquee-inner">
            {lines}
            {lines}
          </div>
        </div>
        <div className={`mcard__media flex items-center justify-center ${mediaClass}`}>
          {media}
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h3 className={`font-display text-lg font-semibold tracking-tight ${labelClass}`}>
          {label}
        </h3>
        {note && (
          <span className="shrink-0 font-body text-xs text-stone tabular-nums">{note}</span>
        )}
      </div>
    </Link>
  );
}
