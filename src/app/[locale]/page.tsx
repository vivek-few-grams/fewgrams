import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Hero } from "@/components/home/Hero";
import { Process } from "@/components/home/Process";
import { Bundles } from "@/components/home/Bundles";
import { OtherProducts } from "@/components/home/OtherProducts";
import { TrustTags } from "@/components/home/TrustTags";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { countsByCategory } from "@/lib/repo/products";
import { listVarieties } from "@/lib/repo/varieties";
import { varietyNameMap } from "@/lib/content/varieties";
import { attachPlanContent } from "@/lib/content/plans";
import { currentActor } from "@/lib/auth/guard";

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

export async function generateMetadata() {
  return { alternates: localeAlternates("/") };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [rows, counts, varieties] = await Promise.all([
    listPlansWithWeeks({ activeOnly: true }),
    countsByCategory(),
    listVarieties({ activeOnly: true }),
  ]);

  /* Rotation weeks reference varieties by contentKey, and the name lives in
     content/varieties/<key>.json rather than in DynamoDB (SPEC §4.3), so the
     page resolves the labels and hands Bundles a plain map. */
  const varietyNames = await varietyNameMap(locale);

  /* Plan copy comes from content/plans/<key>.json for the same reason. A plan
     whose file does not exist yet is **skipped**, not rendered nameless — the
     admin screen is where that gets reported, in red, with the path. */
  const withContent = await attachPlanContent(
    rows.map(({ plan, weeks }) => ({ ...plan, weeks })),
    locale,
  );
  const plans = withContent
    .filter((p) => p.content !== null)
    .map(({ weeks, content, ...plan }) => ({ plan, weeks, text: content!.text }));

  /* The empty plans panel used to tell every visitor to "create Essential,
     Exotic or Build Your Own" and offered a button into /admin/plans. The
     operator copy is resolved here and only when the viewer is an admin, so a
     customer's HTML never carries it — the `admin` namespace is kept out of
     the client catalogue on purpose (CLAUDE.md). */
  const actor = await currentActor();
  const ta = await getTranslations("admin.publicEmpty");
  const adminEmpty =
    plans.length === 0 && actor?.role === "admin"
      ? {
          title: ta("plansTitle"),
          body: ta("plansBody"),
          cta: ta("plansCta"),
        }
      : null;

  return (
    <>
      <Hero />
      <Process />
      <Bundles
        plans={plans}
        varieties={varieties}
        varietyNames={varietyNames}
        adminEmpty={adminEmpty}
      />
      <OtherProducts counts={counts} />
      <TrustTags />
    </>
  );
}
