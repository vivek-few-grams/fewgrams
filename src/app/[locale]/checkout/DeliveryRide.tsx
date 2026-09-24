/**
 * The checkout header's road scene: a rider on a scooter with the box, an
 * auto alongside, trees and bushes going by. Decoration only — it carries no
 * words, so it is `aria-hidden` and has no messages.
 *
 * The vehicles stay put and the world moves, in three layers at three
 * speeds (far trees, near trees and bushes, road markings), which is what
 * reads as travel. Each layer is drawn once over the 640-unit width and
 * `<use>`d again one width to the right; `.ride-pan` slides the pair one
 * width left and loops, so the seam is never on screen. Keyframes and the
 * reduced-motion stop live in `globals.css` under "Checkout delivery ride".
 */
export function DeliveryRide({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`ride ${className}`}>
      <svg viewBox="0 18 640 132" className="block h-auto w-full" focusable="false">
        <defs>
          <g id="ride-tree">
            <rect x="-3" y="-30" width="6" height="30" fill="var(--color-bark)" />
            <circle cx="0" cy="-42" r="16" />
            <circle cx="-11" cy="-33" r="11" />
            <circle cx="11" cy="-33" r="11" />
          </g>
          <g id="ride-bush">
            <circle cx="-8" cy="-6" r="8" />
            <circle cx="4" cy="-9" r="10" />
            <circle cx="15" cy="-5" r="7" />
          </g>

          <g id="ride-far-set">
            {[
              [30, 0.7],
              [140, 0.55],
              [250, 0.8],
              [330, 0.6],
              [460, 0.75],
              [560, 0.6],
            ].map(([x, s]) => (
              <use key={x} href="#ride-tree" transform={`translate(${x} 126) scale(${s})`} />
            ))}
          </g>
          <g id="ride-near-set">
            {[
              [90, 1.1],
              [310, 0.95],
              [520, 1.2],
            ].map(([x, s]) => (
              <use key={x} href="#ride-tree" transform={`translate(${x} 128) scale(${s})`} fill="var(--color-sage)" />
            ))}
            {[20, 200, 250, 410, 600].map((x) => (
              <use key={x} href="#ride-bush" transform={`translate(${x} 128)`} fill="var(--color-sage)" fillOpacity="0.7" />
            ))}
          </g>
          <g id="ride-dashes">
            {Array.from({ length: 16 }, (_, i) => (
              <rect key={i} x={i * 40} y="138.5" width="20" height="2.5" rx="1.25" />
            ))}
          </g>

          <g id="ride-wheel">
            <circle r="11" fill="var(--color-forest-deep)" />
            <circle r="5" fill="var(--color-cream)" />
            <path d="M0 -9V9M-9 0H9" stroke="var(--color-forest-deep)" strokeWidth="1.5" />
          </g>
        </defs>

        <circle cx="575" cy="38" r="16" fill="var(--color-tan)" opacity="0.45" />

        <g className="ride-pan ride-pan--far" fill="var(--color-sage)" opacity="0.35">
          <use href="#ride-far-set" />
          <use href="#ride-far-set" x="640" />
        </g>

        <g className="ride-pan ride-pan--near">
          <use href="#ride-near-set" />
          <use href="#ride-near-set" x="640" />
        </g>

        <rect x="0" y="128" width="640" height="22" fill="var(--color-sand)" />
        <line x1="0" y1="128" x2="640" y2="128" stroke="var(--color-forest)" strokeOpacity="0.15" />
        <g className="ride-pan ride-pan--road" fill="var(--color-stone)" opacity="0.35">
          <use href="#ride-dashes" />
          <use href="#ride-dashes" x="640" />
        </g>

        {/* The auto — green body, yellow canopy, as they run in Bengaluru. */}
        <g className="ride-drift ride-drift--auto">
          <g className="ride-bob ride-bob--auto">
            <path d="M122 62 Q124 44 150 44 L194 44 Q212 44 218 60 L224 78 L120 78 Z" fill="var(--color-tan)" />
            <path d="M118 78 L214 78 L232 92 L236 112 L118 112 Q114 95 118 78 Z" fill="var(--color-forest)" />
            <rect x="130" y="56" width="46" height="28" rx="4" fill="var(--color-cream)" />
            <path d="M188 52 L207 52 L219 77 L188 77 Z" fill="var(--color-cream)" />
            <circle cx="198" cy="63" r="6" fill="var(--color-forest-deep)" />
            <rect x="118" y="97" width="118" height="4" fill="var(--color-tan)" />
            <circle cx="233" cy="102" r="3" fill="var(--color-cream)" />
          </g>
          <g transform="translate(142 117)">
            <use href="#ride-wheel" className="ride-wheel" />
          </g>
          <g transform="translate(222 119) scale(0.8)">
            <use href="#ride-wheel" className="ride-wheel" />
          </g>
        </g>

        {/* The rider, with the box on the back. */}
        <g className="ride-drift ride-drift--scooter">
          <g className="ride-bob ride-bob--scooter">
            <rect x="348" y="66" width="32" height="27" rx="4" fill="var(--color-terracotta)" />
            <path
              d="M364 86 V76 M364 80 Q358 79 357 73 Q363 73 364 79 M364 78 Q370 76 371 70 Q365 70 364 77"
              stroke="var(--color-cream)"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
            <path d="M356 112 Q356 96 376 96 L404 96 Q410 96 410 104 L410 112 Z" fill="var(--color-forest)" />
            <rect x="372" y="90" width="31" height="6" rx="3" fill="var(--color-forest-deep)" />
            <path d="M392 95 L414 103 L421 111" stroke="var(--color-forest-deep)" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M391 92 L402 67" stroke="var(--color-sage)" strokeWidth="13" strokeLinecap="round" />
            <path d="M403 70 L420 80 L437 78" stroke="var(--color-sage)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="407" cy="55" r="10" fill="var(--color-forest-deep)" />
            <path d="M409 51 Q417 51 417 57 L410 57 Z" fill="var(--color-tan)" />
            <rect x="404" y="108" width="27" height="5" fill="var(--color-forest)" />
            <path d="M428 113 L436 79 L444 79 L438 113 Z" fill="var(--color-forest)" />
            <path d="M435 79 L449 75" stroke="var(--color-forest-deep)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="446" cy="86" r="3" fill="var(--color-tan)" />
            <path d="M427 113 A13 13 0 0 1 453 113" stroke="var(--color-forest)" strokeWidth="3" fill="none" />
          </g>
          <g transform="translate(372 117)">
            <use href="#ride-wheel" className="ride-wheel" />
          </g>
          <g transform="translate(440 117)">
            <use href="#ride-wheel" className="ride-wheel" />
          </g>
        </g>
      </svg>
    </div>
  );
}
