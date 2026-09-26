"use client";

import { useTranslations } from "next-intl";
import { CalendarDays, ChevronRight, LayoutGrid, MapPin, Package, UserRound, type LucideIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Account navigation — two presentations of the same five links:
 *
 * - **Below `lg`, a row of pill tabs** on top of the page.
 * - **From `lg`, a menu card in the right-hand column** (see the account
 *   layout): one row per section with an icon, in sentence case, the current
 *   one on a soft sage ground with a chevron. The owner turned down the pills
 *   stacked into a column (26 Sep 2026) — four capsules in a stack read as
 *   four buttons, not as a menu.
 *
 * Two lists rather than one restyled at `lg`, because `.ui-label` (uppercase,
 * tracked) is unlayered CSS that a Tailwind `lg:` utility cannot override.
 * Only one is ever displayed, so a screen reader meets the links once.
 *
 * On one order's page Orders stays lit and is the way back to the list, so
 * the page's own "All orders" link is hidden from `lg` — two links to the same
 * place a few centimetres apart (the owner, 26 Sep 2026).
 *
 * Client-side so the current section can carry `aria-current`. `usePathname`
 * comes from @/i18n/navigation, so it returns the path without the locale
 * prefix — `/account/orders` in both languages. Exact matching on `/account`,
 * prefix matching on the rest, so `/account/orders/123` still lights up
 * Orders while the overview does not light up on every child page.
 */
const TABS: { href: string; key: string; exact: boolean; icon: LucideIcon }[] = [
  { href: "/account", key: "overview", exact: true, icon: LayoutGrid },
  { href: "/account/profile", key: "profile", exact: false, icon: UserRound },
  { href: "/account/addresses", key: "addresses", exact: false, icon: MapPin },
  { href: "/account/orders", key: "orders", exact: false, icon: Package },
  { href: "/account/subscriptions", key: "subscriptions", exact: false, icon: CalendarDays },
];

export function AccountTabs() {
  const t = useTranslations("account.shell");
  const pathname = usePathname();
  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

  return (
    <nav aria-label={t("ariaLabel")}>
      <ul className="-mx-6 mt-6 flex gap-2 overflow-x-auto whitespace-nowrap px-6 md:mx-0 md:px-0 lg:hidden">
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`ui-label inline-block rounded-full border px-4 py-1.5 font-body transition-colors [--label-size:12px] ${
                  active
                    ? "border-forest bg-forest text-cream"
                    : "border-forest/20 text-stone hover:border-forest/40 hover:text-forest"
                }`}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="hidden space-y-1 rounded-2xl border border-forest/15 bg-cream p-2 lg:block">
        {TABS.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 font-body text-sm transition-colors ${
                  active
                    ? "bg-sage/25 font-semibold text-forest"
                    : "font-medium text-stone hover:bg-sand hover:text-forest"
                }`}
              >
                <Icon aria-hidden size={18} strokeWidth={1.75} className={active ? "text-forest" : "text-stone/80"} />
                <span className="flex-1">{t(tab.key)}</span>
                {active && <ChevronRight aria-hidden size={16} strokeWidth={2} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
