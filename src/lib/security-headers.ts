/**
 * Response headers on every page — the ones CloudFront does not already add.
 * cdk-nextjs's response-headers policy sends HSTS, `nosniff`, `X-Frame-Options`
 * and `Referrer-Policy` (infra/README.md, "Without a WAF"); these are the rest.
 *
 * **Content-Security-Policy.** The browser loads scripts, frames and
 * connections only from this site and the two payment gateways. That stops an
 * injected `<script src>` from a foreign host, a page being framed by another
 * site (`frame-ancestors`), `<object>`/`<embed>` (`object-src`), a hijacked
 * `<base>` and a form posting anywhere but here or Google's sign-in.
 *
 * `script-src` still allows `'unsafe-inline'`: Next.js writes inline bootstrap
 * scripts into every page, and the alternative — a per-request nonce — makes
 * every page dynamic and uncacheable at CloudFront. React escapes everything it
 * renders and nothing here uses `dangerouslySetInnerHTML` on user input, so the
 * remaining exposure is small; the host allow-list is the part that matters.
 *
 * The gateway hosts are wildcards because each loads assets, an iframe and
 * telemetry from several subdomains, and they move them. Remove one and
 * checkout fails only in the browser — `security-headers.test.ts` keeps them.
 */

const PAYMENT_HOSTS = ["https://*.razorpay.com", "https://*.cashfree.com"];

/** Google's account chooser: the sign-in form posts to Auth.js, which
 *  redirects there, and Chrome holds a form's redirects to `form-action`. */
const SIGN_IN_HOSTS = ["https://accounts.google.com"];

export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    /* `'unsafe-eval'` only for React's dev overlay and Fast Refresh. */
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...PAYMENT_HOSTS],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...PAYMENT_HOSTS],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : []), ...PAYMENT_HOSTS],
    "frame-src": PAYMENT_HOSTS,
    "worker-src": ["'self'", "blob:"],
    "form-action": ["'self'", ...SIGN_IN_HOSTS, ...PAYMENT_HOSTS],
    "frame-ancestors": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    /* Geolocation for the address form's "use my location" (SPEC §7);
       payment for the gateways' frames; everything else off. */
    {
      key: "Permissions-Policy",
      value:
        'camera=(), microphone=(), usb=(), geolocation=(self), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")',
    },
    /* Isolates the window from pages it did not open; `allow-popups` because
       a gateway may open a bank's page in a popup and needs it to report back. */
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
