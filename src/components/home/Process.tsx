import { PackageCheck, RefreshCw, Sprout, SprayCan, Truck, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Our process — SPEC §18.3 section 3. The core differentiator and the answer
 * to "is this safe to eat", so it sits immediately below the hero and above
 * any pricing.
 *
 * One row, deliberately. Six steps read as a checklist and wrapped to two
 * rows, which broke the left-to-right flow that makes a numbered sequence
 * legible in the first place — and cost twice the vertical space for the same
 * ideas. The hygiene claims that earned their place (sterilised trays,
 * never-reused medium) survive as the second step; what they lost was a
 * heading each, not a word of substance.
 *
 * The fifth step is the cycle, not a fifth thing we do: without it the
 * connector ran out at "delivered" and left the row's last quarter looking
 * unfinished, when the actual point of the operation is that all four steps
 * happen again from scratch next week. A `RefreshCw` marker says that in one
 * glyph, and it is the claim a subscriber most needs to believe.
 *
 * Two or three lines of body copy each is the budget. The section earns trust
 * by being scannable — five short claims a visitor takes in at a glance beat
 * three paragraphs nobody finishes.
 */
/** Declared rather than inferred so `marker` is optional on every step
 *  instead of absent from the four that omit it — the inferred union would
 *  have no common member to read. */
type Step = { key: string; icon: LucideIcon; marker?: boolean };

const steps: readonly Step[] = [
  { key: "seed", icon: PackageCheck },
  { key: "trays", icon: SprayCan },
  { key: "sown", icon: Sprout },
  { key: "harvest", icon: Truck },
  /* No body copy, so no `steps.again.body` key exists in either locale. The
     marker and four words are the whole message: the four steps above already
     said what happens, and this one only has to say that they happen again. A
     paragraph here would restate them and undo the point of the short row. */
  { key: "again", icon: RefreshCw, marker: true },
];

/**
 * The hairline joining one step to the next, so the four read as a sequence
 * rather than four unrelated badges.
 *
 * Which item ends a row depends on the column count, so the classes are chosen
 * per index against the grid below (1 / 2 / 5 columns) rather than by a CSS
 * selector: `nth-child` on the connector would match the connector, not its
 * `li`, and Tailwind cannot express "last in the current row". `lg:*` is
 * emitted after `sm:*`, so the wider rule wins where both apply.
 *
 * The last step is hidden at every width and returns early — with five steps
 * in two columns it is alone on the third row, where the row-parity rule would
 * have drawn it a line into open space.
 *
 * Absent on a phone too: at one column the steps stack, and a horizontal line
 * pointing into empty space beside the next heading would be noise.
 */
function connectorClass(index: number) {
  if (index === steps.length - 1) return "";
  return `${index % 2 === 0 ? "sm:block" : "sm:hidden"} lg:block`;
}

export async function Process() {
  const t = await getTranslations("home.process");

  /* 80px of padding at `md`, not 112. One rhythm for every band on the page —
     this section, `OtherProducts` and `TrustTags` all sit on `md:py-20` —
     because the gaps were both too large and unequal: 112px above this heading,
     112px above "Weekly plans", 128px above "Everything else". A section break
     only has to be unambiguous, and at 80px it still is, while the heading no
     longer floats in a band of its own. */
  return (
    <section className="mx-auto max-w-[1400px] px-6 py-14 md:px-12 md:py-20">
      {/* One line, with the aside sharing it — `items-baseline` rather than
          `items-end`, so the small text sits on the heading's baseline instead
          of on the bottom of its descender box.

          The row starts at `lg`, not `md`: the heading and the aside together
          need roughly 900px at their `md` sizes, which is more than a 768px
          viewport has after padding, so at `md` they would wrap and the aside
          would land under the heading's right edge looking like an orphan.
          Below `lg` they stack deliberately instead. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
        <h2 className="font-display text-[clamp(1.6rem,3.1vw,2.5rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h2>
        <p className="shrink-0 font-display text-lg font-semibold text-forest lg:text-xl">
          {t("aside")}
        </p>
      </div>

      <Reveal>
        {/* Four equal columns plus an `auto` one for the loop marker, rather
            than five equal ones. Five equal columns gave the marker a full
            column it did not need — its label is half the width of a body
            paragraph — so it sat at four-fifths of the row with dead space to
            its right and the sequence looked like it stopped early. Sized to
            its content it lands flush against the right edge, and the fourth
            connector stretches across what used to be that dead space to
            reach it. The four content columns get the width back, which is
            what pays for the wider `gap-x-10` gutters. */}
        <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:gap-x-14">
          {steps.map((s, i) => (
            /* The marker's copy is kept to a word and a phrase, and the two
               ends of the row stay inset by the same amount because of it.

               Its `auto` track sizes to the widest thing in it at
               max-content — the two-word phrase — so that phrase's right edge
               IS the track's right edge, which is the row's right edge, the
               same distance from the viewport as step 01's circle is on the
               left. Nothing is capped, and nothing may be: a cap sizes the
               track to itself rather than to where the text wrapped, and the
               surplus becomes dead space at the right end that reads as a
               lopsided row. Keep both strings short and unwrapped for the same
               reason — a phrase long enough to wrap claims a content column's
               width and breaks the symmetry with it. */
            <li key={s.key} className="relative" style={{ "--i": i } as CSSProperties}>
              {/* The negative right offset has to track the gutter at every
                  breakpoint — `-right-10` for `gap-x-10`, `-right-14` for the
                  `xl:gap-x-14` — or the line stops short of the next circle by
                  exactly the difference. */}
              <span
                aria-hidden="true"
                className={`reveal-draw absolute left-[5.25rem] -right-10 top-[22px] hidden h-px bg-sage xl:-right-14 ${connectorClass(i)}`}
              />
              <div className="relative flex items-center gap-3">
                <span className="reveal-pop grid size-11 shrink-0 place-items-center rounded-full bg-forest text-cream">
                  <s.icon size={20} strokeWidth={1.5} />
                </span>
                {/* No number on the loop marker: it is not a fifth thing we
                    do, it is the four above happening again, and numbering it
                    invited the reader to look for a fifth step. */}
                {!s.marker && (
                  <span className="reveal-rise font-body text-xs tabular-nums text-stone">
                    0{i + 1}
                  </span>
                )}
              </div>
              {/* `min-h` of two lines: at five columns some titles wrap and
                  some do not, and without a floor the bodies start at
                  different heights across the row. */}
              <h3
                className="reveal-rise mt-5 font-display text-base font-semibold leading-snug text-forest lg:min-h-[2.75rem] xl:text-lg"
                style={{ "--d": "60ms" } as CSSProperties}
              >
                {t(`steps.${s.key}.title`)}
              </h3>
              <p
                className="reveal-rise mt-2 font-body text-sm leading-relaxed text-stone"
                style={{ "--d": "140ms" } as CSSProperties}
              >
                {t(`steps.${s.key}.body`)}
              </p>

              {/* A second line the marker alone carries — `steps.*.note` exists
                  for this one step in both locales. Its own element rather than
                  a longer `body`, because the break has to be guaranteed: a
                  single string would wrap wherever the track happened to end,
                  and the track is sized by the longest line, so the two feed
                  back into each other. Same size and colour as the body, so it
                  reads as its second line and not as a footnote. */}
              {s.marker && (
                <p
                  className="reveal-rise font-body text-sm leading-relaxed text-stone"
                  style={{ "--d": "200ms" } as CSSProperties}
                >
                  {t(`steps.${s.key}.note`)}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
