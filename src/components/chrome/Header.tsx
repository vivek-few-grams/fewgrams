import Image from "next/image";
import { ShoppingBag, User } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { NavLinks } from "./NavLinks";
import { LocaleSwitch } from "./LocaleSwitch";
import type { Role } from "@/lib/auth/roles";
import { readCartCount } from "@/lib/cart/server";

/**
 * Global header — SPEC §18.1.
 *
 * DECISION (15 Sep 2026): four persistent items, identical on mobile and
 * desktop. No full-screen overlay, no hamburger, nothing behind a click.
 * Reasoning in SPEC §18.2.
 *
 * Layout: the logo owns the left edge, everything else is grouped on the
 * right. On a narrow screen the nav drops to its own row under the logo
 * rather than collapsing into a menu.
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
  staff: {
    href: "/staff",
    tone: "text-forest hover:text-stone",
    dot: "bg-sage",
    key: "staff",
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
  /* Reads the cookie only — no catalogue query, because a count needs no
     names or prices. The badge was a hardcoded "0" until 15 Sep 2026. */
  const cartCount = await readCartCount();

  return (
    <header className="sticky top-0 z-[70] border-b border-forest/10 bg-cream/90 backdrop-blur-md">
      {/* Grid below `lg`, flex from `lg` up. **No vertical padding** — the
          logo's own height is the bar's height, which is what lets the lockup
          fill it rather than float in a padded box. Restores the pre-logo bar
          height exactly: 80px inner, 81px with the border.
          
          The switch is at `lg`, not `md`: between 768 and about 880px the
          single flex row does not fit (logo + nav + utilities + the `ml-12`
          separation), so it wrapped, took the logo off centre again and pushed
          the bar to 125px. The grid handles those widths correctly.

          Why not one wrapping flex row: below that the nav takes its own line
          (SPEC §18.2 — it never collapses into a menu), and in a wrapped flex
          container each line's cross-axis size is its own. So the logo centred
          only within line 1 and sat 16px high in a 109px band, which is exactly
          what it looked like. A grid lets the logo span both rows and centre
          across the whole bar, and it drops the mobile header to ~76px because
          the nav now sits beside the logo rather than under it. */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-[auto_1fr] items-center gap-x-5 gap-y-1.5 px-6 md:px-12 lg:flex lg:flex-wrap lg:gap-x-6 lg:gap-y-2">
        {/* The logo lockup, not the text wordmark. `unoptimized` because the
            source is an SVG: Next's optimiser would need `dangerouslyAllowSVG`
            and has nothing to gain on vector art. Sized by height with `w-auto`
            so the declared 2112x1788 sets the width and nothing shifts on load.

            `alt` carries the brand name because an SVG used via `src` does not
            expose its internal `<title>` to assistive technology — so without
            this the only link to the home page would be unnamed. */}
        <Link
          href="/"
          /* `row-span-2` + `self-center` is the whole point: the logo occupies
             both grid rows and centres across them, so the nav sitting on row 2
             cannot push it upward. */
          className="col-start-1 row-span-2 row-start-1 flex shrink-0 items-center self-center transition-opacity hover:opacity-80 lg:order-1 lg:row-span-1"
        >
          <Image
            src={brand.logo.src}
            alt={brand.name}
            width={brand.logo.width}
            height={brand.logo.height}
            unoptimized
            priority
            className="h-16 w-auto md:h-20"
          />
        </Link>

        <NavLinks />

        {/* `md:ml-12` is the separation between the two groups: navigation on the
            left of it, utilities on the right. Without it the container's own
            gap runs them together and HOW WE GROW reads as a sibling of the
            cart. */}
        <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-4 lg:order-3 lg:ml-12 lg:gap-5">
          <LocaleSwitch />

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
        </div>
      </div>
    </header>
  );
}
