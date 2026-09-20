import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { getSeedByKey } from "@/lib/repo/seeds";
import { getSeedContent, seedCutout, seedHero, seedImageUrl } from "@/lib/content/seeds";
import { DetailPage } from "@/components/catalogue/DetailPage";
import { AddToCart } from "@/components/catalogue/AddToCart";
import type { Shot } from "@/components/catalogue/Gallery";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { readCartUnitsFor } from "@/lib/cart/server";
import { formatDeliveryDate } from "@/lib/delivery-date";
import {
  SEED_MIN_ORDER_GRAMS,
  SEED_VENDOR_LEAD_DAYS,
  seedReadyDate,
  seedSourcing,
} from "@/lib/seeds/stock";

/**
 * /seeds/[key] — SPEC §22.5. The seed detail page.
 *
 * The **same layout as a variety** (`@/components/catalogue/DetailPage`), on
 * the owner's instruction: *"each seed will have its own description like
 * microgreens. We can reuse the entire template of microgreen details page to
 * show the seeds information."* What differs is what fills it — a seed's spec
 * table where a variety has nutrition, how to sow it where a variety has
 * growing tips, and what it is for where a variety has nutrient functions.
 *
 * Every word comes from `content/seeds/<key>.json` (SPEC §4.3) and both
 * numbers from the DynamoDB row. Two independent lookups have to succeed, the
 * same three-way test the grid applies:
 *
 * | Missing | Result | Why |
 * |---|---|---|
 * | DynamoDB row | 404 | Nothing sets a price, so it is not sold |
 * | Row is inactive | 404 | Withdrawn from sale; a live page would take orders |
 * | Content file | 404 | Cannot be named, so cannot be described |
 *
 * **Stock is not one of them, and since 17 Sep 2026 it is not on the page
 * either.** A seed we hold none of keeps its page, its copy, its price and its
 * stepper: seed is re-orderable, so an empty shelf changes the date rather than
 * the availability (SPEC §22.2). What it changes is one line in the buy box —
 * which is computed per quantity, because the same seed can be a next-day order
 * at 100 g and a vendor order at 900 g.
 *
 * The grams we hold appear nowhere on this page. That is the owner's
 * instruction and it is also the honest choice: the figure is an internal one,
 * it moves whenever a sack is opened, and printing it would invite the reader
 * to treat it as a limit.
 */
export const dynamic = "force-dynamic";

async function load(key: string, locale: string) {
  /* Both reads are cheap and independent, so they run together rather than
     gating the file read on the row. `getSeedContent` is `cache`d per request,
     so generateMetadata and the page share one file read. */
  const [row, content] = await Promise.all([
    getSeedByKey(key),
    getSeedContent(key, locale),
  ]);
  return row?.active && content ? { row, content } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/seeds/[key]">) {
  const { locale, key } = await params;
  const found = await load(key, locale);
  if (!found) return {};

  const { text } = found.content;
  return {
    title: text.name,
    description: text.shortDescription ?? text.description,
    alternates: localeAlternates(`/seeds/${key}`),
  };
}

