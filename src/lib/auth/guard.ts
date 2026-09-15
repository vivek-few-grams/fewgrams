import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasRole, type Role } from "./roles";
import { getUserRole } from "./users";

/**
 * The actual authorisation gate — SPEC §8.
 *
 * Two properties matter here:
 *
 * 1. The role is read from DynamoDB on every call, never from the session or
 *    a token. That is what makes revocation immediate, and it is why adding
 *    email/password later (which would force JWT sessions) changes nothing in
 *    this file.
 *
 * 2. It must be called inside every protected page AND every server action.
 *    `proxy.ts` is not sufficient — the Next.js docs are explicit:
 *
 *      "A matcher change or a refactor that moves a Server Function to a
 *       different route can silently remove Proxy coverage. Always verify
 *       authentication and authorization inside each Server Function rather
 *       than relying on Proxy alone."
 *
 *    The proxy exists for the redirect, not for security.
 */
export type Actor = {
  userId: string;
  email: string | null;
  role: Role;
  /** Whatever the identity provider gave us. The customer's own name lives on
   *  `USER#<id> / PROFILE` and takes precedence wherever both exist — a magic
   *  link supplies neither, so both are nullable. */
  name: string | null;
  image: string | null;
};

/** Current actor, or null when not signed in. Does not redirect. */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const role = await getUserRole(userId);
  if (!role) return null;

  return {
    userId,
    email: session.user.email ?? null,
    role,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
}

/**
 * Require at least `required`. Redirects to /login when signed out, and to
 * /forbidden when signed in without sufficient rank — those are different
 * outcomes and should not be conflated.
 */
export async function requireRole(required: Role): Promise<Actor> {
  const actor = await currentActor();

  if (!actor) {
    // No callbackUrl: a server component cannot reliably know the current
    // path, and src/proxy.ts already supplies one on the normal route. This
    // branch is the backstop for when the proxy's matcher misses.
    redirect("/login");
  }
  if (!hasRole(actor.role, required)) {
    redirect("/forbidden");
  }
  return actor;
}

/**
 * For server actions, where redirecting mid-mutation is the wrong shape —
 * throw instead, so the action fails loudly rather than half-completing.
 */
export async function assertRole(required: Role): Promise<Actor> {
  const actor = await currentActor();
  if (!actor || !hasRole(actor.role, required)) {
    throw new Error(`Forbidden: this action requires the ${required} role`);
  }
  return actor;
}
