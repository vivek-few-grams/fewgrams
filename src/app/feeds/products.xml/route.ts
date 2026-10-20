import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { feedXml } from "@/lib/seo/feed-xml";
import { shoppingFeedItems } from "@/lib/seo/shopping-feed";

/**
 * `/feeds/products.xml` — the shopping feed Merchant Center fetches (SPEC
 * §28.7). Built from the catalogue on each fetch, never at build time: the
 * catalogue is in DynamoDB, which the build does not reach.
 *
 * Cached for a minute, as long as any price on the site may lag.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [seo, items] = await Promise.all([
    getTranslations({ locale: routing.defaultLocale, namespace: "common.seo" }),
    shoppingFeedItems(),
  ]);
  const body = feedXml({ title: brand.name, description: seo("homeDescription") }, items);
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
