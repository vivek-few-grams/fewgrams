"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import { planPanels, type Plan, type PlanPanel, type PlanWeek, type Variety } from "@/lib/types";
import type { PlanText } from "@/lib/content/plans";
import {
  deliverySchedule,
  firstDeliveryDate,
  formatDeliveryDate,
} from "@/lib/delivery-date";
import Image from "next/image";
import { Sprout } from "@/components/ui/Sprout";

/**
 * Bundle cards — SPEC §18.4. Plans, their rotation weeks and every variety
 * name come from DynamoDB via the server component that renders this.
 *
 * The four-week rotation is deliberately NOT printed on the cards: three dense
 * week-by-week tables side by side is unreadable. "See the 4-week rotation"
 * expands one panel below the grid instead, which also keeps cards equal height.
 *
 * Every word on a card now arrives as `text`, resolved from
 * `content/plans/<key>.json` by the server component (SPEC §4.3). DynamoDB
 * holds no plan copy at all: `highlights` in particular used to be a plain
 * `string[]` there, so this list rendered in English on the Kannada page.
 */
export type PlanWithWeeks = { plan: Plan; weeks: PlanWeek[]; text: PlanText };

/**
 * Everything that changes with a card's ground — SPEC §17.1 / §18.4.
 *
 * ## Why a table and not a handful of ternaries
 *
 * Until 15 Sep 2026 all three cards sat on the same cream ground with a forest
 * heading and stone body text, and the only differences between them were the
 * badge colour and a 1px border. Side by side they read as one product in
 * three sizes, which was the complaint: *"all 3 bundles looks same"*.
 *
 * Giving each card its own ground fixes that for no card height at all — but a
 * ground is never one change. On `forest` the heading, the body, the ticks, the
 * price, the button and the rotation link all have to invert, and the pill has
 * to invert *twice* (a forest pill on a forest card is invisible). Nine
 * conditionals scattered down the component is how one of them gets missed;
 * one row per ground is how they stay in step.
 *
 * ## Every ratio here is measured, not assumed
 *
 * Two values that looked safe are not, and they are why this is a new table
 * rather than a reuse of the old classes:
 *
 * - **`text-stone` on `sand` is 4.20:1** — under the 4.5:1 floor for body
 *   text. It passed on cream (4.71:1), which is the only ground it had ever
 *   been used on. Both quiet cards therefore use `forest` at an alpha instead,
 *   which also reads as one family rather than two greys.
 * - **`text-forest/70` on `sage` is 3.82:1** — also under. `/80` is 4.80:1,
 *   so the sage card's body sits one step heavier than the sand card's.
 *
 * Measured against the §17.1 tokens:
 *
 * | | forest | sage | sand |
 * |---|---|---|---|
 * | heading / price | cream 12.36 | forest 7.43 | forest 11.01 |
 * | body | mint 8.91 | forest/80 4.80 | forest/75 5.49 |
 * | pill ground vs card (1.4.11, 3:1) | cream 12.36 | forest 7.43 | bark 8.28 |
 * | pill text | forest 12.36 | cream 12.36 | cream 9.29 |
 * | filled CTA label | forest 12.36 | cream 12.36 | cream 12.36 |
 */
