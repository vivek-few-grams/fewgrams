/**
 * Small plant marks dotted down the margins of every page (the owner,
 * 25 Sep 2026: "some places randomly, small leafs or microgreens or some
 * plant design patterns" — after a first cut with a full vine down each side
 * and a sprig in every corner read as too much).
 *
 * Five marks in the house line style of `Sprout` — a leaf, a microgreen with
 * its two seed leaves, a three-leaf seedling, a short sprig and a few seeds —
 * each a sage fill under a forest outline, all at low strength.
 *
 * - **Scattered, not lined up.** Each margin is a tall `<pattern>` tile with a
 *   handful of marks at seeded-random heights, sizes and turns, so the page
 *   never shows an obvious row. The two margins use different seeds, so left
 *   and right do not mirror each other. The seed is fixed, so the server and
 *   every visit draw the same page.
 * - **Only in the margins, and only from `md`.** The strip is narrower than
 *   the content gutter, so a mark never sits under a line of text; on a phone
 *   the gutter is 24px and there is no room for one.
 * - **Behind the content** (`-z-10` in an `isolate` main): a section that
 *   paints its own ground — the hero, the plan cards, the sand trust band, the
 *   footer — covers the marks, so they show only on plain cream.
 *
 * Decorative only: `aria-hidden`, `pointer-events-none`, no text.
 */

const LEAF = "M0 0 C-7 -6 -8 -17 0 -26 C8 -17 7 -6 0 0 Z";
const RIB = "M0 -2 L0 -21";

/** Each mark is drawn around the origin, about 40 units tall. */
const MARKS: ((key: string) => React.ReactNode)[] = [
  // A single leaf
  (key) => (
    <g key={key} transform="translate(0 16)">
      <path d={LEAF} transform="scale(1.4)" className="fill-sage/50" />
      <path d={LEAF} transform="scale(1.4)" />
      <path d={RIB} transform="scale(1.4)" />
    </g>
  ),
  // A microgreen: a stem and its two seed leaves
  (key) => (
    <g key={key}>
      <path d="M0 20 C1 10 -1 2 0 -6" />
      <ellipse cx="-8" cy="-9" rx="9" ry="4" transform="rotate(-20 -8 -9)" className="fill-sage/50" />
      <ellipse cx="8" cy="-9" rx="9" ry="4" transform="rotate(20 8 -9)" className="fill-sage/50" />
    </g>
  ),
  // A seedling with three leaves
  (key) => (
    <g key={key}>
      <path d="M0 22 C0 10 1 0 0 -10" />
      {[-48, 48, 0].map((r, i) => (
        <g key={i} transform={`translate(0 ${i === 2 ? -8 : 4 - i * 6}) rotate(${r}) scale(${i === 2 ? 0.75 : 0.62})`}>
          <path d={LEAF} className="fill-sage/50" />
          <path d={LEAF} />
        </g>
      ))}
    </g>
  ),
  // A short sprig
  (key) => (
    <g key={key}>
      <path d="M-4 22 C-2 8 4 -4 10 -18" />
      {[
        [-2, 10, -55],
        [1, 2, 40],
        [5, -7, -45],
        [10, -18, 20],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(0.5)`}>
          <path d={LEAF} className="fill-sage/50" />
          <path d={LEAF} />
        </g>
      ))}
    </g>
  ),
  // A few seeds
  (key) => (
    <g key={key}>
      <ellipse cx="-7" cy="2" rx="4" ry="2.6" transform="rotate(30 -7 2)" className="fill-sage/60" />
      <ellipse cx="5" cy="-4" rx="4" ry="2.6" transform="rotate(-25 5 -4)" className="fill-sage/60" />
      <ellipse cx="3" cy="8" rx="4" ry="2.6" transform="rotate(70 3 8)" className="fill-sage/60" />
    </g>
  ),
];

/** mulberry32 — a tiny seeded PRNG, so the scatter is the same on every render. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRIP_W = 44;
const TILE_H = 1400;
const PER_TILE = 3;

type Placed = { mark: number; x: number; y: number; rotate: number; scale: number };

/** `PER_TILE` marks down one tile, one per band of its height so two never
 *  crowd together, each jittered within its band, and no mark repeated in a
 *  row. */
function scatter(seed: number): Placed[] {
  const next = random(seed);
  const band = TILE_H / PER_TILE;
  const out: Placed[] = [];
  let last = -1;
  for (let i = 0; i < PER_TILE; i++) {
    let mark = Math.floor(next() * MARKS.length);
    if (mark === last) mark = (mark + 1) % MARKS.length;
    last = mark;
    const scale = 0.8 + next() * 0.3;
    out.push({
      mark,
      x: STRIP_W / 2 + (next() - 0.5) * 10,
      y: i * band + 40 + next() * (band - 80),
      rotate: (next() - 0.5) * 70,
      scale,
    });
  }
  return out;
}

function Strip({ id, seed }: { id: string; seed: number }) {
  return (
    <svg className="h-full" width={STRIP_W} aria-hidden="true">
      <defs>
        <pattern id={id} width={STRIP_W} height={TILE_H} patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {scatter(seed).map((p, i) => (
              <g
                key={i}
                transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rotate.toFixed(1)}) scale(${p.scale.toFixed(2)})`}
              >
                {MARKS[p.mark](`m${i}`)}
              </g>
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function LeafBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden text-forest/40 md:block print:hidden"
    >
      <div className="absolute inset-y-0 left-0.5 2xl:left-6">
        <Strip id="leaf-scatter-left" seed={7} />
      </div>
      <div className="absolute inset-y-0 right-0.5 2xl:right-6">
        <Strip id="leaf-scatter-right" seed={23} />
      </div>
    </div>
  );
}
