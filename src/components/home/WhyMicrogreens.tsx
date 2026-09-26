import { BadgeCheck, Check, TriangleAlert } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Why microgreens — the case for the category itself, before the plans ask
 * anyone to subscribe to it (the owner, 26 Sep 2026). A head-to-head: one
 * row per topic, the grown-up greens' problem on the left and the
 * microgreen's answer on the right (a warning against a tick), each column under its own drawing.
 *
 * The grow time on the microgreen side is **read from the varieties on
 * sale**, never written into copy: `growDays` is tuned in admin, and a number
 * here would go stale the first time it was retuned — the same rule the
 * storybook and the variety text follow.
 *
 * No nutrient claim of our own — "40× the nutrients" is the line every
 * microgreens site uses, and a nutrient content claim needs analysis behind
 * it under the FSS (Advertising and Claims) Regulations 2018. The nutrition
 * row is a published study's finding, credited to it in the copy (no link
 * shown): Xiao et al., J. Agric. Food Chem. 2012, doi:10.1021/jf300459b. Do
 * not reword it into a claim about our own greens ("more vitamins than…").
 * "Healthy" is kept out for the same reason — it is a health claim.
 */
/* Grow time and sprays are one row, not two (the owner, 26 Sep 2026): the
   short time indoors is the reason no spray is needed, so they are one
   argument. Freshness, washing and how much you need share `plate` for the
   same reason — they are one trip, from where it grew to the plate. */
/* `soil` third, after nutrition (the owner, 26 Sep 2026). It
   is about the medium only, and deliberately not water: a customer cannot
   see our water source any more than a farm's, so "you never know which"
   cut both ways. Reused soil against fresh coco peat is a difference they
   can take our word on and we can show. No named contaminant either — that
   is a claim about other growers that needs a source behind it. */
const ROWS = ["time", "nutrition", "soil", "plate"] as const;

export type GrowDayRange = { min: number; max: number } | null;

/* Full container width at `lg`, with each drawing beside its column's name
 * rather than above it: stacked, the header alone was taller than the six
 * rows, and narrow columns wrapped every line to two (the owner, 26 Sep
 * 2026 — "taken more vertical space").
 *
 * One grid serves both widths, so a row's two sides are always one row:
 *
 *   phone    [ topic ········· ]      desktop  [ them ][topic][ us ]
 *            [ them ][ us ]
 *
 * DOM order is topic → them → us, which is also the screen-reader order. At
 * `lg` the topic moves to the middle column and `grid-flow-dense` backfills
 * "them" into the first column of the same row. The row gap drops to 0 there
 * so each side's cells join into one continuous card, rounded only at its
 * top and bottom. */
const THEM = "bg-sand text-stone rounded-2xl p-4 lg:col-start-1 lg:rounded-none lg:px-8 lg:py-3.5";
const US = "bg-forest text-cream rounded-2xl p-4 lg:col-start-3 lg:rounded-none lg:px-8 lg:py-3.5";