type PanelTone = {
  /** The ground alone. Separate from `border` because the rotation modal's
   *  header band uses it and has no border of its own — that band is how the
   *  modal is tied back to the card that opened it. */
  ground: string;
  /** A border stays on every card, even where it is the ground's own colour,
   *  so the box model is identical: a card that loses 1px on each side is 2px
   *  shorter than the two beside it, which §18.4 has been bitten by twice. */
  border: string;
  heading: string;
  /** Tagline and highlight text. */
  body: string;
  /** The rotation link, rest **and** hover in one string. Two fields would
   *  invite a `hover:${…}` template, and Tailwind's scanner only sees classes
   *  that exist literally in the source — a concatenated variant is silently
   *  never generated. */
  link: string;
  /** Price, "First box", and the rotation link on hover. */
  strong: string;
  tick: string;
  /** The pill at the top of the card. Inverts against its own ground. */
  badge: string;
  /** Subscribe — filled. */
  cta: string;
  /**
   * Pick Your Own's CTA. **Filled, and warm rather than green.**
   *
   * It was an outlined forest button for several iterations, on the theory
   * that the plan you are not pushing gets the quiet control. Two things were
   * wrong with that: an outlined button beside two filled ones reads as
   * disabled rather than secondary, and a *forest* button under this card's
   * `bark` pill made the card look like it had borrowed the button from its
   * neighbours. It is the one card whose accent is not green, and the CTA is
   * where that should show.
   *
   * So: `bark` filled at rest, **green on hover** — the only CTA on the page
   * where the hover changes hue rather than shade, which suits the only plan
   * where you choose rather than accept. On a `forest` ground the warm half
   * flips to `tan`, because `bark` on `forest` is two dark colours with no
   * boundary between them (§17.1).
   */
  ctaAlt: string;
  /** The watermark, as a `text-*` class: `Sprout` strokes in `currentColor`. */
  mark: string;
};

const panels = {
  /* The recommended plan. `bark` would have been the obvious "premium dark",
     but forest is the brand's own and already carries the CTA, so the card
     reads as an enlarged version of the thing you are being asked to click. */
  forest: {
    ground: "bg-forest",
    border: "border-forest",
    heading: "text-cream",
    body: "text-mint",
    link: "text-mint hover:text-cream",
    strong: "text-cream",
    tick: "text-mint",
    badge: "border-forest bg-cream text-forest",
    /* Hover goes to `sage`, not `mint`. Both clear contrast easily — forest
       on sage is 7.43:1 — but `mint` is a cool blue-green and the button read
       as a different family from the card it sits on. `sage` is the warm green
       already used as the second card's ground, so the hover stays inside the
       set. */
    cta: "border-transparent bg-cream text-forest hover:bg-sage",
    ctaAlt: "border-transparent bg-tan text-bark hover:bg-sage hover:text-forest",
    mark: "text-mint/15",
  },
  sage: {
    ground: "bg-sage",
    border: "border-forest/15",
    heading: "text-forest",
    body: "text-forest/80",
    link: "text-forest hover:text-forest/70",
    strong: "text-forest",
    tick: "text-forest",
    badge: "border-sage bg-forest text-cream",
    cta: "border-transparent bg-forest text-cream hover:bg-forest-deep",
    ctaAlt: "border-transparent bg-bark text-cream hover:bg-forest",
    mark: "text-forest/10",
  },
  sand: {
    ground: "bg-sand",
    border: "border-forest/12",
    heading: "text-forest",
    body: "text-forest/75",
    link: "text-forest hover:text-forest/70",
    strong: "text-forest",
    tick: "text-forest",
    /* `bark` — the logo's brown — rather than a third green. This is the one
       pill not on a green ground, and `tan`, the lighter half of the same
       pair, is very nearly the ground itself. */
    badge: "border-sand bg-bark text-cream",
    cta: "border-transparent bg-forest text-cream hover:bg-forest-deep",
    /* Measured: cream on bark is 9.29:1, bark on sand is 8.28:1 for the
       button's own boundary against the card (1.4.11 wants 3:1), and the
       forest hover keeps cream at 12.36:1. */
    ctaAlt: "border-transparent bg-bark text-cream hover:bg-forest",
    mark: "text-forest/[0.09]",
  },
} as const satisfies Record<PlanPanel, PanelTone>;

/**
 * How many of the five `Sprout` stems the card's watermark draws.
 *
 * Odd counts only — the paths run centre, inner pair, outer pair, so 5, 3 and
 * 1 are symmetrical fans while 4 and 2 are missing a side. Read left to right
 * they also say something true about the plans: a full tray, a seedling, a
 * single green you picked yourself.
 */
function markStems(index: number): number {
  return Math.max(1, 5 - index * 2);
}

/** Monthly price expressed per 100 g, so a visitor can compare a plan against
 *  buying the same greens ad hoc (SPEC §18.4, §18.6). */
