import { User } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";

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

  const tabs = [
    ["overview", "/admin"],
    ["varieties", "/admin/varieties"],
    ["plans", "/admin/plans"],
    ["products", "/admin/products"],
  ] as const;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="mr-2 font-display text-lg font-bold tracking-tight text-forest transition-colors hover:text-stone"
          >
            {t("title")}
          </Link>
          {tabs.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full border border-forest/20 px-4 py-1.5 font-body text-sm text-forest transition-colors hover:bg-forest hover:text-cream"
            >
              {t(label)}
            </Link>
          ))}
        </div>

        {/* Identity and the way out, right-aligned — SPEC §18.1.
            `/admin` has no sign-out of its own, so this link is the only route
            back to the session controls, and it used to be 12px grey underlined
            text sitting beside a grey email: fine print next to fine print.
            It is now a bordered pill with an icon, the same control language as
            the tabs, so it reads as the one actionable thing in this group.

            The email and role stay quiet on purpose — they are context, not
            controls. They are also the wider of the two, so they take the
            `min-w-0` and truncate; a long address must not squeeze the pill. */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="flex min-w-0 items-center gap-2 font-body text-xs text-stone">
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
      </div>

      <div className="mt-8">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </div>
    </div>
  );
}
