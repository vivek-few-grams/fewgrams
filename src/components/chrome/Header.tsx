import Image from "next/image";
import { ShoppingBag, User } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { CURTAIN_ATTR } from "./curtain-anchor";
import { LocaleSwitch } from "./LocaleSwitch";
import { SearchBox } from "./SearchBox";
import type { Role } from "@/lib/auth/roles";
import { readCartCount } from "@/lib/cart/server";
import { isProductTypeEnabled } from "@/lib/catalogue/visibility";
import { hasActivePacks } from "@/lib/packs/catalogue";

/**
 * Global header — SPEC §18.1.
 *
 * From 1100px the section links sit in the bar, persistent, as decided on
 * 15 Sep 2026 (SPEC §18.2). Below that they are behind a menu button that
 * opens a panel from the right (`MobileMenu`) — the owner, 9 Nov 2026: on a
 * phone the row scrolled sideways under the logo with "Weekly plans" cut in
 * half, which did not look professional.
 *
 * **1100px, not `lg`.** Five links, the utilities and the `ml-12` between
 * them need 1084px in English; from 1024 to 1083 the row wrapped and the bar
 * grew to 121px (since the starter packs gave the nav its fifth item,
 * 30 Oct 2026). Every class in the bar, `NavLinks` and `MobileMenu` switches
 * at the same `min-[1100px]`, so the row never shows where it cannot fit.
 *
 * Layout: the logo owns the left edge, everything else is grouped on the
 * right.
 */

/**
 * Who is signed in, shown by the account icon — SPEC §18.1.
 *
 * Colour alone would fail WCAG 1.4.1, so every state also carries the role in
 * its accessible name, and the destination differs by role rather than being
 * a decoration on a single link.
 */
const ACCOUNT_STATE = {
  admin: {
    href: "/admin",
    tone: "text-terracotta hover:text-terracotta/80",
    dot: "bg-terracotta",
    key: "admin",
  },
  /* No staff pages exist (removed 27 Sep 2026), so a staff sign-in goes to
     its own account like any customer until the delivery run app is built. */
  staff: {
    href: "/account",
    tone: "text-forest hover:text-stone",
    dot: "bg-sage",
    key: "account",
  },
  customer: {
    href: "/account",
    tone: "text-forest hover:text-stone",
    dot: "bg-sage",
    key: "account",
  },
} as const satisfies Record<Role, { href: string; tone: string; dot: string; key: string }>;

