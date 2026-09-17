"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { ADMIN_NAV_GROUPS } from "./nav-items";

/**
 * Admin navigation — SPEC §8.2.
 *
 * A client component for one reason: the current route has to be marked, and
 * that needs `usePathname`. `Link` and `usePathname` both come from
 * `@/i18n/navigation`, never `next/link` (CLAUDE.md) — the locale lives in the
 * URL, so a raw import would drop a Kannada operator back into English and
 * would also compare a pathname that still carries `/kn`.
 *
 * **Labels arrive already translated.** The nav renders outside the admin
 * subtree's `NextIntlClientProvider` — that provider wraps `children` only, to
 * keep `admin` messages out of the public bundle — so this component cannot
 * resolve a message key itself. Same pattern as `SeedButton`. The route map
 * lives in `nav-items.ts` rather than here, for the reason given in that file.
 *
 * ## Why a rail and not the pill row it replaces
 *
 * Six pill-shaped tabs in a row already filled the width, and SPEC §12 lists a
 * dozen more admin routes still to come. A row that long either wraps into an
 * unreadable block or scrolls sideways, and neither leaves anywhere to put a
 * grouping. A vertical list grows downward, where an admin shell has room to
 * spare, and it gives the content *more* width rather than less — see the note
 * in `layout.tsx`.
 */
export function AdminNav({
  labels,
  navLabel,
}: {
  /** Message key → translated string, for every key in `ADMIN_NAV_LABELS`. */
  labels: Record<string, string>;
  /** Accessible name for the `<nav>` landmark. */
  navLabel: string;
}) {
  const pathname = usePathname();

  /* `/admin` is a prefix of every other admin route, so it matches exactly and
     everything else matches by prefix — which is what keeps a group item
     highlighted on a detail page like `/admin/orders/123`.
     `/admin/racks` does not match `/admin/angle-racks`, so the two rack
     screens cannot both light up. */
  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <nav aria-label={navLabel} className="lg:mt-2">
      {/* Below `lg` the whole thing is one horizontally scrolling strip: a
          stack of eighteen rows would push the page content off the first
          screen on a phone, which is the opposite of the problem this solves.
          Group headings are hidden there — a heading inside a scrolling strip
          reads as another link. */}
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
        {ADMIN_NAV_GROUPS.map((group, i) => (
          <li key={group.heading ?? `group-${i}`} className="contents lg:block">
            {group.heading && (
              <p className="hidden px-3 pb-1 pt-5 font-body text-[10px] font-semibold uppercase tracking-widest text-stone lg:block">
                {labels[group.heading]}
              </p>
            )}
            <ul className="contents lg:block lg:space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href} className="shrink-0 lg:block">
                    <Link
                      href={item.href}
                      /* The current page is not a link anyone needs to follow,
                         but it stays one so its affordance and focus behaviour
                         match its siblings. `aria-current` is what actually
                         reports it. */
                      aria-current={active ? "page" : undefined}
                      className={`block whitespace-nowrap rounded-lg px-3 py-2 font-body text-sm transition-colors lg:w-full ${
                        active
                          ? "bg-forest font-semibold text-cream"
                          : "text-forest hover:bg-sage/60"
                      }`}
                    >
                      {labels[item.label]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
