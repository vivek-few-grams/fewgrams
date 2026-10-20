/**
 * One block of structured data — see `src/lib/seo/structured-data.ts`.
 *
 * A plain `<script>`, not `next/script`: it is data, not code to run
 * (node_modules/next/dist/docs/01-app/02-guides/json-ld.md). `<` is escaped
 * because `JSON.stringify` leaves it alone, and a product name or description
 * containing `</script>` would otherwise close the tag and run whatever came
 * after it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
