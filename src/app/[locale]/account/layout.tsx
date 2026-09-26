import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { AccountTabs } from "./AccountTabs";
import { SideColumn } from "./SideColumn";
import { signOutAction } from "./actions";

/**
 * Account shell — SPEC §12.
 *
 * `requireRole("customer")` reads the role from DynamoDB, so this is a real
 * gate and not hidden UI. Everyone signed in is at least a customer, so staff
 * and admins reach their own account here too — they are customers of the
 * shop as well as operators of it.
 *
 * It is not the only gate: every server action in ./actions.ts asserts for
 * itself, because actions are addressable over HTTP independently of the page
 * whose form submits to them.
 *
 * **This is the only sign-out in the application** (SPEC §18.1). The header
 * carries no sign-out and neither does the admin shell: one predictable place
 * to end a session beats three, and it keeps a destructive control out of the
 * chrome that sits on every page.
 */
export default async function AccountLayout({
  children,
  aside,
  params,
}: LayoutProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireRole("customer");
  const t = await getTranslations("account.shell");

  return (
    <div className="mx-auto max-w-[1000px] px-6 pb-12 pt-6 md:px-10 md:pb-16 md:pt-8 lg:max-w-[1400px] lg:px-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-forest">
          <Link href="/account">{t("title")}</Link>
        </h1>

        <div className="flex flex-wrap items-center gap-4">
          <span className="font-body text-xs text-stone">
            {t("signedInAs", { email: actor.email ?? "" })}
          </span>
          {/* A form, not a link: signing out is a state change, so it must not
              be reachable by a GET that a prefetch or a link scanner could
              trigger. */}
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      </div>

      {/* From `lg` the sections become a column on the right and the page
          fills the left (the owner, 26 Sep 2026). `flex-row-reverse` keeps
          the nav first in the DOM, so it is still reached before the page by
          keyboard and screen reader. Below `lg` it stays a row of tabs on
          top, where a side column would squeeze the page. */}
      <div className="lg:mt-10 lg:flex lg:flex-row-reverse lg:items-start lg:gap-10">
        {/* `aside` is the `@aside` slot: what a page puts above the menu —
            an order's delivery address, and nothing elsewhere. */}
        <SideColumn>
          {aside}
          <AccountTabs />
        </SideColumn>
        <div className="mt-8 min-w-0 lg:mt-0 lg:flex-1">{children}</div>
      </div>
    </div>
  );
}
