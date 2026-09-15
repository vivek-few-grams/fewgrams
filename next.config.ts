import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

/* SPEC §4.4 — wires src/i18n/request.ts into every server render. */
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
