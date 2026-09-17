import { User } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { AdminNav } from "./AdminNav";
import { ADMIN_NAV_LABELS } from "./nav-items";

/**
 * Admin shell — SPEC §8.
 *
 * `requireRole("admin")` here reads the role from DynamoDB, so it is a real
 * gate and not hidden UI. It runs for every admin page because layouts wrap
 * their segment.
 *
 * It is NOT the only gate: each server action calls `assertRole` as well. The
 * Next.js docs warn that a route move can silently remove proxy coverage, and
 * the same reasoning applies to a page that forgets to call this — server
 * actions are directly addressable over HTTP.
 *
 * ## Layout: a left rail, not a row of tabs
 *
 * Navigation was a horizontal row of pills until 17 Sep 2026. Six of them
 * already filled the width and SPEC §12 lists a dozen more admin routes to
 * come, so the row had nowhere to grow and no room for a grouping. It is now a
 * 14rem rail — see `AdminNav` for why, and for how it collapses to a scrolling
 * strip below `lg`.
 *
 * The measure went from 1100px to 1400px with the change, so the content is
 * **wider** than it was despite losing 14rem to the rail. The rack tables are
 * the widest thing in here at about 990px of tracks (SPEC §19.3) and they now
 * fit without the horizontal scroll they used to need.
 *
 * `min-w-0` on the content column is what makes that hold. Without it a flex
 * child refuses to shrink below its content, so a table's own
 * `overflow-x-auto` never engages — it widens the whole page instead, and the
 * rail goes with it.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireRole("admin");
  const t = await getTranslations("admin.shell");

  /* The root layout strips `admin` from the client catalogue so it never
     reaches a customer's browser; this puts it back for the admin subtree,
     which is where the client components that need it live. */
  const messages = await getMessages();

  /* Resolved here and passed down: `AdminNav` renders outside the provider
     below, so it cannot look up a key itself. */
  const labels = Object.fromEntries(ADMIN_NAV_LABELS.map((key) => [key, t(key)]));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col px-6 py-8 md:px-8 lg:flex-row lg:gap-8 lg:py-10">
      {/* `sticky` with `self-start` keeps the rail in view down a long orders
          table without stretching it to the page's full height. */}
      <aside className="lg:sticky lg:top-8 lg:flex lg:h-[calc(100vh-4rem)] lg:w-56 lg:shrink-0 lg:flex-col lg:self-start">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-forest transition-colors hover:text-stone"
        >
          {t("title")}
        </Link>

        <AdminNav labels={labels} navLabel={t("navLabel")} />

        {/* Identity and the way out — SPEC §18.1. Pushed to the foot of the
            rail on `lg`: it is the least-used control here, so the top of the
            rail belongs to the routes.

            The email and role stay quiet on purpose — they are context, not
            controls. They take the `min-w-0` and truncate, because a long
            address must not squeeze the pill beside it. */}
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 border-t border-forest/12 pt-4 lg:mt-auto lg:flex-col lg:items-start lg:gap-2">
          <span className="flex min-w-0 max-w-full items-center gap-2 font-body text-xs text-stone">
            <span className="truncate">{actor.email}</span>
            <span className="shrink-0 rounded-full bg-sage px-2 py-0.5 font-semibold text-forest">
              {actor.role}
            </span>
          </span>
          {/* Sign-out deliberately lives only on /account (SPEC §18.1). One
              predictable place to end a session beats three, and an admin is
              a customer of the shop as well as an operator of it. */}
          <Link
            href="/account"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-forest/20 bg-sand px-4 py-1.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
          >
            <User size={15} strokeWidth={1.75} />
            {t("account")}
          </Link>
        </div>
      </aside>

      {/* `min-w-0` is load-bearing — see the note in this file's doc comment. */}
      <main className="mt-6 min-w-0 flex-1 lg:mt-0">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </main>
    </div>
  );
}
