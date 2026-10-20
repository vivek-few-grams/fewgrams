import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";

/**
 * `/robots.txt` — where crawlers may go, and where the sitemap is.
 *
 * **Every crawler gets the same rules, AI ones included** (the owner, 20 Oct
 * 2026: allowed, as long as it costs little — a site this size is a few
 * thousand bot page loads a month, inside the free tiers). Search engines,
 * AI search (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and AI training
 * crawlers (GPTBot, ClaudeBot, Google-Extended) all read the `*` group, so
 * there is nothing to list per bot. Blocking one later is a group of its own
 * here.
 *
 * Kept out: pages that are per-person or have nothing to index. Each is also
 * `noindex`; this saves the crawl. Not kept out: `/_next/`, because Google
 * needs the scripts and images to render a page the way a visitor sees it.
 */
const PRIVATE = ["/admin", "/account", "/cart", "/checkout", "/login", "/search", "/subscribe", "/forbidden"];

export default function robots(): MetadataRoute.Robots {
  const prefixes = ["", ...routing.locales.filter((l) => l !== routing.defaultLocale).map((l) => `/${l}`)];
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...prefixes.flatMap((prefix) => PRIVATE.map((path) => `${prefix}${path}`))],
    },
    sitemap: `${brand.url}/sitemap.xml`,
  };
}
