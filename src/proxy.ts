import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy — Next.js 16 renamed `middleware.ts` to `proxy.ts` (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * Defaults to the Node.js runtime; setting `runtime` here throws.
 *
 * THIS IS NOT THE SECURITY BOUNDARY. It only redirects signed-out visitors so
 * they see a login page instead of a flash of an empty admin screen. It checks
 * for the presence of a session cookie and nothing more — it does not validate
 * the session and does not look at roles.
 *
 * The real gate is `requireRole()` / `assertRole()` in every protected page and
 * server action (src/lib/auth/guard.ts), per SPEC §8 and the framework's own
 * warning that a matcher change can silently remove proxy coverage.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    request.cookies.has(name),
  );

  if (hasSessionCookie) return NextResponse.next();

  const url = new URL("/login", request.url);
  url.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/staff/:path*", "/account/:path*"],
};
