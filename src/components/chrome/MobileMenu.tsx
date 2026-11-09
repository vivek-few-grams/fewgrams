"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronRight, CircleHelp, Mail, Menu, UserRound, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_LABELS, routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { CURTAIN_ATTR } from "./curtain-anchor";
import { currentNavMatch, visibleNavItems } from "./nav-items";

/**
 * The section links below 1100px — SPEC §18.2, amended 9 Nov 2026.
 *
 * Until then the four links sat in a row under the logo on every width and
 * scrolled sideways on a phone, so "Weekly plans" was cut in half and the
 * rest were off screen. The owner asked for a menu that looks professional,
 * so below 1100px the row becomes this: a button in the bar and a panel that
 * slides in from the right. From 1100px the row is unchanged (`NavLinks`);
 * `Header` says why that width and not `lg`.
 *
 * The panel carries what the bar has no room for on a phone: the language
 * switch (hidden in the bar below `sm`, so a phone had no way to Kannada),
 * the account and the two help pages.
 *
 * - **Rendered on the server, closed.** Every link is in the page's HTML, as
 *   the persistent nav's are — §18.2's objection to the old overlay was that
 *   it rendered on open, so its links were absent from the served page.
 * - **Not a `<dialog>`.** A modal dialog sits in the top layer, above the
 *   brand curtain (z-100), so a section link would leave the panel on screen
 *   over the wipe. A fixed panel inside the header's stacking context (z-70)
 *   sits under it, and the curtain covers both.
 * - **Modal while open:** focus moves to the close button and stays in the
 *   panel, Escape closes it and puts focus back on the button, the page
 *   behind does not scroll, and the panel is `inert` while shut.
 * - **Closed by any navigation**, adjusted during render as `SearchBox` does,
 *   and by the window growing to 1100px, where the row takes over.
 */
