"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
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
 *
 * ## Groups fold
 *
 * Downward ran out too: twenty rows under five headings outgrew the window,
 * and the last ones sat under the footer (the owner, 18 Oct 2026). Each
 * heading now opens and closes its group. The group holding the current page
 * opens by itself — derived from the path, not stored, so following a link
 * into another group opens that one — and a heading pressed open or shut
 * stays that way while the rail is on screen (it lives in the layout, so it
 * survives navigation). Desktop only.
 *
 * ## Below `lg`, one dropdown
 *
 * It was a sideways-scrolling strip of every link, and with twenty of them
 * the current screen was off the edge from Racks onward — nothing on a phone
 * said where you were (9 Nov 2026). Now it is a single `<select>` showing the
 * current screen, with every screen in it under its group heading, and
 * choosing one goes there. Admin needs JavaScript for every form anyway, so a
 * select that navigates on change loses nothing.
 *
 * Top-level rows — Overview and the group headings — are set larger and
 * bolder than the screens inside a group, and an open group sits on a sand
 * panel, so a submenu reads as one (the owner, 18 Oct 2026).
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
  const router = useRouter();

  /* `/admin` is a prefix of every other admin route, so it matches exactly and
     everything else matches by prefix — which is what keeps a group item
     highlighted on a detail page like `/admin/orders/123`.
     `/admin/racks` does not match `/admin/angle-racks`, so the two rack
     screens cannot both light up. */
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  const current = ADMIN_NAV_GROUPS.find((g) => g.items.some((i) => isActive(i.href)))?.heading;
  /* Only the headings someone has pressed; the rest follow the current page. */
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const isOpen = (heading: string) => pressed[heading] ?? heading === current;
  const here = ADMIN_NAV_GROUPS.flatMap((g) => g.items).find((i) => isActive(i.href))?.href;

  return (
    <nav aria-label={navLabel} className="lg:mt-2">
      <div className="relative mt-3 lg:hidden">
        <select
          aria-label={navLabel}
          value={here ?? ""}
          onChange={(e) => router.push(e.target.value)}
          className="w-full appearance-none rounded-xl border border-forest/20 bg-white py-3 pl-4 pr-11 font-body text-[15px] font-semibold text-forest outline-none focus:border-forest"
        >
          {!here && <option value="" disabled />}
          {ADMIN_NAV_GROUPS.map((group, i) =>
            group.heading ? (
              <optgroup key={group.heading} label={labels[group.heading]}>
                {group.items.map((item) => (
                  <option key={item.href} value={item.href}>
                    {labels[item.label]}
                  </option>
                ))}
              </optgroup>
            ) : (
              group.items.map((item) => (
                <option key={`${i}-${item.href}`} value={item.href}>
                  {labels[item.label]}
                </option>
              ))
            ),
          )}
        </select>
        <ChevronDown
          aria-hidden
          size={18}
          strokeWidth={2}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-forest"
        />
      </div>

      <ul className="hidden lg:flex lg:flex-col">
        {ADMIN_NAV_GROUPS.map((group, i) => (
          <li key={group.heading ?? `group-${i}`} className="contents lg:block">
            {group.heading && (
              <button
                type="button"
                aria-expanded={isOpen(group.heading)}
                aria-controls={`admin-nav-${group.heading}`}
                onClick={() => setPressed((p) => ({ ...p, [group.heading!]: !isOpen(group.heading!) }))}
                className="mt-1 hidden w-full items-center justify-between rounded-lg px-3 py-2.5 font-body text-[15px] font-semibold text-forest transition-colors hover:bg-sage/60 lg:flex"
              >
                {labels[group.heading]}
                <ChevronDown
                  aria-hidden
                  size={16}
                  strokeWidth={2}
                  className={`transition-transform ${isOpen(group.heading) ? "rotate-180" : ""}`}
                />
              </button>
            )}
            <ul
              id={group.heading ? `admin-nav-${group.heading}` : undefined}
              className={`contents lg:block lg:space-y-0.5 ${
                group.heading
                  ? `lg:mt-0.5 lg:rounded-xl lg:bg-sand lg:p-1.5 ${isOpen(group.heading) ? "" : "lg:hidden"}`
                  : ""
              }`}
            >
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
                        group.heading ? "lg:pl-4" : "lg:py-2.5 lg:text-[15px] lg:font-semibold"
                      } ${active ? "bg-forest font-semibold text-cream" : "text-forest hover:bg-sage/60"}`}
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
