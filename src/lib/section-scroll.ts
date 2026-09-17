/**
 * Re-scroll to a section the URL already points at.
 *
 * The bug this fixes: an in-page link worked once and then never again.
 * `/#plans` is a `Link`, so the first click changes the URL and the browser
 * scrolls — but on the second click the URL is *already* `/#plans`, no
 * navigation happens, and nothing scrolls. The visitor scrolls up, clicks
 * PLANS, and the page ignores them.
 *
 * So the click is intercepted **only** when the hash is already current, which
 * leaves the ordinary first click to the router and keeps this to the one case
 * that is broken.
 *
 * `scrollIntoView` honours the section's `scroll-mt-24`, so the sticky header
 * does not cover the heading, and reduced motion drops the smooth scroll —
 * a long animated jump is exactly what §17.4 says to respect.
 *
 * Shared by `NavLinks` and the hero CTAs. It lives here rather than in either
 * of them because the second copy is where the two drift apart.
 */
export function onSectionClick(event: React.MouseEvent, hash: string) {
  if (window.location.hash !== `#${hash}`) return;
  const target = document.getElementById(hash);
  if (!target) return;

  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}
