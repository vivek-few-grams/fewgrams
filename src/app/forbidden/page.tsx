import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { currentActor } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Signed in, but without sufficient rank. Deliberately distinct from /login:
 * telling a signed-in user to "sign in" is a dead end they cannot escape.
 */
export default async function ForbiddenPage() {
  const actor = await currentActor();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <span className="grid size-12 place-items-center rounded-full bg-terracotta/10 text-terracotta">
        <ShieldOff size={22} strokeWidth={1.5} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-forest">
        Not your area
      </h1>
      <p className="mt-3 font-body text-sm leading-relaxed text-stone">
        {actor
          ? `You're signed in as ${actor.email ?? "an account"} with the "${actor.role}" role, which doesn't have access to this page.`
          : "You don't have access to this page."}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
        >
          Back to the shop
        </Link>
        <Link
          href="/account"
          className="rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest hover:bg-forest hover:text-cream"
        >
          My account
        </Link>
      </div>
    </div>
  );
}