export default async function SeedPage({ params }: PageProps<"/[locale]/seeds/[key]">) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("seeds", locale);

  const found = await load(key, locale);
  if (!found) notFound();
  const { row, content } = found;
  const { text } = content;

  const t = await getTranslations("seeds");
  const d = await getTranslations("seeds.detail");
  const e = await getTranslations("seeds.detail.errors");

  const hero = seedHero(content);
  /* Second shot: the same cutout the /seeds grid tile shows, so a buyer who
     followed the packet-and-scatter photo in from the list sees it again here
     rather than only the flat hero. */
  const cutout = seedCutout(content);
  const inCart = await readCartUnitsFor("seed", row.contentKey);
  const shots: Shot[] = [
    ...(hero ? [hero] : []),
    ...(cutout ? [cutout] : []),
    ...(content.images.gallery ?? []).map((file) => ({
      src: seedImageUrl(content.key, file),
      alt: d("galleryAlt", { name: text.name }),
    })),
  ];

  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";

  /**
   * The delivery promise, one line per quantity the stepper can reach.
   *
   * **Pre-formatted for every reachable quantity**, like the totals below it: a
   * client component cannot call `getTranslations`, and the date has to be
   * formatted by Intl in the resolved locale rather than concatenated on the
   * client. Twenty strings is a rounding error next to the page's copy.
   *
   * This is the only place the shelf figure has any effect on what a customer
   * sees, and it is expressed as a date rather than a quantity — so the reader
   * learns when their order arrives, not how much seed is in the building.
   */
  const dispatch = Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) => {
    const grams = (i + 1) * SEED_MIN_ORDER_GRAMS;
    const sourcing = seedSourcing(grams, row.stockGrams);
    const date = formatDeliveryDate(seedReadyDate(sourcing), dateLocale);
    return sourcing === "shelf" ? d("dispatchShelf", { date }) : d("dispatchVendor", { date });
  });

  return (
    <DetailPage
      back={{ href: "/seeds", label: d("back") }}
      name={text.name}
      shortDescription={text.shortDescription}
      gallery={{
        shots,
        thumbLabels: shots.map((_, i) => d("thumb", { n: i + 1, total: shots.length })),
        prevLabel: d("prevPhotos"),
        nextLabel: d("nextPhotos"),
      }}
      /* The smallest order, and how the seed reaches you — the two facts a
         seed buyer needs before the price, which lives in the buy box below.
         The price is deliberately not repeated here: two copies of one number
         on one screen is where they start disagreeing (SPEC §18.10).

         The second fact is the *policy*, undated and the same for everyone.
         The dated version for the quantity actually chosen is one line further
         down, in the buy box, because that is where the quantity is decided. */
      facts={[
        {
          label: d("minLabel"),
          value: d("min", { grams: SEED_MIN_ORDER_GRAMS }),
        },
        {
          label: d("dispatchLabel"),
          value: d("dispatchFact"),
          note: d("dispatchNote", { days: SEED_VENDOR_LEAD_DAYS }),
        },
      ]}
      buy={
        <AddToCart
          kind="seed"
          contentKey={row.contentKey}
          /* No stock ceiling. The only cap left is the per-line wholesale one,
             which greens carry identically (SPEC §22.2). */
          max={MAX_UNITS_PER_LINE}
          inCart={inCart}
          labels={{
            quantity: d("quantity"),
            decrease: d("decrease"),
            increase: d("increase"),
            add: d("addToCart"),
            update: d("updateCart"),
            added: d("added"),
            updated: d("updated"),
            viewCart: d("viewCart"),
            dispatch,
            /* Pre-formatted for every reachable quantity: a client component
               cannot call `getTranslations`, and currency formatting belongs
               to Intl via the message file rather than to concatenation on the
               client. The full line is generated rather than only `packs` of
               it, so the array's indices do not shift when stock changes. */
            totals: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
              d("lineTotal", { total: (i + 1) * row.pricePer100g }),
            ),
            breakdowns: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
              d("lineBreakdown", {
                grams: (i + 1) * SEED_MIN_ORDER_GRAMS,
                price: row.pricePer100g,
              }),
            ),
            note: d("buyNote"),
            errors: {
              unitsInvalid: e("unitsInvalid"),
              notSellable: e("notSellable"),
              cartFull: e("cartFull"),
              generic: e("generic"),
            },
          }}
        />
      }
      /* No `aside`: a seed has no flavour to describe before it is sown, so
         the slot the variety page fills with tasting notes stays empty rather
         than being padded with something else. */
      description={text.description}
      table={
        text.specs?.length
          ? {
              heading: d("specs"),
              colLabel: d("colSpec"),
              colValue: d("colValue"),
              rows: text.specs,
              note: text.specsNote,
            }
          : null
      }
      list={
        text.uses?.length
          ? {
              heading: d("uses"),
              columnLabel: d("colUse"),
              items: text.uses,
              /* No regulatory note here, unlike a variety's nutrient
                 functions: a seed sold for sowing makes no health claim to
                 qualify. */
            }
          : null
      }
      cautions={
        text.cautions?.length ? { heading: d("cautions"), items: text.cautions } : null
      }
      prose={text.sowing ? { heading: d("sowing"), body: text.sowing } : null}
      faq={text.faq?.length ? { heading: d("faq"), items: text.faq } : null}
      footer={
        <>
          {t("growPrompt")}{" "}
          <Link href="/microgreens" className="text-forest underline underline-offset-4">
            {t("growLink")}
          </Link>
          .
        </>
      }
    />
  );
}
