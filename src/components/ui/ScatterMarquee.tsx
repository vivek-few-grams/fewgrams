import type { CSSProperties } from "react";
import { shorten } from "./Marquee";

/**
 * The word-cloud variant of the §17.4 marquee — same panel, same `.mcard`
 * hover, same "one half must overflow the panel" loop trick as `Marquee`,
 * but the words are scattered at random sizes across the full width instead
 * of stacked as one centred word per row.
 *
 * Written 20 Sep 2026 because the tidy single-column marquee read as too
 * even — "I feel it looks even more better when we have random sized text
 * covered on the entire container." The owner's explicit ask was a component
 * that does this on its own, with **no per-word or per-tile size tuning** —
 * so unlike `Marquee`, nothing here is measured against a call site's panel
 * aspect. It leans on volume instead of arithmetic: repeat the word list
 * until there are `minTokens` of them, and let `flex-wrap` fill the rest.
 * That is deliberately generous rather than exact, because there is no
 * closed form for "how tall is a wrapped paragraph of random-sized words" —
 * see `SCATTER_MIN_TOKENS`.
 *
 * Only wired into `Tile.tsx` (`/microgreens`, `/seeds`) for now. `MarqueeCard`
 * and the tray/rack cards keep the exact, tested `Marquee` — they were not
 * part of the ask, and their loop invariant is pinned in `marquee.test.ts`
 * against a layout model (uniform lines) this component does not use.
 */

/** cqw sizes a word is drawn from — capped deliberately low. A first pass
 *  went up to 17cqw and "HARVEST WINDOW" ran clean past the panel edge; the
 *  owner's fix was not "clip it neatly" but "don't offer that size at all."
 *  Kept small enough that the *longest* label in any caller's list still
 *  fits inside `MAX_WORD_WIDTH_FRACTION` at the top of this range — see
 *  `sizeFor`, which is the actual guarantee. This palette is what makes that
 *  guarantee bite rarely rather than on every second word. */
const SCATTER_SIZES = ["4.5cqw", "5.5cqw", "6.5cqw", "8cqw"] as const;

/** No word may span more than this fraction of the panel's own width, however
 *  the dice land — the hard containment rule `sizeFor` enforces. Leaves room
 *  inside `.mcard__marquee-scatter`'s own 3cqw side padding. */
const MAX_WORD_WIDTH_FRACTION = 0.86;

/** Average glyph width as a fraction of font size, for this bold uppercase
 *  display face. Deliberately generous (real text is narrower on average) so
 *  the estimate errs toward shrinking a word rather than letting one overflow
 *  — `overflow-wrap` on `.mcard__marquee-scatter-word` is the backstop if it
 *  is ever wrong regardless. */
const AVG_GLYPH_WIDTH_EM = 0.64;

/** The size a word is actually drawn at: a random pick from `SCATTER_SIZES`,
 *  capped so its estimated rendered width can never exceed
 *  `MAX_WORD_WIDTH_FRACTION` of the panel. Long labels are pulled down
 *  automatically; nothing here is a per-word or per-caller exception — the
 *  cap is one formula applied identically to every token. */
function sizeFor(word: string, base: number): number {
  const maxCqw = (MAX_WORD_WIDTH_FRACTION * 100) / (Math.max(word.length, 1) * AVG_GLYPH_WIDTH_EM);
  return Math.min(base, maxCqw);
}

/**
 * Tokens per copy, before the two-copy doubling `ScatterMarquee` always does
 * for the loop. Chosen empirically against a square tile: at the smaller
 * `SCATTER_SIZES` above, this many tokens reliably wrap to several multiples
 * of the panel's height, which is the only thing that matters — extra
 * wrapped rows below the fold cost nothing since the block is `absolute` and
 * clipped.
 *
 * Kept constant regardless of the caller's word count (4 nutrient labels or
 * 8) by repeating in whole copies, same reasoning as `marqueeLines`: a
 * partial copy would put the first few words back to back at the seam.
 */
