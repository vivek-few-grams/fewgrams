import { ArrowLeft, Info, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Sprout } from "@/components/ui/Sprout";
import { Gallery, type Shot } from "./Gallery";

/**
 * The catalogue detail page — one layout, used by every individually
 * described thing Fewgrams sells (SPEC §18.10, §22.5).
 *
 * ## Why it is shared
 *
 * It was `/microgreens/[key]` alone until the owner asked for seeds:
 * *"each seed will have its own description like microgreens. We can reuse the
 * entire template of microgreen details page to show the seeds information."*
 *
 * Reuse could have meant copying 400 lines of JSX into a second page. It
 * would have worked for a week: the two pages then drift, and the fix to the
 * one that gets attention never reaches the other. The layout decisions here
 * were each made against a real complaint — the tasting note moved out of the
 * buy column to fill the hole beside it, the benefits column gained a header
 * to line its first line up with the table's first row, the price moved into
 * the buy box because two copies of one number on one screen is where they
 * start disagreeing — and none of that is worth discovering twice.
 *
 * ## What is a prop, and what is not
 *
 * A **slot** for anything with its own behaviour: the buy box is a client
 * component with a stepper and a server action, and this file knows only that
 * it goes under the facts.
 *
 * **Already-translated strings** for everything else. This component resolves
 * no messages: a variety's table is "What is in it" over nutrients and a
 * seed's is "What you are buying" over germination figures, and those live in
 * their own namespaces (`microgreens.json`, `seeds.json`). Passing resolved
 * labels keeps the wording where a translator can find it and keeps one
 * catalogue's copy out of the other's file.
 *
 * Every block except the gallery, the title and the facts is **optional**: a
 * seed has no flavour notes, and an item whose photography has not been shot
 * falls back to the Sprout mark rather than an empty frame.
 */

/** A headline fact under the title — two per row, with an optional sub-line. */
export type DetailFact = { label: string; value: string; note?: string };

/** A two-column table row: a variety's nutrient, a seed's spec. */
export type DetailRow = { label: string; value: string };

export type DetailFaq = { question: string; answer: string };

/** Prose with its own heading — growing tips, or how to sow a seed. */
export type DetailProse = { heading: string; body: string };