export async function WhyMicrogreens({ growDays }: { growDays: GrowDayRange }) {
  const t = await getTranslations("home.why");

  const usTime =
    growDays === null
      ? t("rows.time.usNone")
      : growDays.min === growDays.max
        ? t("rows.time.usSingle", { days: growDays.min })
        : t("rows.time.usRange", growDays);

  const themName = t("them.name");
  const usName = t("us.name");

  return (
    /* Almost no top padding: it follows "Our process" on the same cream
       ground, whose own bottom padding is already the section break — two
       `py-20`s stacked read as an empty band (the owner, 26 Sep 2026). */
    <section className="mx-auto max-w-[1400px] px-6 pb-14 pt-2 md:px-12 md:pb-20 md:pt-4">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="font-display text-[clamp(1.6rem,3.1vw,2.5rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h2>
        <p className="mt-3 font-body text-base leading-relaxed text-stone">{t("lede")}</p>
      </div>

      <Reveal>
        <div className="mx-auto mt-10 grid grid-cols-2 gap-x-2 gap-y-2 lg:mt-10 lg:grid-flow-dense lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-0 lg:gap-y-0">
          {/* Header row. The "vs" medallion exists only where there is a
              middle column for it. */}
          <div className="hidden items-center justify-center px-5 lg:col-start-2 lg:flex">
            <span className="reveal-pop grid size-14 place-items-center rounded-full bg-forest font-display text-sm font-bold text-cream">
              {t("vs")}
            </span>
          </div>
          <div className={`${THEM} lg:flex lg:items-center lg:gap-6 lg:rounded-t-3xl lg:pt-6`}>
            <FieldPanel label={t("them.alt")} />
            <h3 className="mt-4 text-center font-display text-base font-bold text-forest lg:mt-0 lg:text-left lg:text-2xl">
              {themName}
            </h3>
          </div>
          <div className={`${US} lg:flex lg:items-center lg:gap-6 lg:rounded-t-3xl lg:pt-6`}>
            <TrayPanel label={t("us.alt")} />
            <div className="text-center lg:text-left">
              <h3 className="mt-4 text-center font-display text-base font-bold text-cream lg:mt-0 lg:text-left lg:text-2xl">
                {usName}
              </h3>
              {/* "Honestly grown", not "clean": a promise the four rows under it
                back up, where "clean" reads as a purity claim someone could
                test (the owner, 26 Sep 2026). Cream on forest — the grow-media
                `RecommendedBadge` inverted for this ground. */}
              <span className="mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-cream px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-normal text-forest sm:px-3 sm:text-[11px] sm:tracking-wider">
                <BadgeCheck size={14} strokeWidth={2} aria-hidden="true" className="hidden sm:block" />
                {t("us.badge")}
              </span>
            </div>
          </div>

          {ROWS.map((key, i) => {
            const last = i === ROWS.length - 1;
            const stagger = { "--i": 0.5 + i * 0.4 } as CSSProperties;
            return [
              <div
                key={`${key}-topic`}
                className="col-span-2 mt-4 text-center lg:col-span-1 lg:col-start-2 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-5"
              >
                <span
                  className="reveal-rise inline-block font-body text-xs font-semibold uppercase tracking-[0.14em] text-forest"
                  style={stagger}
                >
                  {t(`rows.${key}.topic`)}
                </span>
              </div>,
              <div
                key={`${key}-them`}
                className={`${THEM} lg:border-t lg:border-forest/10 ${last ? "lg:rounded-b-3xl lg:pb-6" : ""}`}
              >
                <p
                  className="reveal-rise flex flex-col gap-2 font-body text-sm sm:flex-row sm:gap-2.5 leading-snug"
                  style={stagger}
                >
                  {/* A warning, not a cross (the owner, 26 Sep 2026): the left column
                      is what to watch out for, not a list of wrong answers. */}
                  <TriangleAlert className="mt-px size-4 shrink-0 text-terracotta" strokeWidth={2} aria-hidden="true" />
                  <span>
                    <span className="sr-only">{themName}: </span>
                    {t(`rows.${key}.them`)}
                  </span>
                </p>
              </div>,
              <div
                key={`${key}-us`}
                className={`${US} lg:border-t lg:border-cream/10 ${last ? "lg:rounded-b-3xl lg:pb-6" : ""}`}
              >
                <p
                  className="reveal-rise flex flex-col gap-2 font-body text-sm sm:flex-row sm:gap-2.5 font-medium leading-snug"
                  style={stagger}
                >
                  {/* On a forest ground, so forest-deep: the house rule for an
                      icon in a circle. */}
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-forest-deep text-cream">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="sr-only">{usName}: </span>
                    {key === "time" ? usTime : t(`rows.${key}.us`)}
                  </span>
                </p>
              </div>,
            ];
          })}
        </div>
      </Reveal>
    </section>
  );
}

/* ── The drawings ─────────────────────────────────────────────────────────
   Drawn, not generated, one per column: no words inside (every word is a
   message, and a painted-in label cannot be translated — the storybook's
   known problem #1). Colours are the theme tokens, so a palette change
   reaches the drawings too. */

const PW = 348;
const PH = 280;

