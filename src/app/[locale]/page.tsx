import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Hero } from "@/components/home/Hero";
import { Process } from "@/components/home/Process";
import { Bundles } from "@/components/home/Bundles";
import { OtherProducts } from "@/components/home/OtherProducts";
import { TrustTags } from "@/components/home/TrustTags";
import { TopSeeds } from "@/components/home/TopSeeds";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { categoryCounts } from "@/lib/catalogue/counts";
import { enabledCategories, isProductTypeEnabled } from "@/lib/catalogue/visibility";
import { listVarieties } from "@/lib/repo/varieties";
import { varietyNameMap } from "@/lib/content/varieties";
import { listSeeds } from "@/lib/repo/seeds";
import { attachSeedContent, seedNameMap } from "@/lib/content/seeds";
import { seedGramsSold } from "@/lib/repo/orders";
import { rankBySales } from "@/lib/seeds/best-sellers";
import { listTrays } from "@/lib/repo/trays";
import { trayNameMap } from "@/lib/content/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { growMediumNameMap } from "@/lib/content/grow-media";
import { GROW_MEDIA_TILE_WORDS } from "@/lib/shop";
import { RACK_RANGES } from "@/lib/racks/cart-key";
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
 *   6  Top seeds     five best sellers, arrow to /seeds
 *   7  Trust tags    the closing note, just above the footer
 *   8  Footer        (in layout.tsx)
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

  const [rows, counts, varieties, categories, microgreensOn, seeds, trays, media, seedsOn, gramsSold] =
    await Promise.all([
      listPlansWithWeeks({ activeOnly: true }),
      categoryCounts(),
      listVarieties({ activeOnly: true }),
      enabledCategories(),
      isProductTypeEnabled("microgreens"),
      listSeeds({ activeOnly: true }),
      listTrays({ activeOnly: true }),
      listGrowMedia({ activeOnly: true }),
      isProductTypeEnabled("seeds"),
      seedGramsSold(),
    ]);

  /* Rotation weeks reference varieties by contentKey, and the name lives in
     content/varieties/<key>.json rather than in DynamoDB (SPEC §4.3), so the
     page resolves the labels and hands Bundles a plain map. */
  const varietyNames = await varietyNameMap(locale);

  /* Same "the real names, not the category label twice" word clouds as
     `/shop` (CLAUDE.md's marquee rules) — the two surfaces show the same
     shelf, so they read the same. */
  const [seedNameById, trayNameById, mediumNameById] = await Promise.all([
    seedNameMap(locale),
    trayNameMap(locale),
    growMediumNameMap(locale),
  ]);
  const rackRanges = await getTranslations({ locale, namespace: "shop.racks.ranges" });
  const microgreenNames = varieties
    .map((v) => varietyNames[v.contentKey])
    .filter((name): name is string => Boolean(name));
  const rackRangeNames = RACK_RANGES.map((range) => rackRanges(`${range}.name`));
  const seedNames = seeds
    .map((s) => seedNameById[s.contentKey])
    .filter((name): name is string => Boolean(name));
  const trayItemNames = trays
    .map((tr) => trayNameById[tr.contentKey])
    .filter((name): name is string => Boolean(name));
  /* Not the product names, unlike the other tiles: two long names
     ("Horti-Coir cocopeat — 10 kg block") make a sparse cloud, and the
     category is about the medium rather than a brand. Properties of coir
     instead — labels, never a claim or a tuned figure (CLAUDE.md, marquee
     rules). Still empty when nothing is on sale, like every other tile. */
  const growMediaWords = await getTranslations({ locale, namespace: "shop.growMedia.tileWords" });
  const mediumNames =
    media.some((m) => mediumNameById[m.contentKey])
      ? GROW_MEDIA_TILE_WORDS.map((w) => growMediaWords(w))
      : [];

  /* The seed strip above the footer (the owner, 25 Sep 2026): the five that
     sell the most grams, filled out from the /seeds grid order — by name, in
     this locale — while nothing has sold. A seed with no content file is
     skipped, as on /seeds. */
  const seedCollator = new Intl.Collator(locale, { sensitivity: "base" });
  const shelf = seedsOn
    ? (await attachSeedContent(seeds, locale))
        .filter((s): s is (typeof seeds)[number] & { content: NonNullable<typeof s.content> } => s.content !== null)
        .sort((a, b) => seedCollator.compare(a.content.text.name, b.content.text.name))
    : [];
  const topSeeds = rankBySales(shelf, gramsSold, 5);
  const seedsRanked = topSeeds.some((s) => (gramsSold[s.contentKey] ?? 0) > 0);

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
      <OtherProducts
        counts={counts}
        categories={categories}
        microgreensOn={microgreensOn}
        varietyCount={varieties.length}
        microgreenNames={microgreenNames}
        rackRangeNames={rackRangeNames}
        seedNames={seedNames}
        trayItemNames={trayItemNames}
        mediumNames={mediumNames}
      />
      <TopSeeds seeds={topSeeds} ranked={seedsRanked} />
      <TrustTags />
    </>
  );
}