export function MobileMenu({
  showMicrogreens,
  showPacks,
  account,
}: {
  showMicrogreens: boolean;
  showPacks: boolean;
  /** Where the account row goes and what it is called — the header's own
   *  `ACCOUNT_STATE`, or null when nobody is signed in. */
  account: { href: string; key: "account" | "admin" } | null;
}) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const items = visibleNavItems({ showMicrogreens, showPacks });
  const current = currentNavMatch(items, pathname);

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [openOn, setOpenOn] = useState(pathname);
  if (openOn !== pathname) {
    setOpenOn(pathname);
    setOpen(false);
  }

  /** Closed by the visitor rather than by a link: focus goes back to the
   *  button that opened it, so a keyboard user is where they were. */
  const dismiss = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    /* The page behind stays put. `overflow` on the root rather than the body:
       the root is what scrolls here. */
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    const wide = matchMedia("(min-width: 1100px)");
    const onWide = () => wide.matches && setOpen(false);
    wide.addEventListener("change", onWide);

    return () => {
      root.style.overflow = before;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const nextLocale = routing.locales.find((l) => l !== locale) ?? locale;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("header.openMenu")}
        aria-expanded={open}
        aria-controls="site-menu"
        /* 40px to tap, pulled out by its own padding so the glyph lines up
           with the bar's edge and sits as far from the account icon as the
           other icons sit from each other. */
        className="-mx-2 grid size-10 shrink-0 place-items-center rounded-full text-forest transition-colors hover:bg-sand min-[1100px]:hidden"
      >
        <Menu size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <div
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label={t("header.menu")}
        inert={!open}
        data-open={open ? "" : undefined}
        /* `invisible` once shut, only after the slide out: the visibility
           transition runs on the way out and not on the way in. Coming in it
           has to be visible at once, or the close button is still hidden when
           the effect focuses it and the focus stays on the menu button. */
        className="group/menu invisible fixed inset-0 z-[80] transition-[visibility] duration-300 data-[open]:visible data-[open]:duration-0 min-[1100px]:hidden"
      >
        {/* The page under it, dimmed. A press on it closes the panel. */}
        <div
          aria-hidden="true"
          onClick={dismiss}
          className="absolute inset-0 bg-forest-deep/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-data-[open]/menu:opacity-100 motion-reduce:transition-none"
        />

        <div
          ref={panelRef}
          className="absolute inset-y-0 right-0 flex w-[min(23rem,88vw)] translate-x-full flex-col bg-white shadow-[-24px_0_48px_-24px_rgba(3,57,35,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[open]/menu:translate-x-0 motion-reduce:transition-none"
        >
          {/* The bar's own height, so the close button lands where the menu
              button was. */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-forest/10 pl-6 pr-4 md:h-20">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              {...{ [CURTAIN_ATTR]: "" }}
              className="flex items-center"
            >
              <Image
                src={brand.logo.src}
                alt={brand.name}
                width={brand.logo.width}
                height={brand.logo.height}
                unoptimized
                className="h-14 w-auto md:h-16"
              />
            </Link>
            <button
              ref={closeRef}
              type="button"
              onClick={dismiss}
              aria-label={t("header.closeMenu")}
              className="grid size-10 place-items-center rounded-full text-forest transition-colors hover:bg-sand"
            >
              <X size={22} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <nav aria-label={t("nav.ariaLabel")}>
              <ul>
                {items.map((item, i) => {
                  const active = item.match === current;
                  return (
                    <li
                      key={item.href}
                      /* Each row follows the panel in, one after another. */
                      style={{ transitionDelay: open ? `${120 + i * 45}ms` : "0ms" }}
                      className="translate-x-6 border-b border-forest/10 opacity-0 transition-[opacity,transform] duration-300 group-data-[open]/menu:translate-x-0 group-data-[open]/menu:opacity-100 motion-reduce:translate-x-0 motion-reduce:transition-none"
                    >
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        {...{ [CURTAIN_ATTR]: "" }}
                        aria-current={active ? "page" : undefined}
                        className="group flex items-center justify-between gap-4 py-[1.125rem] font-display text-[1.375rem] font-semibold leading-tight tracking-tight text-forest"
                      >
                        <span className="flex items-center gap-3">
                          {/* The current section, marked as the bar marks it
                              with its underline. */}
                          <span
                            aria-hidden="true"
                            className={`size-1.5 shrink-0 rounded-full ${active ? "bg-forest" : "bg-transparent"}`}
                          />
                          {t(`nav.${item.key}`)}
                        </span>
                        <ChevronRight
                          size={20}
                          strokeWidth={1.5}
                          aria-hidden="true"
                          className="shrink-0 text-forest/35 transition-transform group-hover:translate-x-0.5 group-hover:text-forest"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <ul className="mt-6 space-y-1">
              <MenuRow
                href={account?.href ?? "/login"}
                icon={<UserRound size={18} strokeWidth={1.75} aria-hidden="true" />}
                label={t(`header.${account?.key ?? "signIn"}`)}
                onNavigate={() => setOpen(false)}
              />
              <MenuRow
                href="/faq"
                icon={<CircleHelp size={18} strokeWidth={1.75} aria-hidden="true" />}
                label={t("footer.faq")}
                onNavigate={() => setOpen(false)}
              />
              <MenuRow
                href="/contact"
                icon={<Mail size={18} strokeWidth={1.75} aria-hidden="true" />}
                label={t("footer.contact")}
                onNavigate={() => setOpen(false)}
              />
            </ul>

            {/* Both languages, each in its own script, the current one
                filled. The other is a link to this same page in it, as the
                bar's switch is (`LocaleSwitch`). Kannada in Noto by its
                `lang`, as `.ui-label:lang(kn)` does: Montserrat has no
                Kannada glyphs. */}
            <div className="mt-8 border-t border-forest/10 pt-6">
              {/* `ui-label`, not `uppercase tracking-widest`: letter-spacing pulls
                  Kannada clusters apart, and the class drops it by `:lang`. */}
              <p className="ui-label font-body text-stone [--label-size:11px]">{t("language.label")}</p>
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-sand p-1">
                {routing.locales.map((l) =>
                  l === locale ? (
                    <span
                      key={l}
                      lang={l}
                      aria-current="true"
                      className="rounded-full bg-forest py-2 text-center font-body text-sm font-semibold text-cream [&:lang(kn)]:font-kannada"
                    >
                      {LOCALE_LABELS[l].full}
                    </span>
                  ) : (
                    <Link
                      key={l}
                      href={pathname}
                      locale={nextLocale}
                      lang={l}
                      onClick={() => setOpen(false)}
                      {...{ [CURTAIN_ATTR]: "" }}
                      aria-label={t("language.switchTo", { language: LOCALE_LABELS[l].full })}
                      className="rounded-full py-2 text-center font-body text-sm font-semibold text-forest transition-colors hover:bg-white [&:lang(kn)]:font-kannada"
                    >
                      {LOCALE_LABELS[l].full}
                    </Link>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MenuRow({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className="-mx-3 flex items-center gap-3 rounded-xl px-3 py-2.5 font-body text-[15px] font-medium text-forest/80 transition-colors hover:bg-sand hover:text-forest"
      >
        <span className="text-forest/60">{icon}</span>
        {label}
      </Link>
    </li>
  );
}
