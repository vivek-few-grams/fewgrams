import type { CSSProperties } from "react";

/**
 * The words that scroll behind a cut-out on a catalogue card — the §17.4
 * motion's text layer, on its own so the loop arithmetic has one home.
 *
 * Extracted from `Tile.tsx` on 17 Sep 2026 when the tray grid became the
 * second grid to use the treatment. Tray cards cannot use `Tile` itself: they
 * are 3:2 rather than square and they carry a price, a four-row spec list and
 * a dated dispatch promise under the picture, so the card is bespoke and only
 * the media panel is shared. The part worth sharing is this — not the markup,
 * which is four lines, but the two rules below, both of which are invisible
 * when they are wrong and only show up as a stutter once a minute.
 *
 * **`MarqueeCard` is deliberately not folded in.** It renders one copy of a
 * two-or-three word list at three times this type size on a 580×660 panel,
 * so neither rule applies to it: there is nothing to pad to ten lines and no
 * label long enough to need shortening. Folding it in would mean an options
 * object whose branches were each used once.
 */

/** The square variety tile's figure, and the default. See `minLines`. */
export const DEFAULT_MIN_LINES = 10;

/**
 * Enough lines that one copy overflows the card, rounded up to whole copies
 * of the list.
 *
 * The keyframe translates the inner block by -50%, so the block has to hold
 * the content exactly twice for the loop to be seamless — and *one* of those
 * halves has to be taller than the card, or the bottom of the card shows empty
 * panel at the moment the loop snaps back.
 *
 * Whole copies, not a slice: cycling to exactly ten would put `w0, w1` after
 * `w7` and then `w0` again immediately at the seam.
 *
 * Exported because the invariant is not visible in a screenshot — a seam
 * crosses the card once every eight seconds — and it has now been got wrong
 * twice, on the 3:2 tray card and again on the 4:5 rack card. `marquee.test.ts`
 * pins each live caller's numbers against the panel it actually renders in.
 */
export function marqueeLines(
  words: string[],
  minLines: number = DEFAULT_MIN_LINES,
): string[] {
  if (words.length === 0) return [];
  const copies = Math.ceil(minLines / words.length);
  return Array.from({ length: copies }, () => words).flat().map(shorten);
}

/**
 * Drops a parenthetical qualifier for display in the marquee.
 *
 * "Vitamin A (as beta-carotene)" is the right label for a nutrition table,
 * where the form the nutrient takes matters. On the card it is 28 characters
 * of `nowrap` display type in a 308px tile, so it rendered as
 * "'ITAMIN A (AS BETA-CAR" — clipped mid-word at both ends, which reads as a
 * bug rather than as the reference's deliberate overflow. The qualifier is
 * the part that can go: "Vitamin A" is still true and still the same nutrient.
 *
 * Display only. The content file is untouched and the detail page prints the
 * label in full.
 */
export function shorten(label: string): string {
  const [head] = label.split("(");
  return head.trim() || label;
}

/** Pixels per second the type should travel. The variety tile's own speed,
 *  measured in the browser — a 389px half over 8s — and the figure every other
 *  card is matched to. See `.mcard__marquee-inner`. */
export const MARQUEE_SPEED_PX_PER_S = 48;

export function Marquee({
  words,
  toneClass,
  sizeClass = "text-[clamp(1rem,1.9vw,1.6rem)]",
  minLines = DEFAULT_MIN_LINES,
  durationSeconds,
}: {
  /**
   * A variety's nutrient **labels**, a seed's or a tray's spec labels. Never
   * their values, and the reason is regulatory as well as typographic.
   *
   * "Vitamin C" is a statement of what is in the green; "High — well above the
   * mature head" is a nutrient content claim, which under India's Food Safety
   * and Standards (Advertising and Claims) Regulations 2018 has to be
   * substantiated by analysis. The values belong on the detail page next to
   * the note that qualifies them, not in 28px display type on a card. They
   * also do not fit.
   */
  words: string[];
  /** The text colour, which belongs to the panel it scrolls on — `PANELS`
   *  here, `CATEGORY_PANELS.marqueeClass` on a category grid. */
  toneClass: string;
  /**
   * Default is sized for up to eight labels in a square tile. Smaller than the
   * name marquee on a tile with no photography at all, because these are up to
   * eight words rather than one and a Kannada nutrient label runs two to three
   * times the length of its English counterpart. `nowrap` still lets the
   * longest ones run past the card edge, which is the reference's look — but at
   * this size most of them land inside it.
   */
  sizeClass?: string;
  /**
   * How many lines one half of the block must hold — the only thing standing
   * between this and a visible seam, so it is worth deriving rather than
   * guessing:
   *
   * ```
   * minLines >= panelAspect / (0.95 * fontFraction)
   * ```
   *
   * `panelAspect` is the panel's height over its width and `fontFraction` is
   * the type size as a fraction of the panel's width; 0.95 is the
   * `line-height` on `.mcard__marquee-line`. Add ~20% headroom on top, because
   * a line box is not exactly its font size.
   *
   * The default suits a **square** panel with type at ~8% of its width, which
   * is what a variety tile is. It is wrong for anything taller: a 4:5 rack card
   * at 5% needs 26, and ten gave 0.38 of a panel height — measured, not
   * theorised.
   *
   * This is why `sizeClass` should be in `cqw` on any non-square panel. In `vw`
   * the ratio changes with the viewport and no single number is correct.
   */
  minLines?: number;
  /**
   * How long one loop takes. Omit it on a square tile at the default line
   * count — the CSS already holds 8s, which is right for that case.
   *
   * Set it whenever `minLines` or `sizeClass` changes, because those decide how
   * tall the block is and therefore how fast a fixed duration scrolls it:
   *
   * ```
   * durationSeconds = minLines * 0.95 * fontFraction * panelWidthPx / 48
   * ```
   *
   * 48px/s is `MARQUEE_SPEED_PX_PER_S`. A `cqw` type size makes the panel width
   * cancel out of the ratio, so one number is correct at every viewport —
   * which is the other reason non-square panels should use `cqw`.
   */
  durationSeconds?: number;
}) {
  const lines = marqueeLines(words, minLines);
  if (lines.length === 0) return null;

  return (
    <div className={`mcard__marquee ${toneClass}`} aria-hidden="true">
      <div
        className="mcard__marquee-inner"
        style={
          durationSeconds === undefined
            ? undefined
            : ({ "--mcard-marquee-duration": `${durationSeconds}s` } as CSSProperties)
        }
      >
        {/* Rendered twice for the -50% keyframe — see `marqueeLines`. */}
        {[0, 1].map((copy) => (
          <div key={copy}>
            {lines.map((word, i) => (
              <span key={`${copy}-${i}`} className={`mcard__marquee-line ${sizeClass}`}>
                {word}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
