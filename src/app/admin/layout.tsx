import Link from "next/link";
import { signOut } from "@/auth";
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

  const tabs = [
    ["Overview", "/admin"],
    ["Varieties", "/admin/varieties"],
    ["Plans", "/admin/plans"],
    ["Products", "/admin/products"],
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="mr-2 font-display text-lg font-bold tracking-tight text-forest"
          >
            Fewgrams admin
          </Link>
          {tabs.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full border border-forest/20 px-4 py-1.5 font-body text-sm text-forest transition-colors hover:bg-forest hover:text-cream"
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-stone">
            {actor.email}
            <span className="ml-2 rounded-full bg-sage px-2 py-0.5 font-semibold text-forest">
              {actor.role}
            </span>
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="font-body text-xs text-stone underline underline-offset-4 hover:text-forest">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