export async function Header({
  actor,
}: {
  /** Signed-in user, for rendering only. Authorisation is server-side via
   *  requireRole — SPEC §8. */
  actor: { email: string | null; role: Role } | null;
}) {
  const t = await getTranslations("common.header");
  const account = actor ? ACCOUNT_STATE[actor.role] : null;
  /* The lines the cart page lists, from the same per-request read
     (`cartContents`), so a line gone off sale is not counted here while the
     page leaves it out (7 Nov 2026 — it counted the raw cookie). Lines, the
     cart page's "N items" — not units, which mean 100 g, a pack or a block
     depending on the kind. The badge was a hardcoded "0" until 15 Sep 2026. */
  const cartCount = await readCartCount(await getLocale());
  const showMicrogreens = await isProductTypeEnabled("microgreens");
  /* Only while a pack is set up to sell (SPEC §29). */
  const showPacks = await hasActivePacks();

  return (
    <header className="sticky top-0 z-[70] border-b border-forest/10 bg-white">
      {/* Solid white on every page (the owner, 3 Oct 2026): it was a
          translucent cream, which read as one colour over the cream pages
          and another over the white cart and checkout. */}
      {/* Grid below 1100px, flex from there up. **No vertical padding** — the
          logo's own height is the bar's height, which is what lets the lockup
          fill it rather than float in a padded box. Restores the pre-logo bar
          height exactly: 80px inner, 81px with the border.

          Below 1100px the bar is one row — logo, then the utilities and the
          menu button — since the section links moved into the menu panel
          (9 Nov 2026). Until then they took a second row beside the logo,
          which the logo spanned (`row-span-2`) to stay centred. */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-[auto_1fr] items-center gap-x-5 px-6 md:px-12 min-[1100px]:flex min-[1100px]:flex-wrap min-[1100px]:gap-x-6 min-[1100px]:gap-y-2">
        {/* The logo lockup, not the text wordmark. `unoptimized` because the
            source is an SVG: Next's optimiser would need `dangerouslyAllowSVG`
            and has nothing to gain on vector art. Sized by height with `w-auto`
            so the declared 2112x1788 sets the width and nothing shifts on load.

            `alt` carries the brand name because an SVG used via `src` does not
            expose its internal `<title>` to assistive technology — so without
            this the only link to the home page would be unnamed. */}
        <Link
          href="/"
          /* Opted into the brand curtain (SPEC §17.5.1), on the owner's call
             17 Sep 2026. Going home is a change of section like any of the
             four nav links, and it is the one link the curtain's own artwork
             is a picture of. From the home page it stays quiet anyway — the
             same-pathname rule catches it. */
          {...{ [CURTAIN_ATTR]: "" }}
          className="col-start-1 row-start-1 flex shrink-0 items-center self-center transition-opacity hover:opacity-80 min-[1100px]:order-1"
        >
          <Image
            src={brand.logo.src}
            alt={brand.name}
            width={brand.logo.width}
            height={brand.logo.height}
            unoptimized
            preload
            className="h-16 w-auto md:h-20"
          />
        </Link>

        <NavLinks showMicrogreens={showMicrogreens} showPacks={showPacks} />

        {/* `md:ml-12` is the separation between the two groups: navigation on the
            left of it, utilities on the right. Without it the container's own
            gap runs them together and HOW WE GROW reads as a sibling of the
            cart. */}
        <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-4 min-[1100px]:order-3 min-[1100px]:ml-12 min-[1100px]:gap-5">
          {/* The search pill, from 1200px: first among the shop's tools, where
              people look for search (the owner, 20 Oct 2026 — beside the logo
              it read as part of the brand). 1152px was the first width with
              room for it until the starter packs gave the nav a fifth item
              (30 Oct 2026): from 1152 to about 1180 the bar then wrapped to two
              rows, in both languages. Opens a band under the bar rather than
              being a field in it (SPEC §27.2). */}
          <SearchBox variant="pill" className="hidden min-[1200px]:flex" />

          <LocaleSwitch />

          {/* The magnifier in a dark green circle, below 1200px; above it
              the pill beside the logo takes over (SPEC §27.2). */}
          <SearchBox variant="icon" className="flex min-[1200px]:hidden" />

          <Link
            href="/cart"
            aria-label={cartCount > 0 ? t("cartWithCount", { count: cartCount }) : t("cart")}
            className="relative text-forest hover:text-stone"
          >
            <ShoppingBag size={20} strokeWidth={1.5} />
            {/* Hidden at zero rather than showing "0": a badge reading zero is
                a notification that there is nothing to notify. `aria-hidden`
                because the count is already in the link's accessible name, and
                a bare number read out after "Cart" is noise. */}
            {cartCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-forest px-1 text-[10px] font-semibold tabular-nums text-cream"
              >
                {cartCount}
              </span>
            )}
          </Link>

          <Link
            href={account?.href ?? "/login"}
            aria-label={
              actor && account
                ? t("signedInAs", {
                    label: t(account.key),
                    who: actor.email ?? actor.role,
                  })
                : t("signIn")
            }
            title={actor?.email ?? t("signIn")}
            className={`relative ${account?.tone ?? "text-forest hover:text-stone"}`}
          >
            <User size={20} strokeWidth={1.5} />
            {account && (
              <span
                className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-cream ${account.dot}`}
              />
            )}
          </Link>

          {/* Below 1100px only: the section links, the language and help. */}
          <MobileMenu
            showMicrogreens={showMicrogreens}
            showPacks={showPacks}
            account={account && { href: account.href, key: account.key }}
          />
        </div>
      </div>
    </header>
  );
}
