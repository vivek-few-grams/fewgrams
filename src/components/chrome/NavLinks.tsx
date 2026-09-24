"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { onSectionClick } from "@/lib/section-scroll";
import { CURTAIN_ATTR } from "./curtain-anchor";

/**
 * The four persistent nav items — SPEC §18.1.
 *
 * Client-side only so the current section can be marked. That is the one
 * thing persistent navigation gives you that a menu cannot: the visitor can
 * see where they are without opening anything.
 *
 * `usePathname` here comes from @/i18n/navigation, so it returns the path
 * WITHOUT the locale prefix — `/shop` in both languages. `match` is a prefix,
 * so /shop/trays still lights up SHOP.
 */
const ITEMS = [
  {
    href: "/microgreens",
    key: "microgreens",
    match: "/microgreens",
    hover: "microgreensHover",
  },
  /* The only in-page link in the nav: PLANS is a section of the home page,
     not a route (SPEC §18.3). `hash` is what makes it re-scrollable — see
     `onSectionClick`. */
  {
    href: "/#plans",
    key: "plans",
    match: "/plans",
    hash: "plans",
    hover: "plansHover",
  },
  /* `hover` is the word the link grows into under the pointer
     (`.nav-sprout` in globals.css) — the owner's, 24 Sep 2026.

     **A hover word must be no wider than its label, in both languages.** Both
     words share one grid cell, so the link is as wide as the longer one — a
     wider hover word leaves a gap after the label at rest. "Subscribe now"
     did exactly that beside "Weekly plans", and the Kannada "ನಿಮ್ಮದನ್ನು ಆರಿಸಿ"
     beside "ಮೈಕ್ರೋಗ್ರೀನ್ಸ್" (24 Sep 2026). Measure in the browser, not by
     letter count; no test can see it. */
  { href: "/shop", key: "shop", match: "/shop", hover: "shopHover" },
  {
    href: "/how-we-grow",
    key: "howWeGrow",
    match: "/how-we-grow",
    hover: "howWeGrowHover",
  },
] as const;

export function NavLinks({
  showMicrogreens,
}: {
  /** Passed down from `Header`, which is a server component and can read the
   *  switch (`@/lib/catalogue/visibility`) — this one cannot, being client. */
  showMicrogreens: boolean;
}) {
  const t = useTranslations("common.nav");
  const pathname = usePathname();
  const items = showMicrogreens ? ITEMS : ITEMS.filter((item) => item.key !== "microgreens");

  /* Two pieces of vertical bookkeeping, both load-bearing:
       - `pt-1` on each link matches its `pb-0.5 + border-b-2`, so the active
         underline does not make the box bottom-heavy.
       - NO padding on the <nav> itself. A `pb-0.5` here for scrollbar room
         shifted the whole group up by 1px against the utilities beside it,
         which is invisible in isolation and obvious next to the language
         switch. */
  return (
    <nav
      aria-label={t("ariaLabel")}
      /* Identical on mobile and desktop — no hamburger, nothing hidden. On a
         narrow screen it takes its own row under the logo and scrolls
         sideways if it has to, rather than collapsing into a menu.
         `md:ml-auto` is what pushes the whole group to the right-hand side
         on desktop, so the logo owns the left and everything else sits
         together on the right. */
      /* Row 2 of the header grid, in the column beside the logo — so the logo
         can span both rows and stay optically centred in the bar. Scrolls
         sideways inside that column when it has to; `min-w-0` is required or
         the grid column sizes to the nav's full intrinsic width and the bar
         overflows instead of scrolling. */
      className="col-start-2 row-start-2 flex min-w-0 items-center gap-5 overflow-x-auto lg:order-2 lg:ml-auto lg:w-auto lg:overflow-visible"
    >
      {items.map((item) => {
        const active =
          pathname === item.match || pathname.startsWith(`${item.match}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            /* Opts this link into the full-screen brand curtain. These four
               and the language switch are the only links on the site that
               carry it — see `curtain-anchor.ts` for why it is per-link.
               `/#plans` is included and still stays quiet while you are on
               the home page, because the rule also skips a same-pathname
               link. */
            {...{ [CURTAIN_ATTR]: "" }}
            onClick={
              "hash" in item
                ? (event) => onSectionClick(event, item.hash)
                : undefined
            }
            aria-current={active ? "page" : undefined}
            className={`ui-label nav-sprout whitespace-nowrap border-b-2 pb-0.5 pt-1 font-body font-medium transition-colors [--label-size:12px] md:[--label-size:13px] ${
              active
                ? "border-forest text-forest"
                : "border-transparent text-forest/70 hover:text-forest"
            }`}
          >
            {/* The link's name is the first face; the hover word is
                `aria-hidden`, so a screen reader hears one label. */}
            <span className="nav-sprout__inner">
              <span className="nav-sprout__face">{t(item.key)}</span>
              <span
                className="nav-sprout__face nav-sprout__face--back"
                aria-hidden="true"
              >
                {t(item.hover)}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
