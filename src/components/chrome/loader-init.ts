/**
 * The curtain's pre-paint decision — SPEC §17.5.
 *
 * Inlined into `<head>` and run **synchronously before first paint**, which is
 * the only moment at which "should this page come up covered?" can be answered
 * without a flash either way. It is a string rather than a module because it
 * has to execute before React exists; it is in its own file rather than beside
 * the component because `page-loader.test.ts` executes it against stubs, and
 * importing the component would drag `next/image` into a node test.
 *
 * Three inputs, in priority order:
 *
 *   `fg:curtain`  a timestamp: a curtain was up when the previous document was
 *                 torn down, so continue it — `hold`, already covering. This is
 *                 what makes a full page load (the language switch, or a link
 *                 followed before hydration) look like the client-side
 *                 navigations around it. Nothing else has to travel with it;
 *                 the circle is centred, so the next document does not need to
 *                 be told where it came from.
 *
 *                 It holds a timestamp and is honoured for `HANDOFF_MAX_AGE_MS`
 *                 only, because the page that consumes it is not guaranteed to
 *                 exist: clicking HOW WE GROW today lands on the global 404,
 *                 which is outside `[locale]` and so runs neither this script
 *                 nor the component that clears the flag. Stale, an untimed
 *                 flag would then raise a curtain on some unrelated load
 *                 minutes later.
 *   `fg:loader`   this session has already seen the intro. No curtain.
 *   neither       first visit of the session — `in`.
 *
 * Both keys are consumed before the reduced-motion bail, so a visitor who has
 * motion turned off still has "seen" the intro and does not get one the moment
 * they turn it back on mid-session.
 */
/** How long a handed-over curtain stays valid. Generous enough for a slow
 *  document load on a phone, short enough that a flag stranded by a page that
 *  never consumed it cannot surprise anyone later. */
export const HANDOFF_MAX_AGE_MS = 5000;

export const loaderInitScript = `(function(){
try {
  var root = document.documentElement;
  var seen = sessionStorage.getItem('fg:loader');
  var at = Number(sessionStorage.getItem('fg:curtain'));
  sessionStorage.setItem('fg:loader', '1');
  sessionStorage.removeItem('fg:curtain');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (at && Date.now() - at < ${HANDOFF_MAX_AGE_MS}) root.dataset.loader = 'hold';
  else if (!seen) root.dataset.loader = 'in';
} catch (e) {}
})()`;