function Panel({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${PW} ${PH}`}
      role="img"
      aria-label={label}
      className="mx-auto h-auto w-full max-w-[340px] lg:mx-0 lg:w-[220px] lg:shrink-0"
    >
      <defs>
        <clipPath id={id}>
          <rect width={PW} height={PH} rx={22} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </svg>
  );
}

/** A full-grown leafy plant: broad leaves fanned out from one base. */
function MaturePlant({ x, base, scale = 1, delay }: { x: number; base: number; scale?: number; delay: string }) {
  const leaves = [-62, -34, -10, 14, 38, 64];
  /* The shiver goes on an inner group: a CSS `transform` on the outer one
     would replace its `translate`/`scale` attribute rather than add to it. */
  return (
    <g transform={`translate(${x} ${base}) scale(${scale})`}>
      <g className="why-shiver" style={{ animationDelay: delay }}>
        {leaves.map((a, i) => (
          <ellipse
            key={a}
            cx={0}
            cy={-58}
            rx={21}
            ry={62}
            transform={`rotate(${a})`}
            fill={i % 2 === 0 ? "var(--color-forest)" : "#2f6b3f"}
          />
        ))}
        {/* Midribs, so the shapes read as leaves rather than petals. */}
        {leaves.map((a) => (
          <line
            key={`rib-${a}`}
            x1={0}
            y1={-6}
            x2={0}
            y2={-108}
            transform={`rotate(${a})`}
            stroke="var(--color-sage)"
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </g>
    </g>
  );
}

/** An open field: sun, soil, full-grown plants, and a sprayer misting them.
 *  The mist is terracotta, the palette's warning colour. */
function FieldPanel({ label }: { label: string }) {
  const soil = 214;
  return (
    <Panel id="why-field" label={label}>
      <rect width={PW} height={PH} fill="var(--color-cream)" fillOpacity={0.6} />
      <circle cx={290} cy={48} r={24} fill="var(--color-tan)" />
      <rect y={soil} width={PW} height={PH - soil} fill="var(--color-bark)" />
      {[236, 258].map((y) => (
        <line key={y} x1={0} y1={y} x2={PW} y2={y} stroke="var(--color-tan)" strokeOpacity={0.35} strokeWidth={3} />
      ))}
      <MaturePlant x={70} base={soil + 6} scale={0.8} delay="0s" />
      <MaturePlant x={176} base={soil + 6} scale={0.95} delay="0.3s" />
      <MaturePlant x={284} base={soil + 6} scale={0.78} delay="0.6s" />

      {/* The sprayer sweeps from its handle, and the mist and droplets go
          with it; each droplet streams out of the nozzle on its own delay. */}
      <g className="why-lance">
        <line x1={-10} y1={34} x2={84} y2={70} stroke="var(--color-stone)" strokeWidth={6} strokeLinecap="round" />
        <rect x={78} y={62} width={20} height={13} rx={3} transform="rotate(22 88 68)" fill="var(--color-ink)" />
        <path
          className="why-mist"
          d="M 98 76 L 232 104 L 178 162 Z"
          fill="var(--color-terracotta)"
          fillOpacity={0.12}
        />
        {[
          [116, 86],
          [138, 96],
          [160, 90],
          [134, 114],
          [164, 114],
          [188, 104],
          [156, 136],
          [184, 130],
          [210, 116],
          [200, 146],
          [222, 132],
          [176, 152],
        ].map(([cx, cy], i) => (
          <circle
            key={`${cx}-${cy}`}
            className="why-drop"
            style={{ animationDelay: `${-(i * 0.09)}s` }}
            cx={cx}
            cy={cy}
            r={3}
            fill="var(--color-terracotta)"
            fillOpacity={0.7}
          />
        ))}
      </g>
      {/* Residue left on the leaves. */}
      {[
        [158, 172],
        [196, 160],
        [206, 190],
        [80, 180],
        [282, 178],
      ].map(([cx, cy]) => (
        <circle key={`r-${cx}-${cy}`} cx={cx} cy={cy} r={3.6} fill="var(--color-terracotta)" fillOpacity={0.55} />
      ))}
    </Panel>
  );
}

/** One microgreen: a thin stem and its two seed leaves. Heights and lean are
 *  derived from the index so the server and client render the same tray. */
function Sprout({ i, x, base }: { i: number; x: number; base: number }) {
  const h = 46 + ((i * 37) % 23);
  const lean = ((i * 53) % 9) - 4;
  const top = base - h;
  const fill = i % 3 === 0 ? "var(--color-forest)" : "#4f8f3a";
  /* Negative delays start every sprout mid-sway, and the four durations keep
     neighbours from moving in lockstep — a breeze, not a metronome. */
  return (
    <g
      className="why-sway"
      style={{ animationDelay: `${-(i * 0.23)}s`, animationDuration: `${1.8 + (i % 4) * 0.25}s` }}
    >
      <path
        d={`M ${x} ${base} Q ${x + lean * 0.4} ${base - h / 2} ${x + lean} ${top}`}
        stroke="#7fae63"
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
      <ellipse
        cx={x + lean - 7}
        cy={top - 2}
        rx={8}
        ry={4.4}
        transform={`rotate(-24 ${x + lean - 7} ${top - 2})`}
        fill={fill}
      />
      <ellipse
        cx={x + lean + 7}
        cy={top - 2}
        rx={8}
        ry={4.4}
        transform={`rotate(24 ${x + lean + 7} ${top - 2})`}
        fill={fill}
      />
    </g>
  );
}

/** Photons as [x from the tray's left edge, delay s, fall duration s]. Listed
 *  rather than generated so the spread across the lamp is even by eye. */
const PHOTONS: readonly (readonly [number, number, number])[] = [
  [14, 0, 1.9],
  [30, 1.3, 2.2],
  [46, 0.6, 2.0],
  [62, 1.9, 2.4],
  [78, 0.3, 1.8],
  [94, 1.1, 2.1],
  [110, 2.3, 2.3],
  [126, 0.8, 1.9],
  [142, 1.6, 2.2],
  [158, 0.1, 2.0],
  [174, 2.0, 2.4],
  [190, 0.5, 1.8],
  [206, 1.4, 2.1],
  [222, 2.6, 2.3],
  [238, 0.9, 1.9],
  [254, 1.8, 2.2],
  [38, 2.8, 2.0],
  [102, 3.1, 2.3],
  [166, 2.9, 1.9],
  [230, 3.3, 2.1],
];

/** Indoors: a grow lamp, a shelf, and one tray of sprouts. */
function TrayPanel({ label }: { label: string }) {
  const left = 34;
  const right = PW - 34;
  const trayTop = 196;
  const count = 24;
  const step = (right - left - 24) / (count - 1);
  return (
    <Panel id="why-tray" label={label}>
      {/* Opaque base first: the panel sits on the forest card, and a
          translucent mint straight onto it reads as murky teal. */}
      <rect width={PW} height={PH} fill="var(--color-cream)" />
      <rect width={PW} height={PH} fill="var(--color-mint)" fillOpacity={0.55} />
      <line x1={left + 40} y1={0} x2={left + 40} y2={36} stroke="var(--color-stone)" strokeWidth={2} />
      <line x1={right - 40} y1={0} x2={right - 40} y2={36} stroke="var(--color-stone)" strokeWidth={2} />
      <rect x={left} y={36} width={right - left} height={12} rx={6} fill="var(--color-forest-deep)" />
      <path
        d={`M ${left + 8} 48 L ${right - 8} 48 L ${right + 10} ${trayTop - 64} L ${left - 10} ${trayTop - 64} Z`}
        fill="var(--color-cream)"
        fillOpacity={0.55}
      />
      {/* Light falling from the lamp onto the leaves: minute specks, no halo
          (the owner, 26 Sep 2026), each on its own delay and speed so they never fall in a row.
          Drawn before the sprouts, so a photon lands behind the leaf it hits. */}
      {PHOTONS.map(([dx, delay, dur], i) => (
        <g key={i} className="why-photon" style={{ animationDelay: `${delay}s`, animationDuration: `${dur}s` }}>
          <circle cx={left + dx} cy={56} r={1.1} fill="#eab308" />
        </g>
      ))}
      {/* Medium, then the sprouts in it, then the tray's lip over the roots. */}
      <rect x={left + 6} y={trayTop - 10} width={right - left - 12} height={16} rx={4} fill="var(--color-bark)" />
      {Array.from({ length: count }, (_, i) => (
        <Sprout key={i} i={i} x={left + 12 + i * step} base={trayTop - 4} />
      ))}
      <rect x={left} y={trayTop} width={right - left} height={30} rx={6} fill="var(--color-forest-deep)" />
      <rect
        x={left + 10}
        y={trayTop + 11}
        width={right - left - 20}
        height={3}
        rx={1.5}
        fill="var(--color-cream)"
        fillOpacity={0.18}
      />
      <rect y={trayTop + 30} width={PW} height={10} fill="var(--color-tan)" />
      <rect y={trayTop + 40} width={PW} height={PH - trayTop - 40} fill="var(--color-sand)" />
    </Panel>
  );
}