export function DetailPage({
  back,
  eyebrow,
  name,
  shortDescription,
  gallery,
  facts,
  buy,
  aside,
  description,
  table,
  list,
  cautions,
  prose,
  faq,
  footer,
}: {
  back: { href: string; label: string };
  /** A line above the title — the grow-media "Recommended by Fewgrams"
   *  badge. Optional; no other kind passes one. */
  eyebrow?: React.ReactNode;
  name: string;
  shortDescription?: string;
  gallery: {
    shots: Shot[];
    thumbLabels: string[];
    prevLabel: string;
    nextLabel: string;
  };
  facts: DetailFact[];
  /** The buy box. A slot, because it is a client component with a stepper,
   *  a server action and its own error surface. */
  buy: React.ReactNode;
  /** Sits under the gallery, filling the hole the short photo column leaves
   *  beside the much taller buy column. A variety's flavour notes. */
  aside?: DetailProse | null;
  description?: string;
  /** The left half of the two-column band: nutrition, or the seed spec. */
  table?: {
    heading: string;
    colLabel: string;
    colValue: string;
    rows: DetailRow[];
    note?: string;
  } | null;
  /** The right half: what the nutrients do, or what the seed is for. */
  list?: {
    heading: string;
    /** A column label carrying the table header's exact box, so the first
     *  item lines up with the first row rather than with the table's header. */
    columnLabel: string;
    items: string[];
    /** A variety's nutrient-function disclaimer. A seed makes no such claim,
     *  so it has none. */
    note?: string;
  } | null;
  cautions?: { heading: string; items: string[] } | null;
  prose?: DetailProse | null;
  faq?: { heading: string; items: DetailFaq[] } | null;
  footer?: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-[1400px] px-6 pb-12 pt-5 md:px-12 md:pb-16 md:pt-6">
      {/* Left-aligned with the gallery below it. `items-center` centres the
          arrow against the cap height of the label — without it the glyph sits
          on the baseline and reads as dropped. */}
      <Link
        href={back.href}
        className="inline-flex items-center gap-2 font-body text-xs uppercase tracking-widest text-stone transition-colors hover:text-forest"
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        {back.label}
      </Link>

      {/* Photograph and the headline facts, side by side from `lg` up. Below
          that the image leads, because on a phone the picture is what makes
          somebody keep scrolling.

          Explicit row/column placement from `lg` up, with the buy column
          spanning both rows: the gallery is far shorter than the title, facts
          and buy box stacked beside it, which left a screen-deep hole under the
          thumbnails. The aside moved out of that column and into the hole.

          DOM order stays gallery -> buy column -> aside, which is the right
          single-column order on a phone; the grid only re-places them at
          `lg`, so the tasting note never jumps above the price on mobile. */}
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-2 lg:gap-x-14 lg:gap-y-0">
        <div className="lg:col-start-1 lg:row-start-1">
          {gallery.shots.length > 0 ? (
            <Gallery
              shots={gallery.shots}
              thumbLabels={gallery.thumbLabels}
              prevLabel={gallery.prevLabel}
              nextLabel={gallery.nextLabel}
            />
          ) : (
            /* Same 3:2 as the Gallery's frame, so the page does not change
               shape between an item that has photographs and one that does
               not yet. */
            <div className="mcard flex aspect-[3/2] items-center justify-center overflow-hidden bg-forest">
              <div className="w-[62%]">
                <Sprout className="h-full w-full" stroke="#A8CF8E" />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          {eyebrow && <div className="mb-4">{eyebrow}</div>}
          <h1 className="font-display text-[clamp(2rem,4.6vw,3.4rem)] font-bold leading-[1.05] tracking-tight text-forest">
            {name}
          </h1>
          {shortDescription && (
            <p className="mt-4 max-w-md font-body text-base leading-relaxed text-stone">
              {shortDescription}
            </p>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-forest/15 pt-6">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="font-body text-[10px] uppercase tracking-widest text-stone">
                  {f.label}
                </dt>
                <dd className="mt-1.5 font-display text-base font-semibold leading-snug text-forest">
                  {f.value}
                  {f.note && (
                    <span className="mt-1 block font-body text-xs font-normal text-stone">
                      {f.note}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {buy}
        </div>

        {aside && (
          /* Under the gallery, filling the hole the short photo column left
             beside the much taller buy column — not stacked under the buy box,
             which is what put it there.

             `lg:pt-8` rather than a margin: on a phone the grid's own gap does
             the spacing, and a margin would double up with it.

             Left accent rather than a fill — the one filled panel on this
             screen is the buy box, and a second competing block would flatten
             the emphasis it exists to carry. */
          <div className="lg:col-start-1 lg:row-start-2 lg:pt-8">
            {/* The border lives on this inner element, not on the wrapper that
                carries `lg:pt-8`. On the wrapper it spanned the padding too, so
                the rule started a centimetre above the heading it marks. */}
            <div className="border-l-2 border-sage pl-4">
              <h2 className="font-body text-[10px] uppercase tracking-widest text-stone">
                {aside.heading}
              </h2>
              <p className="mt-1.5 font-body text-sm leading-relaxed text-ink">
                {aside.body}
              </p>
            </div>
          </div>
        )}
      </div>

      {description && (
        <div className="mt-16 max-w-3xl">
          {/* Split on blank lines so a multi-paragraph description renders as
              paragraphs rather than one wall of text. */}
          {description.split(/\n\s*\n/).map((para, i) => (
            <p
              key={i}
              className="mt-5 font-body text-[15px] leading-[1.85] text-ink first:mt-0"
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {/* The table and the list sit side by side: the table is the claim, the
          list is what it means, and separating them by a screen of scroll
          makes the reader hold the table in their head. */}
      {(table || list) && (
        <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:gap-16">
          {table && table.rows.length > 0 && (
            <section>
              <SectionHeading>{table.heading}</SectionHeading>
              <table className="mt-6 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-forest/20">
                    <th className="pb-2 font-body text-[10px] font-medium uppercase tracking-widest text-stone">
                      {table.colLabel}
                    </th>
                    <th className="pb-2 font-body text-[10px] font-medium uppercase tracking-widest text-stone">
                      {table.colValue}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.label} className="border-b border-forest/10">
                      <th
                        scope="row"
                        className="py-3 pr-4 font-body text-sm font-medium text-ink"
                      >
                        {r.label}
                      </th>
                      <td className="py-3 font-body text-sm text-stone">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {table.note && (
                <p className="mt-4 flex gap-2.5 font-body text-xs leading-relaxed text-stone">
                  <Info size={15} strokeWidth={1.75} className="mt-px shrink-0" />
                  {table.note}
                </p>
              )}
            </section>
          )}

          {list && list.items.length > 0 && (
            <section>
              <SectionHeading>{list.heading}</SectionHeading>
              {/* A column label, carrying the table header's exact box — same
                  type, same `pb-2`, same rule — so the first statement here
                  lands on the same line as the first table row rather than
                  opposite the table's header row. Matching the classes rather
                  than nudging a margin is what keeps it aligned when the type
                  scale changes; a `mt-[Npx]` would drift the moment either
                  column's font size moved. */}
              <p className="mt-6 border-b border-forest/20 pb-2 font-body text-[10px] font-medium uppercase tracking-widest text-stone">
                {list.columnLabel}
              </p>
              {/* `pt-3` matches the `py-3` on the table's first row, so the two
                  lists share a baseline and not just a starting edge. */}
              <ul className="space-y-3.5 pt-3">
                {list.items.map((b) => (
                  <li
                    key={b}
                    className="border-l-2 border-sage pl-4 font-body text-sm leading-relaxed text-ink"
                  >
                    {b}
                  </li>
                ))}
              </ul>
              {list.note && (
                <p className="mt-5 font-body text-xs leading-relaxed text-stone">
                  {list.note}
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {cautions && cautions.items.length > 0 && (
        <section className="mt-16 rounded-2xl border border-terracotta/25 bg-terracotta/[0.04] p-6 md:p-8">
          <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-terracotta">
            <TriangleAlert size={18} strokeWidth={1.75} />
            {cautions.heading}
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {cautions.items.map((c) => (
              <li key={c} className="font-body text-sm leading-relaxed text-ink">
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {prose && (
        <section className="mt-16 max-w-3xl">
          <SectionHeading>{prose.heading}</SectionHeading>
          <p className="mt-5 whitespace-pre-line font-body text-[15px] leading-[1.85] text-ink">
            {prose.body}
          </p>
        </section>
      )}

      {faq && faq.items.length > 0 && (
        <section className="mt-16 max-w-3xl">
          <SectionHeading>{faq.heading}</SectionHeading>
          {/* Native `<details>`: keyboard accessible, works without
              JavaScript, and the answers are in the HTML whether or not they
              are open, so a crawler indexes them. */}
          <div className="mt-6 border-t border-forest/15">
            {faq.items.map((item) => (
              <details
                key={item.question}
                className="group border-b border-forest/15 py-4"
              >
                <summary className="flex items-center justify-between gap-4 font-display text-[15px] font-semibold text-forest transition-colors group-hover:text-stone [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-body text-lg leading-none text-stone transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl font-body text-sm leading-[1.8] text-stone">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {footer && (
        <div className="mt-16 border-t border-forest/15 pt-8 font-body text-sm text-stone">
          {footer}
        </div>
      )}
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.3rem,2.4vw,1.8rem)] font-bold leading-tight tracking-tight text-forest">
      {children}
    </h2>
  );
}
