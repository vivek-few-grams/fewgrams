"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Account navigation.
 *
 * Client-side so the current section can carry `aria-current`. `usePathname`
 * comes from @/i18n/navigation, so it returns the path without the locale
 * prefix — `/account/orders` in both languages.
 *
 * Exact matching on `/account`, prefix matching on the rest, so
 * `/account/orders/123` still lights up ORDERS while the overview does not
 * light up on every child page.
 */
const TABS = [
  { href: "/account", key: "overview", exact: true },
  { href: "/account/profile", key: "profile", exact: false },
  { href: "/account/addresses", key: "addresses", exact: false },
  { href: "/account/orders", key: "orders", exact: false },
] as const;

export function AccountTabs() {
  const t = useTranslations("account.shell");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("ariaLabel")}
      className="-mx-6 mt-6 overflow-x-auto px-6 md:mx-0 md:px-0"
    >
      <ul className="flex gap-2 whitespace-nowrap">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
    </nav>
  );
}
