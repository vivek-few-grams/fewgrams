/**
 * Which clicks raise the navigation curtain — SPEC §17.5.
 *
 * A plain module, not part of `PageLoader.tsx`: that file carries
 * `"use client"`, and this has to be importable by a test (and, if it ever
 * moves, by a server component) without dragging the component with it. The
 * same reason `admin/nav-items.ts` exists.
 *
 * ## The curtain is opt-in, per link
 *
 * It used to run on **every** internal navigation, which the owner asked to
 * narrow on 17 Sep 2026: *"this full screen loader should be shown only when i
 * click on these options not for individual pages."* A full-screen wipe is a
 * punctuation mark for changing section; on the way into a variety page from a
 * card in a grid it is a 1.2 second toll on browsing.
 *
 * So a link now has to ask for it, by carrying `data-curtain`. Opt-in rather
 * than a list of paths here, because the alternative was this module holding a
 * second copy of the nav's route list — and the two would drift the first time
 * a route was added.
 *
 * Six links opt in, all of them in the header: the **brand logo**, the four
 * section links, and the **language switch**. Everything else navigates
 * plainly — variety cards, shop category tiles, the cart and account icons,
 * footer links, in-page CTAs.
 *
 * `closest` rather than an attribute check on the anchor itself, so a whole
 * group can be opted in by marking its container if that is ever wanted.
 *
 * Everything else here is a reason the curtain would be *wrong* rather than
 * merely unnecessary, and all of it predates the opt-in: a new tab or a
 * download leaves this document on screen, an in-page hash is the thing the
 * curtain would hide, and a same-pathname link covers both the link to the
 * page you are on and a link that only changes the query string.
 */

/** The marker a link carries to ask for the curtain. */
export const CURTAIN_ATTR = "data-curtain";

export const CURTAIN_SELECTOR = `[${CURTAIN_ATTR}]`;

/**
 * The parts of a click this decision reads.
 *
 * Structural rather than `MouseEvent`, so the test can pass plain objects —
 * there is no DOM in the test environment, and the interesting cases here are
 * combinations of anchor attributes rather than anything a browser does.
 * A real `MouseEvent` satisfies it.
 */
export type CurtainClick = {
  readonly defaultPrevented: boolean;
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  /** `unknown` so `EventTarget | null` is assignable; narrowed below. */
  readonly target: unknown;
};

/** The parts of an anchor this decision reads. `HTMLAnchorElement` satisfies
 *  it. */
export type CurtainAnchor = {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  readonly target: string;
  /** Resolved, as the DOM property gives it. */
  readonly href: string;
  closest(selector: string): unknown;
  /** Used to replay the click once the curtain has covered the page — see
   *  "Cover first, then navigate" in `PageLoader.tsx`. */
  click(): void;
};

/** The parts of `location` this decision reads. */
export type CurtainLocation = {
  readonly origin: string;
  readonly pathname: string;
  readonly href: string;
};

/**
 * The anchor this click should raise a curtain for, or `null`.
 *
 * Returns the anchor rather than a boolean so a caller can read the href it
 * matched — useful when debugging why a link did or did not animate.
 */
export function curtainAnchor(
  event: CurtainClick,
  here: CurtainLocation,
): CurtainAnchor | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const anchor = closestAnchor(event.target);
  if (!anchor) return null;

  /* The opt-in. Checked first among the anchor's own properties because it is
     the cheapest way to reject the overwhelming majority of clicks on the
     site, and because it is the rule most likely to be the reason a link does
     not animate. */
  if (!anchor.closest(CURTAIN_SELECTOR)) return null;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return null;
  if (anchor.hasAttribute("download")) return null;
  /* `_blank` and a named frame both leave this document on screen. */
  if (anchor.target && anchor.target !== "_self") return null;

  let url: URL;
  try {
    url = new URL(anchor.href, here.href);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;

  /* Same pathname covers two cases worth keeping uncovered: the link to the
     page you are on, and a link that only changes the query string — a filter
     or a page number, where a full-screen wipe is far more motion than the
     change deserves.

     It is also what keeps PLANS quiet while you are already on the home page:
     the nav's `/#plans` is an opted-in link, but from `/` it only scrolls, and
     a curtain would hide the very thing it scrolled to. */
  if (url.pathname === here.pathname) return null;

  return anchor;
}

function closestAnchor(target: unknown): CurtainAnchor | null {
  const closest = (target as { closest?: unknown } | null)?.closest;
  if (typeof closest !== "function") return null;
  return (closest.call(target, "a") as CurtainAnchor | null) ?? null;
}
