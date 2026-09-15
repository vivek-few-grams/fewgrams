/**
 * Placeholder produce illustration.
 *
 * Curved stems fanning from a single base, each topped with a cotyledon pair.
 * Deliberately no flat baseline — an earlier version drew one and the result
 * read as a wrapped gift box rather than a plant.
 *
 * TODO: replace with cut-out PNG photography of real Fewgrams trays. The
 * Don Molinico card effect (SPEC §17.4) depends on a background-free cut-out
 * so the marquee reads behind it — a rectangular photo will break the effect.
 */
const STEMS = [
  { d: "M60 112 C60 92 59 72 59 50", tip: [59, 50] },
  { d: "M60 112 C56 92 48 74 37 62", tip: [37, 62] },
  { d: "M60 112 C64 92 72 76 83 64", tip: [83, 64] },
  { d: "M60 112 C52 100 37 90 22 78", tip: [22, 78] },
  { d: "M60 112 C68 100 83 92 98 80", tip: [98, 80] },
] as const;

export function Sprout({
  className = "",
  stroke = "currentColor",
  seed = 0,
  stems = STEMS.length,
}: {
  className?: string;
  stroke?: string;
  seed?: number;
  /**
   * How many of the five stems to draw, 1–5. Defaults to all of them, so no
   * existing call site changes.
   *
   * Added for the bundle-card watermarks (SPEC §18.4). `seed` only varies the
   * lean, and a lean is not a different drawing — three cards carrying the same
   * five-stem fan tilted a few degrees apart differentiated nothing. Dropping
   * stems does: one, three and five read as a single green, a seedling and a
   * full tray.
   *
   * The paths are ordered centre, inner pair, outer pair, so an **odd** count
   * is a symmetrical fan. 2 and 4 draw a plant missing one side — occasionally
   * what you want from an organic mark, never what you want by accident, so
   * prefer 1, 3 or 5. Out-of-range values clamp rather than throw.
   */
  stems?: number;
}) {
  const lean = [0, -7, 6, -4, 8][seed % 5];
  const drawn = STEMS.slice(0, Math.max(1, Math.min(stems, STEMS.length)));

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ transform: `rotate(${lean}deg)` }}
    >
      <g stroke={stroke} strokeWidth="2.1" strokeLinecap="round">
        {drawn.map((s, i) => {
          const [x, y] = s.tip;
          const spread = i === 0 ? 11 : 9;
          const ry = i === 0 ? 5 : 4.2;
          return (
            <g key={i}>
              <path d={s.d} />
              <ellipse
                cx="0"
                cy="0"
                rx={spread}
                ry={ry}
                transform={`translate(${x - spread + 1} ${y - 2}) rotate(-22)`}
              />
              <ellipse
                cx="0"
                cy="0"
                rx={spread}
                ry={ry}
                transform={`translate(${x + spread - 1} ${y - 2}) rotate(22)`}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
