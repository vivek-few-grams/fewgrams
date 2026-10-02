/**
 * The ghost hand: a pale pointing hand that shows a stuck visitor what to
 * do by doing it, without doing it — it moves over the scene and taps, and
 * the scene underneath is untouched (the owner, 2 Oct 2026: "add the ghost
 * hand demo when users get stuck", and on the first screen "let ghost hand
 * handle it" in place of the written hint).
 *
 * Plain DOM, no React and no three.js, so a scene's frame loop can move it
 * without a render: the scene works out where the hand is and calls
 * `placeGhost` with that point in the canvas's CSS pixels. The element is
 * `GhostHand`.
 */

/** Where the fingertip is in the drawn hand, in its CSS pixels — the point
 *  `placeGhost` puts on the spot. Matches `GhostHand`'s 44 × 55 drawing. */
const TIP_X = 17.9;
const TIP_Y = 2.1;

/** How long the ghost waits, with no real hand at work, before it shows
 *  the move again. */
export const GHOST_IDLE_SECONDS = 4;

/**
 * Put the ghost's fingertip at (`x`, `y`). `alpha` 0 hides it. `tap` runs
 * 0 → 1 over one tap: the hand presses in for the first half and a ring
 * spreads from the fingertip; 0 is no tap.
 */
export function placeGhost(
  el: HTMLElement | null,
  x: number,
  y: number,
  alpha: number,
  tap = 0,
) {
  if (!el) return;
  const a = Math.max(0, Math.min(1, alpha));
  el.style.opacity = a.toFixed(3);
  if (a === 0) return;
  el.style.transform = `translate(${(x - TIP_X).toFixed(1)}px, ${(y - TIP_Y).toFixed(1)}px)`;
  const hand = el.querySelector<HTMLElement>("[data-ghost-hand]");
  const ring = el.querySelector<HTMLElement>("[data-ghost-ring]");
  const pressed = tap > 0 && tap < 0.5;
  if (hand) hand.style.transform = pressed ? "scale(0.86)" : "scale(1)";
  if (ring) {
    ring.style.opacity = tap > 0 ? (0.9 * (1 - tap)).toFixed(3) : "0";
    ring.style.transform = `translate(-50%, -50%) scale(${(0.3 + tap * 1.3).toFixed(3)})`;
  }
}

export function hideGhost(el: HTMLElement | null) {
  if (el) el.style.opacity = "0";
}
