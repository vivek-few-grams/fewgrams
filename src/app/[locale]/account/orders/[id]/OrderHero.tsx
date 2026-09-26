import { useId } from "react";
import { CalendarCheck, Check, Home, Package, Sprout, Truck, type LucideIcon } from "lucide-react";
import { FgMark } from "@/components/chrome/FgMark";
import { DeliveryRide } from "@/app/[locale]/checkout/DeliveryRide";

/**
 * The top of an order that has been paid — the confirmation a customer lands
 * on from the payment screen (the owner, 26 Sep 2026: "a bit boring … show we
 * are working hard to pack your order").
 *
 * A forest band with the thank-you, a scene of what is happening to the order
 * now, and a four-step tracker. **The scene follows the order, not the mood**:
 *
 * | Stage | Scene |
 * |---|---|
 * | paid, with fresh greens in it | `GrowScene` — sprouts coming up in a tray, because greens are sown to order and nothing is being packed yet |
 * | paid (no greens), being prepared, ready | `PackScene` — the box on a bench being filled, shut, taped, labelled and stamped |
 * | out for delivery | `DeliveryRide`, the checkout's road scene |
 * | delivered | `PackScene` standing still, closed and stamped |
 *
 * Every animation is CSS, under "Order confirmation" in `globals.css`. The
 * resting style of each moving part is its **finished** state, and the motion
 * is added only under `prefers-reduced-motion: no-preference` — so a visitor
 * who has asked for less motion sees a closed box or a grown tray, not the
 * first frame of an animation that never plays. The falling leaves run once,
 * and only just after payment (`celebrate`).
 *
 * The scenes carry no words and are `aria-hidden`; the tracker is the
 * accessible version of the same information.
 */
export type HeroStage = "growing" | "packing" | "ready" | "onTheWay" | "delivered";

export type HeroCopy = {
  eyebrow: string;
  heading: string;
  body: string;
  arrives: string;
  progressLabel: string;
  steps: { placed: string; prepare: string; onTheWay: string; delivered: string };
  stepDone: string;
  stepNow: string;
};

export function OrderHero({ stage, celebrate, copy }: { stage: HeroStage; celebrate: boolean; copy: HeroCopy }) {
  return (
    /* `data-side-align`: the account column is stretched to this block's
       height, so the two end level (SideColumn). */
    <section data-side-align className="relative overflow-hidden rounded-2xl bg-forest text-cream">
      {celebrate && <FallingLeaves />}

      <div className="relative grid gap-6 p-6 md:grid-cols-[1.05fr_1fr] md:items-center md:gap-8 md:p-8">
        <div>
          <p className="font-body text-[11px] uppercase tracking-widest text-sage">{copy.eyebrow}</p>
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {copy.heading}
          </h2>
          <p className="mt-3 max-w-md font-body text-sm leading-relaxed text-cream/80">{copy.body}</p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 font-body text-sm font-semibold">
            <CalendarCheck aria-hidden size={16} strokeWidth={1.75} className="text-sage" />
            {copy.arrives}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl bg-cream">
          {stage === "growing" ? (
            <GrowScene />
          ) : stage === "onTheWay" ? (
            <div className="py-6">
              <DeliveryRide />
            </div>
          ) : (
            <PackScene still={stage === "delivered"} />
          )}
        </div>
      </div>

      <Tracker stage={stage} copy={copy} />
    </section>
  );
}

/* ── Tracker ─────────────────────────────────────────────────────────── */

const STEP_ICON: Record<"placed" | "prepare" | "onTheWay" | "delivered", LucideIcon> = {
  placed: Check,
  prepare: Package,
  onTheWay: Truck,
  delivered: Home,
};

/** Which step is under way. "Ready" counts as the next step being under way:
 *  the box is closed and waiting for the courier. */
const CURRENT: Record<HeroStage, number> = { growing: 1, packing: 1, ready: 2, onTheWay: 2, delivered: 4 };

