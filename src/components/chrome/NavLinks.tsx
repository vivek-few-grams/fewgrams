"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

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
  { href: "/microgreens", key: "microgreens", match: "/microgreens" },
  /* The only in-page link in the nav: PLANS is a section of the home page,
     not a route (SPEC §18.3). `hash` is what makes it re-scrollable — see
     `onSectionClick`. */
  { href: "/#plans", key: "plans", match: "/plans", hash: "plans" },
  { href: "/shop", key: "shop", match: "/shop" },
  { href: "/how-we-grow", key: "howWeGrow", match: "/how-we-grow" },
] as const;

/**
 * Re-scroll to a section that the URL already points at.
 *
 * The bug this fixes: PLANS worked once and then never again. `/#plans` is a
 * `Link`, so the first click changes the URL and the browser scrolls — but on
 * the second click the URL is *already* `/#plans`, no navigation happens, and
 * nothing scrolls. The visitor scrolls up, clicks PLANS, and the page ignores
 * them.
 *
 * So the click is intercepted **only** when the hash is already current, which
 * leaves the ordinary first click to the router and keeps this to the one case
 * that is broken.
 *
 * `scrollIntoView` honours the section's `scroll-mt-24`, so the sticky header
 * does not cover the heading, and reduced motion drops the smooth scroll —
 * a long animated jump is exactly what §17.4 says to respect.
 */
function onSectionClick(event: React.MouseEvent, hash: string) {
  if (window.location.hash !== `#${hash}`) return;
  const target = document.getElementById(hash);
  if (!target) return;

  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}

export function NavLinks() {
  const t = useTranslations("common.nav");
  const pathname = usePathname();

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
      {ITEMS.map((item) => {
        const active =
          pathname === item.match || pathname.startsWith(`${item.match}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={
              "hash" in item
                ? (event) => onSectionClick(event, item.hash)
                : undefined
            }
            aria-current={active ? "page" : undefined}
            className={`ui-label whitespace-nowrap border-b-2 pb-0.5 pt-1 font-body font-medium transition-colors [--label-size:12px] md:[--label-size:13px] ${
              active
                ? "border-forest text-forest"
                : "border-transparent text-forest/70 hover:text-forest"
            }`}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
