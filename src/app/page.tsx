import { Hero } from "@/components/home/Hero";
import { Process } from "@/components/home/Process";
import { Bundles } from "@/components/home/Bundles";
import { OtherProducts } from "@/components/home/OtherProducts";
import { TrustTags } from "@/components/home/TrustTags";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { countsByCategory } from "@/lib/repo/products";
import { listVarieties } from "@/lib/repo/varieties";

/**
 * Home page — SPEC §18.3.
 *
 *   0  Loader        (in layout.tsx)
 *   1  Header        (in layout.tsx)
 *   2  Hero          full-bleed image, headline below, PIN check
 *   3  Our process   the differentiator, deliberately above any pricing
 *   4  Bundles       #plans — the conversion surface, read from DynamoDB
 *   5  Other products racks · trays · seeds · snacks, with live counts
 *   6  Trust tags
 *   7  Footer        (in layout.tsx)
 *
 * `force-dynamic` while the catalogue is being built, so anything added in
 * admin shows up on refresh. Switch to ISR with a revalidate tag once the
 * data settles — SPEC §4.3 notes a DynamoDB read inside a prerendered server
 * component costs nothing per request.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const [plans, counts, varieties] = await Promise.all([
    listPlansWithWeeks({ activeOnly: true }),
    countsByCategory(),
    listVarieties({ activeOnly: true }),
  ]);

  return (
    <>
      <Hero />
      <Process />
      <Bundles plans={plans} varieties={varieties} />
      <OtherProducts counts={counts} />
      <TrustTags />
    </>
  );
}
