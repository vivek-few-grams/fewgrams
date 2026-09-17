"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { CURTAIN_ATTR } from "./curtain-anchor";

/**
 * Language switch — SPEC §4.4 and §18.1.
 *
 * Two locales, so this is a toggle rather than a dropdown: it shows the
 * language you are **not** in, which is what makes a single tap unambiguous.
 * Each language is written in its own script — a picker that translates
 * language names is harder to use, not easier.
 *
 * `usePathname` from @/i18n/navigation returns the path without the locale
 * prefix, so the switch keeps you on the page you are reading instead of
 * dropping you at the home page.
 */
export function LocaleSwitch() {
  const t = useTranslations("common.language");
  const pathname = usePathname();
  const params = useParams();
  const current = (params.locale as Locale) ?? routing.defaultLocale;
  const next = routing.locales.find((l) => l !== current) ?? current;

  return (
    <Link
      href={pathname}
      locale={next}
      /* Opted into the brand curtain, and the one link that most needs it:
         switching language is a full document load, so without the curtain
         the page blanks and cuts in. It is also the case the `sessionStorage`
         handoff in `PageLoader` exists for. */
      {...{ [CURTAIN_ATTR]: "" }}
      aria-label={t("switchTo", { language: LOCALE_LABELS[next].full })}
      title={t("switchTo", { language: LOCALE_LABELS[next].full })}
      className="hidden items-center gap-1.5 font-body font-medium leading-none text-stone [--label-size:13px] transition-colors hover:text-forest sm:inline-flex"
    >
      <Globe size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
      {/* `.ui-label` neutralises the uppercase/tracking treatment and fixes
          the line-box mismatch when the label is Kannada — see globals.css.
          The switch always shows the *other* language, so this span is
          Kannada exactly when the page is English, which is why it cannot
          rely on the page's own `:lang`. */}
      <span
        lang={next}
        className="ui-label"
      >
        {LOCALE_LABELS[next].short}
      </span>
    </Link>
  );
}
