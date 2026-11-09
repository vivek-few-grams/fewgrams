/**
 * The section links — SPEC §18.1. Four, and a fifth for the starter packs
 * while one is on sale (SPEC §29).
 *
 * One list for both places they render: the row in the bar from `lg`
 * (`NavLinks`) and the menu panel below it (`MobileMenu`, 9 Nov 2026). Two
 * copies would drift the first time a section was added.
 *
 * A plain module rather than part of either component, so neither has to
 * import the other.
 */
export const NAV_ITEMS = [
  {
    href: "/microgreens",
    key: "microgreens",
    match: "/microgreens",
    hover: "microgreensHover",
  },
  /* `/plans`, the page of its own (the owner, 20 Oct 2026; SPEC §28.8), so
     the link on every page points search engines at it. The home page keeps
     its plans section for anyone scrolling, and the hero's button still
     scrolls to it. Until then this was `/#plans` and re-scrolled the home
     page through `onSectionClick`. */
  { href: "/plans", key: "plans", match: "/plans", hover: "plansHover" },
  /* `hover` is the word the link grows into under the pointer
     (`.nav-sprout` in globals.css) — the owner's, 24 Sep 2026. The menu
     panel has no hover and does not use it.

     **A hover word must be no wider than its label, in both languages.** Both
     words share one grid cell, so the link is as wide as the longer one — a
     wider hover word leaves a gap after the label at rest. "Subscribe now"
     did exactly that beside "Weekly plans", and the Kannada "ನಿಮ್ಮದನ್ನು ಆರಿಸಿ"
     beside "ಮೈಕ್ರೋಗ್ರೀನ್ಸ್" (24 Sep 2026). Measure in the browser, not by
     letter count; no test can see it. */
  { href: "/shop", key: "shop", match: "/shop", hover: "shopHover" },
  /* Starter packs (the owner, 30 Oct 2026, SPEC §29) — a way in for someone
     starting out, beside the shop it is part of. Shown only while a pack is
     set up to sell. */
  { href: "/shop/packs", key: "packs", match: "/shop/packs", hover: "packsHover" },
  {
    href: "/how-we-grow",
    key: "howWeGrow",
    match: "/how-we-grow",
    hover: "howWeGrowHover",
  },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/** The sections on show: microgreens behind its catalogue switch, the starter
 *  packs while one sells. Both flags come from `Header`, a server component. */
export function visibleNavItems({
  showMicrogreens,
  showPacks,
}: {
  showMicrogreens: boolean;
  showPacks: boolean;
}): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => (showMicrogreens || item.key !== "microgreens") && (showPacks || item.key !== "packs"),
  );
}

/**
 * The `match` of the section the visitor is in, or undefined.
 *
 * `pathname` is the one from `@/i18n/navigation`, without the locale prefix —
 * `/shop` in both languages. `match` is a prefix, so /shop/trays still marks
 * SHOP, and the longest prefix wins: `/shop/packs` is under `/shop` too, and
 * only the starter packs item should be marked there.
 */
export function currentNavMatch(items: readonly NavItem[], pathname: string): string | undefined {
  const matches = (match: string) => pathname === match || pathname.startsWith(`${match}/`);
  return items.filter((item) => matches(item.match)).sort((a, b) => b.match.length - a.match.length)[0]
    ?.match;
}
