import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  /* No `X-Powered-By: Next.js` — it tells a scanner which exploits to try. */
  poweredByHeader: false,

  /* CSP, Permissions-Policy and COOP — src/lib/security-headers.ts. */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },

  /**
   * `content/varieties/*.json` is read at request time with `fs`
   * (src/lib/content/varieties.ts), and Next's dependency tracing only
   * follows static imports. Without this the folder is left out of the
   * serverless bundle and every variety loses its name in production while
   * working perfectly in development — the worst possible failure shape.
   */
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },

  images: {
    /**
     * Storybook plates carry a `?v=<mtime>` so that replacing an illustration
     * in place is actually visible — see `storyImageUrl` in
     * `src/lib/content/story.ts` for the full reasoning. Next blocks a query
     * string on a local image unless the path is listed here, so this is what
     * makes that work.
     *
     * Two entries, not one. Declaring `localPatterns` at all opts every local
     * image into the allow-list, so the second entry is what keeps the
     * varieties, seeds, trays and racks working; without it they 400.
     *
     * The `/img/story/**` entry omits `search`, which allows **any** query string
     * on those thirteen files. That is a real if small trade-off: each
     * distinct `?v=` is a separate entry in the optimizer's cache, so it can
     * be made to grow. It is confined to one folder of static marketing
     * artwork, and `search` only does exact matches, so pinning it would mean
     * listing a literal value per file per swap. Do not widen the pattern
     * beyond `/img/story/`.
     */
    localPatterns: [{ pathname: "/img/story/**" }, { pathname: "/**", search: "" }],
  },
};

/* SPEC §4.4 — wires src/i18n/request.ts into every server render. */
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
