/**
 * The ghost hand's drawing (see `ghost.ts`): a pointing hand in pale cream
 * with a forest outline, and the ring a tap spreads. Decorative — the
 * step's own labels and buttons carry the instructions for a screen
 * reader — so it is hidden from one, and it never takes a pointer.
 *
 * Starts invisible at the canvas's top left; the scene places it.
 */
export function GhostHand({
  ghostRef,
}: {
  ghostRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={ghostRef}
      aria-hidden="true"
      style={{ opacity: 0 }}
      className="pointer-events-none absolute left-0 top-0 z-[25] will-change-transform"
    >
      <span
        data-ghost-ring
        style={{ opacity: 0 }}
        className="absolute left-[17.9px] top-[2.1px] size-14 rounded-full border-[3px] border-cream bg-cream/25"
      />
      <span
        data-ghost-hand
        className="block origin-[40%_5%] transition-transform duration-150 drop-shadow-[0_6px_10px_rgba(3,39,24,0.35)]"
      >
        <svg width="44" height="55" viewBox="0 0 32 40">
          <path
            d="M13 1.5a3 3 0 0 1 3 3V15a2.6 2.6 0 0 1 5 .6a2.6 2.6 0 0 1 5 1v1a2.6 2.6 0 0 1 4 1.5V27a11 11 0 0 1-11 11h-3a10 10 0 0 1-8-4L2.5 26.5a2.4 2.4 0 0 1 3.6-3.2L10 26V4.5a3 3 0 0 1 3-3z"
            fill="rgba(251,248,240,0.94)"
            stroke="#033923"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M16 15v7M21 15.6v6.4M26 17.6v4.4"
            stroke="#033923"
            strokeOpacity="0.45"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </span>
    </div>
  );
}