function Tracker({ stage, copy }: { stage: HeroStage; copy: HeroCopy }) {
  const keys = ["placed", "prepare", "onTheWay", "delivered"] as const;
  const current = CURRENT[stage];
  return (
    <ol aria-label={copy.progressLabel} className="relative grid grid-cols-4 border-t border-cream/10 px-4 py-5 md:px-8">
      {keys.map((key, i) => {
        const done = i < current;
        const now = i === current;
        const Icon = key === "prepare" && stage === "growing" ? Sprout : STEP_ICON[key];
        return (
          <li
            key={key}
            aria-current={now ? "step" : undefined}
            className="relative flex flex-col items-center text-center"
          >
            {/* The line to the next step, drawn from this node's centre. */}
            {i < keys.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-1/2 top-5 h-0.5 w-full ${i < current ? "bg-sage" : "bg-cream/15"}`}
              />
            )}
            <span
              className={`relative grid size-10 place-items-center rounded-full transition-colors ${
                done ? "bg-sage text-forest" : now ? "bg-forest-deep text-cream ring-2 ring-sage" : "bg-forest-deep text-cream/40"
              }`}
            >
              {now && <span aria-hidden className="order-ping absolute inset-0 rounded-full ring-2 ring-sage" />}
              <Icon aria-hidden size={18} strokeWidth={done ? 2.5 : 1.75} />
            </span>
            <span
              className={`mt-2 font-body text-[11px] font-semibold uppercase tracking-wider md:text-xs ${
                done || now ? "text-cream" : "text-cream/45"
              }`}
            >
              {key === "prepare" ? copy.steps.prepare : copy.steps[key]}
            </span>
            {(done || now) && <span className="sr-only">{done ? copy.stepDone : copy.stepNow}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Packing scene ───────────────────────────────────────────────────── */

/** A leaf, base at the origin, pointing up. */
const LEAF = "M0 0 C-6 -5 -7 -14 0 -22 C7 -14 6 -5 0 0 Z";

/** A crinkled strand of paper filler, as a zigzag from `x0` to `x1`. */
function zigzag(x0: number, x1: number, y: number, amp: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0 + 4, up = true; x <= x1; x += 4, up = !up) d += ` L${x} ${up ? y - amp : y}`;
  return d;
}

const FILLER = [
  [118, 170, 104, 2.6, "#e6c99a"],
  [150, 214, 102.5, 2.4, "#fbf9f3"],
  [128, 202, 106.5, 2.2, "#c9a06e"],
  [170, 218, 105, 2.4, "#e6c99a"],
] as const;

/**
 * A packing bench: a kraft carton seen a little from above and to the left,
 * so its top and right side show. Filler goes in, then what we sell — a
 * punnet of microgreens, a growing tray and two seed packets (the owner, 26
 * Sep 2026), so the one scene stands for any order — the back and front flaps fold down, a tape gun runs the seam, a
 * label is slapped on and the FG mark stamped in ink.
 *
 * **The flaps fold in the box's own perspective.** The top is an oblique
 * projection — depth runs (18, −14) — so a flap turning about its hinge maps
 * its local "up" onto a mix of screen-up and that depth vector. That mapping
 * is `scaleY(d) skewX(atan c)`, written in that order so both terms stay
 * continuous through the fold; the angles are worked out in `globals.css`.
 * The back flap is drawn twice: once behind the parcels while it stands, once
 * in front of them once it has passed the hinge line and lies over them.
 */
function PackScene({ still }: { still: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `pack-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const outline = { className: "stroke-bark", strokeWidth: 2, strokeLinejoin: "round" as const };

  return (
    <svg
      aria-hidden
      viewBox="40 38 240 156"
      className={`pack block h-auto w-full ${still ? "pack--still" : ""}`}
      focusable="false"
    >
      <defs>
        <linearGradient id={id("front")} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#e3c297" />
          <stop offset="1" stopColor="#cca274" />
        </linearGradient>
        <linearGradient id={id("side")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bd905e" />
          <stop offset="1" stopColor="#9f7446" />
        </linearGradient>
        <linearGradient id={id("inside")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a17549" />
          <stop offset="1" stopColor="#6d4b2c" />
        </linearGradient>
        <linearGradient id={id("flap")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ecd2ac" />
          <stop offset="1" stopColor="#dbb68a" />
        </linearGradient>
        <filter id={id("soft")} x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* The bench: a wall with window light falling on it, and the counter. */}
      <rect x="40" y="38" width="240" height="124" fill="#f3eee4" />
      <path d="M196 38 H262 L238 100 H172 Z" className="fill-cream" />
      <path d="M229 38 L205 100 M184 69 H250" stroke="#f3eee4" strokeWidth="3" />
      <rect x="40" y="160" width="240" height="26" fill="#ecdfcc" />
      <rect x="40" y="186" width="240" height="8" fill="#dcc8ae" />

      <g className="pack-scene">
        {/* A plant on the bench, and a spare roll of tape. */}
        <g className="pack-plant">
          {[
            [-38, 1],
            [-12, 1.2],
            [14, 1.1],
            [40, 0.9],
          ].map(([deg, s]) => (
            <path
              key={deg}
              d={LEAF}
              transform={`translate(64 156) rotate(${deg}) scale(${s})`}
              className="fill-sage stroke-forest"
              strokeWidth="1.4"
            />
          ))}
        </g>
        <path d="M53 158 H75 L72 177 H56 Z" className="fill-terracotta" />
        <rect x="51" y="154" width="26" height="6" rx="2" className="fill-terracotta" />
        <rect x="53" y="160" width="22" height="2" className="fill-bark/25" />

        <path d="M251 169 V174 A11 4.5 0 0 0 273 174 V169 Z" fill="#8fb877" className="stroke-forest" strokeWidth="1.4" />
        <ellipse cx="262" cy="169" rx="11" ry="4.5" className="fill-sage stroke-forest" strokeWidth="1.4" />
        <ellipse cx="262" cy="169" rx="5" ry="2" fill="#ecdfcc" className="stroke-forest" strokeWidth="1" />

        {/* The carton's footprint, softened, as its shadow. */}
        <path d="M96 180 H224 L246 165 H118 Z" className="pack-shadow fill-bark/25" filter={url("soft")} />

        <g className="pack-box">
          {/* Back flap, standing open behind whatever drops in. */}
          <rect x="118" y="76" width="120" height="20" rx="1" fill={url("flap")} {...outline} vectorEffect="non-scaling-stroke" className="pack-flap pack-flap--back-open stroke-bark" />

          {/* The open top, looking in. */}
          <path d="M100 110 L118 96 H238 L220 110 Z" fill={url("inside")} />

          {/* Filler first, then the products. Each rests with its top inside
              the opening, so it shows over the rim until the flaps shut. */}
          <g className="pack-item pack-item--0">
            {FILLER.map(([x0, x1, y, amp, colour]) => (
              <path key={`${x0}-${y}`} d={zigzag(x0, x1, y, amp)} stroke={colour} strokeWidth="1.8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </g>
          {/* A punnet of microgreens: a clear box, sprouts showing through. */}
          <g className="pack-item pack-item--1">
            <rect x="122" y="101" width="30" height="42" rx="3" className="fill-mint/40 stroke-forest" strokeWidth="1.5" />
            {[126, 130.5, 135, 139.5, 144, 148].map((x, i) => {
              const top = 110 + (i % 3) * 1.5;
              return (
                <g key={x}>
                  <path d={`M${x} 131 V${top}`} className="stroke-forest" strokeWidth="1.1" />
                  <path d={LEAF} transform={`translate(${x} ${top}) rotate(-55) scale(0.36)`} className="fill-sage stroke-forest" strokeWidth="1.6" />
                  <path d={LEAF} transform={`translate(${x} ${top}) rotate(55) scale(0.36)`} className="fill-sage stroke-forest" strokeWidth="1.6" />
                </g>
              );
            })}
            <rect x="124" y="130" width="26" height="11" rx="2" className="fill-bark/70" />
            <rect x="121" y="100" width="32" height="3" rx="1.5" className="fill-cream/80 stroke-forest" strokeWidth="1" />
          </g>
          {/* A growing tray, stood on its edge: black, with drainage holes. */}
          <g className="pack-item pack-item--2">
            <rect x="157" y="100" width="26" height="50" rx="2" className="fill-ink" />
            <rect x="160" y="103" width="20" height="44" rx="1" fill="none" className="stroke-stone" strokeWidth="0.8" />
            {[106, 113, 120, 127, 134, 141].flatMap((y) =>
              [164, 170, 176].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" className="fill-stone" />),
            )}
          </g>
          {/* Two packets of seeds, leaning together. */}
          <g className="pack-item pack-item--3">
            <g transform="rotate(-6 194 118)">
              <rect x="186" y="101" width="18" height="32" rx="1.5" className="fill-cream stroke-forest" strokeWidth="1.5" />
              <rect x="186" y="101" width="18" height="4" className="fill-tan" />
              <circle cx="195" cy="120" r="4" className="fill-tan/70" />
            </g>
            <g transform="rotate(8 204 118)">
              <rect x="196" y="100" width="18" height="34" rx="1.5" className="fill-cream stroke-forest" strokeWidth="1.5" />
              <rect x="196" y="100" width="18" height="4" className="fill-sage" />
              <path d={LEAF} transform="translate(205 126) scale(0.45)" className="fill-sage stroke-forest" strokeWidth="1.2" />
            </g>
          </g>

          {/* Front face, with a few paper fibres and "this way up". */}
          <rect x="100" y="110" width="120" height="68" rx="2" fill={url("front")} {...outline} />
          {["M112 146 l10 1", "M150 121 l8 -0.5", "M166 168 l12 0.5", "M204 129 l7 0.4", "M130 170 l7 -0.3", "M186 118 l6 0.3"].map((d) => (
            <path key={d} d={d} className="stroke-bark/15" strokeWidth="1" strokeLinecap="round" />
          ))}
          <path d="M110 128 V117 M107 120 L110 116.5 L113 120 M118 128 V117 M115 120 L118 116.5 L121 120 M106 131 H122" className="stroke-bark/45" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Right side, in shade. */}
          <path d="M220 110 L238 96 V164 L220 178 Z" fill={url("side")} {...outline} />

          {/* The flaps, closing over the parcels. */}
          <rect x="118" y="76" width="120" height="20" rx="1" fill={url("flap")} {...outline} vectorEffect="non-scaling-stroke" className="pack-flap pack-flap--back stroke-bark" />
          <rect x="100" y="90" width="120" height="20" rx="1" fill={url("flap")} {...outline} vectorEffect="non-scaling-stroke" className="pack-flap pack-flap--front stroke-bark" />

          {/* Tape along the seam and down the side. */}
          <path d="M106.8 104.7 H226.8 L231.2 101.3 H111.2 Z" className="pack-tape fill-sage/90" />
          <path d="M226.8 104.7 L231.2 101.3 V131.3 L226.8 134.7 Z" className="pack-tape-side fill-sage/80" />

          {/* Shipping label. */}
          <g className="pack-label">
            <g transform="rotate(-2 129 146)">
              <rect x="108" y="133" width="42" height="27" rx="1.5" className="fill-cream stroke-bark/50" strokeWidth="1" />
              <rect x="113" y="137" width="20" height="3" rx="1" className="fill-forest" />
              <rect x="113" y="143" width="30" height="2" rx="1" className="fill-stone/50" />
              <rect x="113" y="147" width="24" height="2" rx="1" className="fill-stone/50" />
              <path d="M113 151 V156 M115 151 V156 M118 151 V156 M119.5 151 V156 M122 151 V156 M125 151 V156 M126.5 151 V156 M129 151 V156 M132 151 V156 M133.5 151 V156 M136 151 V156 M139 151 V156 M141 151 V156 M143 151 V156" className="stroke-ink" strokeWidth="1" />
            </g>
          </g>

          {/* Ink stamp: the FG mark in a double ring, pressed a little askew. */}
          <g className="pack-stamp">
            <g transform="rotate(-8 192 150)" opacity="0.85">
              <circle cx="192" cy="150" r="12.5" fill="none" className="stroke-forest" strokeWidth="1.8" />
              <circle cx="192" cy="150" r="10" fill="none" className="stroke-forest" strokeWidth="0.7" strokeDasharray="1.4 1.2" />
              <FgMark transform="translate(183.5 141.5) scale(0.17)" className="fill-forest" />
            </g>
          </g>
        </g>

        {/* The tape gun, riding the seam from left to right. */}
        <g className="pack-gun">
          <g transform="translate(110 103)">
            <path d="M-3 -10 L-16 -25" className="stroke-forest" strokeWidth="3" strokeLinecap="round" />
            <path d="M-15 -25 L-25 -31" className="stroke-forest" strokeWidth="6" strokeLinecap="round" />
            <path d="M-3 -10 L7 -2" className="stroke-forest" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="6" y="-3" width="5" height="3" rx="0.5" className="fill-stone" />
            <g className="pack-roll">
              <circle cx="-3" cy="-10" r="9" className="fill-sage stroke-forest" strokeWidth="1.5" />
              <circle cx="-3" cy="-10" r="3.5" className="fill-cream stroke-forest" strokeWidth="1.2" />
              <path d="M-3 -19 V-15" className="stroke-forest/60" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>
        </g>

        {/* The rubber stamp, coming down onto the front face. */}
        <g className="pack-stamp-tool">
          <circle cx="192" cy="110" r="6" className="fill-terracotta" />
          <rect x="189" y="114" width="6" height="11" fill="#8a5a36" />
          <rect x="182" y="124" width="20" height="10" rx="2" fill="#8a5a36" />
          <rect x="179" y="133" width="26" height="5" rx="1" className="fill-forest" />
        </g>

        {/* Three sparks when it's done. */}
        {[
          [252, 94, 0],
          [262, 126, 1],
          [86, 104, 2],
        ].map(([x, y, i]) => (
          <path
            key={i}
            d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z"
            transform={`translate(${x} ${y})`}
            className={`pack-spark pack-spark--${i} fill-sage`}
          />
        ))}
      </g>
    </svg>
  );
}

/* ── Growing scene ───────────────────────────────────────────────────── */

const SPROUTS = [118, 134, 150, 166, 182, 198, 142, 174, 126, 190];

function GrowScene() {
  return (
    <svg aria-hidden viewBox="66 14 226 170" className="grow block h-auto w-full" focusable="false">
      <ellipse cx="160" cy="182" rx="96" ry="7" className="fill-forest/10" />

      {/* Sun, turning slowly. */}
      <g className="grow-sun" transform="translate(262 46)">
        <circle r="13" className="fill-tan" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="-1.5" y="-24" width="3" height="7" rx="1.5" className="fill-tan" transform={`rotate(${i * 45})`} />
        ))}
      </g>

      {/* Droplets from above the tray. */}
      {[132, 160, 188].map((x, i) => (
        <path key={x} d="M0 0 C-4 6 -4 10 0 10 C4 10 4 6 0 0 Z" transform={`translate(${x} 40)`} className={`grow-drop grow-drop--${i} fill-mint`} />
      ))}

      {/* Sprouts, each growing up from the soil and then swaying. */}
      {SPROUTS.map((x, i) => {
        const h = 34 + ((i * 7) % 14);
        return (
          <g key={i} className="grow-sprout" style={{ animationDelay: `${(i % 5) * 0.18 + Math.floor(i / 5) * 0.4}s` }}>
            <path d={`M${x} 158 C${x - 2} ${158 - h / 2} ${x + 2} ${158 - h / 1.4} ${x} ${158 - h}`} className="stroke-forest" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d={LEAF} transform={`translate(${x} ${158 - h}) rotate(-55) scale(0.62)`} className="fill-sage stroke-forest" strokeWidth="1.5" />
            <path d={LEAF} transform={`translate(${x} ${158 - h}) rotate(55) scale(0.62)`} className="fill-sage stroke-forest" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* The tray, in front of the stems' feet. */}
      <rect x="96" y="154" width="128" height="10" rx="2" className="fill-bark" />
      <rect x="92" y="160" width="136" height="20" rx="4" className="fill-ink" />
    </svg>
  );
}

/* ── Falling leaves ──────────────────────────────────────────────────── */

/** Left edge (%), delay (s) and colour. The colour is the whole class name,
 *  so Tailwind can see it. */
const FALL = [
  [6, 0, "fill-sage"],
  [16, 0.35, "fill-tan"],
  [27, 0.15, "fill-mint"],
  [38, 0.55, "fill-sage"],
  [49, 0.05, "fill-tan"],
  [58, 0.45, "fill-sage"],
  [67, 0.25, "fill-mint"],
  [76, 0.6, "fill-tan"],
  [86, 0.1, "fill-sage"],
  [94, 0.4, "fill-mint"],
] as const;

function FallingLeaves() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {FALL.map(([left, delay, tone], i) => (
        <svg
          key={i}
          viewBox="-8 -24 16 26"
          className={`order-fall absolute -top-8 h-6 w-4 ${tone}`}
          style={{ left: `${left}%`, animationDelay: `${delay}s`, ["--spin" as string]: `${i % 2 ? 1 : -1}` }}
        >
          <path d={LEAF} />
        </svg>
      ))}
    </div>
  );
}