export const SCATTER_MIN_TOKENS = 64;

/** A small, seeded hash — not `Math.random()`, which would pick a new size
 *  on every render and on the server vs. the client, producing a hydration
 *  mismatch. Seeding on the word and its position makes the layout stable
 *  for a given word list without the caller ever assigning a size. */
function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type ScatterToken = { key: string; word: string; size: string };

export function scatterTokens(
  words: string[],
  minTokens: number = SCATTER_MIN_TOKENS,
): ScatterToken[] {
  if (words.length === 0) return [];
  const copies = Math.ceil(minTokens / words.length);
  const tokens: ScatterToken[] = [];
  for (let copy = 0; copy < copies; copy++) {
    words.forEach((word, i) => {
      const key = `${copy}-${i}-${word}`;
      const label = shorten(word);
      const base = parseFloat(SCATTER_SIZES[hash(key) % SCATTER_SIZES.length]);
      tokens.push({
        key,
        word: label,
        size: `${sizeFor(label, base).toFixed(2)}cqw`,
      });
    });
  }
  return tokens;
}

/** Slow by default — "Text should scroll bit slow" was the owner's exact
 *  complaint about a *fixed*-duration marquee once already (see
 *  `Marquee`'s `durationSeconds` note), and a wrapped word-cloud block runs
 *  taller than a column of the same words, so the same duration would read
 *  faster here, not slower. There is no panel-independent formula for the
 *  right number the way `Marquee` derives one — see the file note — so this
 *  is a deliberately calm constant, tunable per caller via `durationSeconds`. */
export const SCATTER_DEFAULT_DURATION_S = 60;

export function ScatterMarquee({
  words,
  toneClass,
  minTokens = SCATTER_MIN_TOKENS,
  durationSeconds = SCATTER_DEFAULT_DURATION_S,
  animated = true,
}: {
  /** Same words a plain `Marquee` would take — nutrient or spec **labels**,
   *  never values. See `Marquee`'s prop note for why. */
  words: string[];
  /** The text colour — belongs to the panel it scrolls on, exactly as in
   *  `Marquee`. */
  toneClass: string;
  minTokens?: number;
  durationSeconds?: number;
  /**
   * `false` freezes the word cloud: no scroll loop, and one copy of the
   * words rather than the two the loop needs to hide its seam.
   *
   * Added 20 Sep 2026 for the seeds and trays tiles on `/shop`, once both
   * carried a photograph large enough to sit over most of the panel —
   * scrolling type behind a photo that already fills the frame read as
   * motion for its own sake rather than as the loop's actual job, which is
   * covering the gap around a *small* punnet or rack. Microgreens and racks
   * keep the loop; their media leaves more panel showing.
   */
  animated?: boolean;
}) {
  const tokens = scatterTokens(words, minTokens);
  if (tokens.length === 0) return null;

  const cloud = (copy: number) => (
    <div key={copy} className="mcard__marquee-scatter">
      {tokens.map((t) => (
        <span
          key={`${copy}-${t.key}`}
          className="mcard__marquee-scatter-word"
          style={{ fontSize: t.size }}
        >
          {t.word}
        </span>
      ))}
    </div>
  );

  return (
    <div className={`mcard__marquee ${toneClass}`} aria-hidden="true">
      {animated ? (
        <div
          className="mcard__marquee-inner"
          style={{ "--mcard-marquee-duration": `${durationSeconds}s` } as CSSProperties}
        >
          {/* Rendered twice for the -50% keyframe, same reason as `Marquee`:
              one copy has to be a taller-than-the-panel wrapped block on its
              own, and the two copies have to be identical or the seam shows a
              jump in the words rather than a jump in position. */}
          {[0, 1].map(cloud)}
        </div>
      ) : (
        cloud(0)
      )}
    </div>
  );
}
