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
}: {
  className?: string;
  stroke?: string;
  seed?: number;
}) {
  const lean = [0, -7, 6, -4, 8][seed % 5];

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ transform: `rotate(${lean}deg)` }}
    >
      <g stroke={stroke} strokeWidth="2.1" strokeLinecap="round">
        {STEMS.map((s, i) => {
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
