"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { CURTAIN_ATTR } from "./curtain-anchor";
import { currentNavMatch, visibleNavItems } from "./nav-items";

/**
 * The section links in the bar, from 1100px — SPEC §18.1. Below that the same
 * links are in the menu panel (`MobileMenu`, SPEC §18.2 as amended
 * 9 Nov 2026); the list both read is `nav-items.ts`.
 *
 * Client-side only so the current section can be marked. That is the one
 * thing persistent navigation gives you that a menu cannot: the visitor can
 * see where they are without opening anything.
 */
export function NavLinks({
  showMicrogreens,
  showPacks,
}: {
  /** Passed down from `Header`, which is a server component and can read the
   *  switch (`@/lib/catalogue/visibility`) — this one cannot, being client. */
  showMicrogreens: boolean;
  showPacks: boolean;
}) {
  const t = useTranslations("common.nav");
  const pathname = usePathname();
  const items = visibleNavItems({ showMicrogreens, showPacks });
  const current = currentNavMatch(items, pathname);

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
      /* `display: none` below 1100px (why that width: `Header`), so it is
         out of the accessibility tree there and the menu panel's nav is the
         only "Main" landmark. `ml-auto` is what pushes the whole group to the
         right-hand side, so the logo owns the left and everything else sits
         together on the right. */
      className="hidden min-w-0 items-center gap-5 min-[1100px]:order-2 min-[1100px]:ml-auto min-[1100px]:flex"
    >
      {items.map((item) => {
        const active = item.match === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            /* Opts this link into the full-screen brand curtain. These, the
               menu panel's and the language switch are the only links on the
               site that carry it — see `curtain-anchor.ts` for why it is
               per-link. */
            {...{ [CURTAIN_ATTR]: "" }}
            aria-current={active ? "page" : undefined}
            className={`ui-label nav-sprout whitespace-nowrap border-b-2 pb-0.5 pt-1 font-body font-medium transition-colors [--label-size:13px] ${
              active ? "border-forest text-forest" : "border-transparent text-forest/70 hover:text-forest"
            }`}
          >
            {/* The link's name is the first face; the hover word is
                `aria-hidden`, so a screen reader hears one label. */}
            <span className="nav-sprout__inner">
              <span className="nav-sprout__face">{t(item.key)}</span>
              <span className="nav-sprout__face nav-sprout__face--back" aria-hidden="true">
                {t(item.hover)}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
