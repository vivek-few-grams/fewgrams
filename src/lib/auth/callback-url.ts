/**
 * The page to land on after signing in, taken from `?callbackUrl=` — or `/`
 * when it is anything but a path on this site.
 *
 * Auth.js already refuses a foreign `redirectTo`, but the login page also
 * redirects on its own (an already signed-in visitor, a refused email link),
 * and next-intl's `redirect` passes an absolute URL straight through. Without
 * this, `/login?callbackUrl=https://evil.example` bounced a signed-in visitor
 * to a look-alike site from our own domain — an open redirect, a phishing aid.
 *
 * Resolving against a dummy origin catches every spelling of "elsewhere" —
 * `//evil`, `/\evil`, `https:evil`, a tab or newline smuggled into the scheme —
 * because the browser's URL parser is the one that decides, not a regex.
 */
export function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  const base = "https://callback.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return "/";
  }
  if (url.origin !== base) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
