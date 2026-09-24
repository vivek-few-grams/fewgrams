import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

/**
 * Proxy — Next.js 16 renamed `middleware.ts` to `proxy.ts` (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * Defaults to the Node.js runtime; setting `runtime` here throws.
 *
 * Two jobs, in this order:
 *
 * 1. **Locale resolution** (SPEC §4.4) — next-intl negotiates the locale from
 *    the path, the cookie and `Accept-Language`, and rewrites so the `[locale]`
 *    segment is always populated.
 * 2. **A signed-out redirect for protected paths.** THIS IS NOT THE SECURITY
 *    BOUNDARY. It checks for the presence of a session cookie and nothing
 *    more — it does not validate the session and does not look at roles. It
 *    exists so a signed-out visitor sees the login page instead of a flash of
 *    an empty admin screen.
 *
 * The real gate is `requireRole()` / `assertRole()` in every protected page and
 * server action (src/lib/auth/guard.ts), per SPEC §8 and the framework's own
 * warning that a matcher change can silently remove proxy coverage.
 */
const intlMiddleware = createIntlMiddleware(routing);

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/** Paths that require a session, written without a locale prefix. */
const PROTECTED = ["/admin", "/staff", "/account", "/checkout"];

/** Split `/kn/admin/varieties` into its locale and the rest. */
function splitLocale(pathname: string) {
  const [, first, ...rest] = pathname.split("/");
  const locales: readonly string[] = routing.locales;
  return locales.includes(first)
    ? { locale: first, path: `/${rest.join("/")}` }
    : { locale: routing.defaultLocale, path: pathname };
}

export function proxy(request: NextRequest) {
  const { locale, path } = splitLocale(request.nextUrl.pathname);

  const isProtected = PROTECTED.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (isProtected && !SESSION_COOKIES.some((n) => request.cookies.has(n))) {
    // Keep the visitor in their language through the round trip.
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const url = new URL(`${prefix}/login`, request.url);
    url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  /* Everything except API routes, Next internals and files with an extension.
     next-intl has to see every page request, not only the protected ones, or
     the `[locale]` segment arrives empty. */
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