function pricePer100g(p: Plan): number | null {
  if (p.monthlyPrice === null || p.gramsPerBox === 0) return null;
  return Math.round((p.monthlyPrice / (p.gramsPerBox * 4)) * 100);
}

export function Bundles({
  plans,
  varieties,
  varietyNames,
  adminEmpty,
}: {
  plans: PlanWithWeeks[];
  varieties: Variety[];
  /** contentKey → display name, resolved from content files by the page. */
  varietyNames: Record<string, string>;
  /**
   * Operator copy for the empty state, or **null for everyone who is not an
   * admin** — which is how a customer's HTML ends up without it at all.
   *
   * Passed in as resolved strings rather than read here, because the root
   * layout deliberately keeps the `admin` namespace out of the client message
   * catalogue (see CLAUDE.md) and this is a client component.
   */
  adminEmpty: { title: string; body: string; cta: string } | null;
}) {
  const tp = useTranslations("plans");
  const [openRotation, setOpenRotation] = useState<string | null>(null);
  /* One ground per card. Computed here, not in the card, because the answer
     for any card depends on the ones before it — and because the modal has to
     be handed the same value so its header band matches the card that opened
     it. */
  const grounds = planPanels(plans.map(({ plan }) => plan.recommended));
  const firstDelivery = formatDeliveryDate(firstDeliveryDate());
  const schedule = deliverySchedule();
  /* Varieties carry no name in DynamoDB (SPEC §4.3) — the caller resolves it
     from content/varieties/<key>.json and hands down a plain key→name map. */
  const nameOf = (key: string) => varietyNames[key] ?? key;

  return (
    <section id="plans" className="scroll-mt-24 bg-cream">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        {/* `max-w-3xl`, not `2xl`. The intro is two sentences and at 672px it
            wrapped to two lines, which pushed every card down 22px — and the
            first thing below the fold on a 740px viewport was the Subscribe
            button, i.e. the one thing the section exists to offer. 768px fits
            it on one line. The heading above it still wraps to two, which is
            deliberate: it is display type and a 1100px line of it would be
            unreadable. */}
        <div className="max-w-3xl">
          <p className="font-body text-[11px] uppercase tracking-widest text-stone">
            {tp("eyebrow")}
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
            {tp("heading")}
          </h2>
          <p className="mt-4 font-body text-sm leading-relaxed text-stone">
            {tp("firstDelivery")}{" "}
            <strong className="font-semibold text-forest">{firstDelivery}</strong>.{" "}
            {tp("cheaperNote")}
          </p>
        </div>

        {/* Two empty states, and the difference is not cosmetic. A customer was
            being shown "Create Essential, Exotic or Build Your Own" above a
            button into /admin/plans — an instruction they cannot act on, for a
            screen they cannot open. They get the honest version plus the thing
            they *can* buy today: greens by the 100 g (SPEC §18.6). */}
        {plans.length === 0 ? (
          <div className="mt-10 rounded-[20px] border border-dashed border-forest/25 p-10 text-center">
            <p className="font-display text-lg font-semibold text-forest">
              {adminEmpty ? adminEmpty.title : tp("empty.title")}
            </p>
            <p className="mx-auto mt-2 max-w-sm font-body text-sm text-stone">
              {adminEmpty ? adminEmpty.body : tp("empty.body")}
            </p>
            <Link
              href={adminEmpty ? "/admin/plans" : "/microgreens"}
              className="mt-6 inline-block rounded-full bg-forest px-6 py-3 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
            >
              {adminEmpty ? adminEmpty.cta : tp("empty.cta")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {plans.map(({ plan, weeks, text }, index) => (
              <BundleCard
                key={plan.id}
                plan={plan}
                text={text}
                panel={grounds[index]}
                stems={markStems(index)}
                weekCount={weeks.length}
                firstDelivery={firstDelivery}
                onShowRotation={() => setOpenRotation(plan.id)}
                isRotationOpen={openRotation === plan.id}
              />
            ))}
          </div>
        )}

        {/* A modal, not a panel below the grid. The rotation is the answer to
            "what actually arrives", so it deserves the screen — and inline it
            pushed the cards you were comparing out of view. */}
        {openRotation && (
          <RotationModal
            entry={plans.find((p) => p.plan.id === openRotation)!}
            schedule={schedule}
            nameOf={nameOf}
            varieties={varieties}
            onClose={() => setOpenRotation(null)}
          />
        )}
      </div>
    </section>
  );
}

function BundleCard({
  plan,
  text,
  panel,
  stems,
  weekCount,
  firstDelivery,
  onShowRotation,
  isRotationOpen,
}: {
  plan: Plan;
  text: PlanText;
  /** Which ground this card sits on. Everything else colour-wise follows from
   *  it via the `panels` table above. */
  panel: PlanPanel;
  /** Stems in the watermark, from `markStems`. */
  stems: number;
  weekCount: number;
  firstDelivery: string;
  onShowRotation: () => void;
  isRotationOpen: boolean;
}) {
  const tp = useTranslations("plans");
  const per100 = pricePer100g(plan);
  const isByo = plan.monthlyPrice === null;
  const p = panels[panel];

  return (
    /* `isolate` is load-bearing, and pairs with the watermark's `-z-10`. It
       pins the negative layer to this card's own stacking context, where the
       paint order is: this element's background, then negative-z children,
       then in-flow content. So the mark lands above the ground and below every
       word without a single `relative` added to the content below. */
    <article
      /* `bcard` carries the hover lift and shadow — globals.css, §18.4. It is
         a CSS class rather than `hover:` utilities because the effect has to
         be `(pointer: fine)` only. */
      className={`bcard relative isolate flex flex-col rounded-[20px] border p-5 ${p.ground} ${p.border}`}
    >
      {/* A different `Sprout` per card — five stems, three, then one.
          Clipped by its own wrapper, matching the card's radius, so the mark
          can be oversized and hang off the bottom-right corner without
          reaching the page. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[20px] ${p.mark}`}
      >
        <Sprout
          className="absolute -bottom-12 -right-10 h-56 w-56"
          seed={stems}
          stems={stems}
        />
      </div>
      {/* Every plan gets a pill, and each says something different and true.
          Its **wording** is content — a claim about this plan, not UI chrome,
          so a single shared `card.recommended` key could only ever label one
          of three cards. Its **emphasis** is still DynamoDB's `recommended`.
          Label is copy, emphasis is merchandising, and the owner changes the
          second far more often.

          The fill comes from the card's own ground rather than from a separate
          cycle, because it has to: a `forest` pill on the `forest` card is
          invisible, and a `sage` pill on the `sage` card likewise. Each pill
          inverts against what it sits on — see `panels` above for why the
          outline that comes with it is load-bearing rather than decorative.

          **Top-right, not top-left or centred.** Left put it directly above
          the heading, so the pill and the plan name competed for the same
          margin and read as two stacked left-aligned labels. Centred was
          tried and reads as a tab *on* the card rather than a claim about it.
          Right leaves the heading the whole left edge to itself, and the eye
          finds the pill on the way in rather than on top of the name.

          `-top-3.5` is roughly half the pill's height, so it straddles the
          edge rather than sitting on it — 14px against a measured 31px. It has
          to move with the type size; the two are not independent. */}
      <span
        className={`absolute -top-3.5 right-5 whitespace-nowrap rounded-full border px-4 py-1.5 font-body text-[11px] font-semibold uppercase tracking-widest ${p.badge}`}
      >
        {text.badge}
      </span>

      <h3 className={`font-display text-2xl font-bold tracking-tight ${p.heading}`}>
        {text.name}
      </h3>
      <p className={`mt-1.5 font-body text-sm ${p.body}`}>{text.tagline}</p>

      {/* Boxes and box weight on **one line**, not stacked.
          Two `<dd>`s one under the other spent 20px saying two short things
          that belong together — "four boxes, this big" is one fact. The
          separator is a CSS `::before`, not a character in the string: it is a
          visual divider rather than language, so it does not belong in a
          message file and must not be translated. `flex-wrap` lets it fall
          back to two lines rather than overflow, which matters in Kannada
          where both halves are longer. */}
      <dl
        className={`mt-5 flex flex-wrap items-baseline gap-x-2 font-body text-sm ${p.strong}`}
      >
        <dd>{tp("card.weeklyBoxes", { count: weekCount > 0 ? weekCount : 4 })}</dd>
        <dd className={`before:mr-2 before:content-['·'] ${p.body}`}>
          {plan.gramsPerBox > 0
            ? tp("card.perBox", { grams: plan.gramsPerBox })
            : tp("card.gramsYouChoose")}
        </dd>
      </dl>

      {text.highlights.length > 0 && (
        <ul className="mt-5 space-y-2">
          {text.highlights.map((h) => (
            <li key={h} className={`flex gap-2.5 font-body text-sm ${p.body}`}>
              <Check
                size={16}
                strokeWidth={2}
                className={`mt-0.5 shrink-0 ${p.tick}`}
              />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      {/* `pt-6`, down from `pt-8`. This is the gap between the last highlight
          and the price, and it is the largest single piece of dead space on
          the card — the block below it is bottom-anchored, so shrinking the
          gap pulls the price and the CTA up by the full amount. */}
      <div className="mt-auto pt-6">
        {isByo ? (
          <p className={`font-display text-xl font-bold ${p.strong}`}>
            {tp("card.pricedByWeight")}
          </p>
        ) : (
          <>
            <p className={`font-display text-2xl font-bold ${p.strong}`}>
              ₹{plan.monthlyPrice!.toLocaleString("en-IN")}
              <span className={`ml-1 font-body text-sm font-normal ${p.body}`}>
                {tp("card.perMonth")}
              </span>
            </p>
            {per100 !== null && (
              <p className={`mt-0.5 font-body text-sm ${p.body}`}>
                {tp("card.per100g", { price: per100 })}
              </p>
            )}
          </>
        )}

        <p className={`mt-4 font-body text-sm ${p.strong}`}>
          {tp("card.firstBox")} <strong className="font-semibold">{firstDelivery}</strong>
        </p>

        {/* `border` on every variant, transparent on all of them now that
            none is outlined. Kept rather than dropped: a 1px border top and
            bottom made the old outlined button 2px taller than the two
            Subscribe buttons beside it, visible as a slight step in a row of
            three, and the class is what guarantees the next variant someone
            adds matches. */}
        <button
          className={`mt-5 w-full rounded-full border px-5 py-3 font-body text-sm font-semibold transition-colors ${
            isByo ? p.ctaAlt : p.cta
          }`}
        >
          {isByo ? tp("card.buildMyBundle") : tp("card.subscribe")}
        </button>

        {/* The row is **always** here, even with nothing in it.
            The footer is bottom-anchored (`mt-auto`) in cards the grid makes
            equal height, so what sits *below* a button is what decides where
            that button lands. Pick Your Own has no rotation, so its CTA hung
            20px lower than the two Subscribe buttons beside it — and so did
            its "First box" line. Reserving the row costs nothing and keeps the
            three cards readable as one row.

            **Given real weight (15 Sep 2026.)** It was `text-sm` in the muted
            body colour, which made the one link that answers "what do I
            actually get?" the quietest thing on the card. Now: the calendar
            glyph, `font-semibold`, and the heading's own colour — and the
            label says what it shows rather than naming the mechanism, because
            "4-week rotation" is our word for it, not the visitor's.

            Deliberately still a text link and still inside the 20px row. A
            bordered chip was the obvious "more prominent" and it added 14px
            below the CTA, which on a 740px viewport pushes the highlighted
            thing off screen — highlighting something into the fold. */}
        <div className="mt-3 h-5">
          {weekCount > 0 && (
            <button
              onClick={onShowRotation}
              aria-expanded={isRotationOpen}
              className={`mx-auto flex items-center gap-2 font-body text-sm font-semibold underline underline-offset-4 transition-colors ${p.link}`}
            >
              <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
              {isRotationOpen
                ? tp("card.hideRotation", { weeks: weekCount })
                : tp("card.showRotation", { weeks: weekCount })}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The rotation, as a modal with a vertical timeline.
 *
 * Two changes from the inline panel it replaced (15 Sep 2026):
 *
 * - **A dialog.** The panel opened *below* the three cards, which pushed the
 *   very things you were comparing off screen and left the page scrolled to
 *   somewhere you had not asked to be.
 * - **A vertical timeline, not four cards in a row.** Four Saturdays are a
 *   sequence, and reading a sequence left to right in equal boxes gives no
 *   sense of one thing following another. Stacked against a single line, with
 *   a dot per delivery, it reads as a month.
 *
 * Built on native `<dialog>` for the same four reasons as `ConfirmSubmit`: the
 * top layer (so no z-index fight with the sticky header), a focus trap, Escape
 * to dismiss, and a real `::backdrop`.
 */
function RotationModal({
  entry,
  schedule,
  nameOf,
  varieties,
  onClose,
}: {
  entry: PlanWithWeeks;
  schedule: Date[];
  nameOf: (key: string) => string;
  varieties: Variety[];
  onClose: () => void;
}) {
  const tp = useTranslations("plans");
  const dialog = useRef<HTMLDialogElement>(null);
  const growDaysOf = (key: string) =>
    varieties.find((v) => v.contentKey === key)?.growDays;

  /* `showModal()` cannot be an attribute — the top layer and the focus trap
     only happen through the method, so opening is an effect. */
  useEffect(() => {
    const node = dialog.current;
    if (!node?.open) node?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="rotation-heading"
      onClose={onClose}
      /* A click on the backdrop lands on the dialog itself rather than on any
         child, which is what makes this a one-line dismiss. */
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      /* `fixed inset-0 m-auto` is what centres it. A `dialog` in the top layer
         is centred by the UA's own `margin: auto`, and Tailwind's Preflight
         resets every margin to 0 — so without this it sat against the top of
         the viewport. */
      className="fixed inset-0 m-auto max-h-[85svh] w-[min(52rem,92vw)] overflow-hidden rounded-[20px] bg-cream p-0 text-forest backdrop:bg-forest/45 backdrop:backdrop-blur-sm"
    >
      {/* Top-right X, not a "Close" text link beside the heading.
          A word set in body type next to a heading reads as part of the copy,
          and it sat halfway down the panel rather than at its edge — the one
          place a dismiss is looked for.

          A direct child of the `<dialog>`, not of the scroll area, so it stays
          in the corner if the content ever scrolls.

          **It inverts against the band it sits on.** Cream on `forest` is
          12.36:1, but cream on `sage` is 1.66:1 — the circle would have all but
          vanished on the Essential card's band, leaving only the glyph to say
          a control was there. Forest-on-light is 7.43:1 over `sage` and
          11.01:1 over `sand`, so both directions clear WCAG 1.4.11's 3:1 for
          the control's own boundary and 4.5:1 for the glyph inside it.

          The word survives as the accessible name: an icon-only control with
          no name is unusable by anything that cannot see it. */}
      <button
        onClick={() => dialog.current?.close()}
        aria-label={tp("close")}
        className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-cream/90 text-forest shadow-sm transition-colors hover:bg-cream"
      >
        <X size={17} strokeWidth={2} aria-hidden="true" />
      </button>

      <div className="max-h-[85svh] overflow-y-auto">
        {/* The card's artwork, moved here. On a card it cost 260px of height
            above the price; here it is the header of a panel already the size
            of the screen.

            **Full-bleed, with no padding above or beside it.** Inset by the
            modal's own padding, its corner and the modal's corner were 24px
            apart, and the X sitting between them straddled both grounds —
            half on cream, half on the band, legible against neither. A header
            image that reaches the edges gives the corner one colour, which is
            what the button needs. */}
        {/* A photograph of the plan's own greens on the rack since 25 Sep
            2026 (the owner's picks), replacing the card's `Sprout` mark on
            its ground: all green for Essentials, the red and purple crops for
            Exotic. Pick Your Own has no rotation, so it never opens this.
            Decorative — the heading below names the plan — so `alt` is
            empty. */}
        <div className="relative aspect-[16/5] bg-sage">
          <Image
            src={`/plans/${entry.plan.contentKey}.webp`}
            alt=""
            fill
            sizes="(min-width: 57rem) 52rem, 92vw"
            className="object-cover"
          />
        </div>

        <div className="p-6 md:p-9">
          <h3
            id="rotation-heading"
            className="font-display text-xl font-bold tracking-tight text-forest"
          >
            {tp("rotationHeading", { plan: entry.text.name })}
          </h3>
          {/* The plan's own paragraph, then the rule that applies to every
              plan. Two voices, deliberately: one is copy the owner writes
              per plan, the other is how the operation works. */}
          {/* No `max-w-xl` on either paragraph. A 576px measure inside an
              832px modal left a third of the panel empty and wrapped the
              plan's description to four lines — the standard "65 characters is
              the readable measure" rule, applied to the wrong element. That
              rule is for running body text down a page; this is two short
              paragraphs of supporting copy in a dialog the reader opened
              deliberately, and four lines at 576px is worse than two at 768px.
              The timeline below already sets the panel's width. */}
          <p className="mt-2 font-body text-sm leading-relaxed text-stone">
            {entry.text.description}
          </p>
          <p className="mt-2 font-body text-sm leading-relaxed text-stone">
            {tp("rotationNote")}
          </p>

          {/* The timeline runs **across**, not down (15 Sep 2026).
              Four Saturdays in a row read as a month at a glance, which is the
              question this panel answers; stacked, the same four needed the
              modal scrolled to be compared, and the further down you went the
              more it looked like a list rather than a sequence.

              The line is the top border of each column, and the columns butt
              together — the gap between them is interior padding, so the border
              reads as one continuous rule rather than four dashes. */}
          <ol className="mt-8 grid grid-cols-2 gap-y-7 sm:grid-cols-4 sm:gap-y-0">
            {entry.weeks.map((w, i) => (
              <li
                key={w.week}
                /* `--i` drives every delay in this column — see `.rot-week`
                   and friends in globals.css. Set here rather than computed
                   into a delay string so the timing lives in one file. */
                style={{ "--i": i } as React.CSSProperties}
                className="rot-week relative border-t border-forest/20 pr-4 pt-5 sm:pr-6"
              >
                <span
                  aria-hidden="true"
                  className="rot-dot absolute -top-[5px] left-0 size-2.5 rounded-full bg-forest ring-2 ring-cream"
                />
                <p className="font-body text-[11px] uppercase tracking-widest text-stone">
                  {tp("card.week", { n: w.week })}
                </p>
                {/* Indexed by the week's own number, not by its position in the
                    array. A rotation may have a gap — an empty week is not
                    stored — and with `schedule[i]` week 4 printed the third
                    Saturday. */}
                <p className="mt-0.5 font-display text-base font-semibold text-forest">
                  {schedule[w.week - 1]
                    ? formatDeliveryDate(schedule[w.week - 1])
                    : tp("noDate")}
                </p>
                {/* No panel behind the list any more. On sand it needed one to
                    separate itself; on this ground it would just be a second
                    near-white rectangle. */}
                <ul className="mt-3 space-y-1.5">
                  {w.varietyKeys.map((key, j) => (
                    <li
                      key={key}
                      style={{ "--j": j } as React.CSSProperties}
                      className="rot-item font-body text-sm text-stone"
                    >
                      {nameOf(key)}
                      {growDaysOf(key) && (
                        <span className="ml-1.5 text-xs tabular-nums text-stone/60">
                          {growDaysOf(key)}d
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
              ))}
          </ol>
        </div>
      </div>
    </dialog>
  );
}
