import { llmsTxt } from "@/lib/seo/llms";

/**
 * `/llms.txt` — the site described for AI assistants (SPEC §28.7). Read from
 * the catalogue on each request, and cached for a minute, as long as any
 * price on the site may lag.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await llmsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
