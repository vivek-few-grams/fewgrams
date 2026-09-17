import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { getVarietyByKey } from "@/lib/repo/varieties";
import {
  getVarietyContent,
  varietyHero,
  varietyImageUrl,
} from "@/lib/content/varieties";
import { DetailPage } from "@/components/catalogue/DetailPage";
import { AddToCart } from "@/components/catalogue/AddToCart";
import type { Shot } from "@/components/catalogue/Gallery";
import { adhocReadyDate, formatDeliveryDate } from "@/lib/delivery-date";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { readCartUnitsFor } from "@/lib/cart/server";

/**
 * /microgreens/[key] — SPEC §12 and §18.6. The variety detail page.
 *
 * Every word here comes from `content/varieties/<key>.json` (SPEC §4.3) and
 * every number from the DynamoDB row. The page renders the *whole* content
 * contract — all eleven fields — because the contract exists precisely so a
 * variety cannot be half-written: if a field is required in the file, it has
 * somewhere to show up.
 *
 * **The layout itself lives in `@/components/catalogue/DetailPage`** (17 Sep
 * 2026), shared with `/seeds/[key]`. This file is the part that is specific to
 * a variety: which two lookups have to succeed, which facts lead, and which
 * message namespace the labels come from.
 *
 * **The URL segment is the content key, not the id.** `red-amaranthus` is
 * readable, shareable and stable across a display-name change; the UUID is an
 * internal key nobody needs to see.
 *
 * Two independent lookups both have to succeed:
 *
 * | Missing | Result | Why |
 * |---|---|---|
 * | DynamoDB row | 404 | Nothing sets a price, so it is not sold |
 * | Row is inactive | 404 | Withdrawn from sale; a live page would take orders |
 * | Content file | 404 | Cannot be named, so cannot be described |
 *
 * That mirrors the grid, which skips the same rows — a variety is never
 * linked from one surface and dead on the other.
 *
 * **The sow rule here is the one-off rule, not the weekly cycle.** An ad-hoc
 * order is sown the next morning and cut `growDays` later; only subscriptions
 * wait for the Sunday sow. See `src/lib/delivery-date.ts`.
 */
export const dynamic = "force-dynamic";

async function load(key: string, locale: string) {
  /* Both reads are cheap and independent, so they run together rather than
     gating the file read on the row. `getVarietyContent` is `cache`d per
     request, so generateMetadata and the page share one file read. */
  const [row, content] = await Promise.all([
    getVarietyByKey(key),
    getVarietyContent(key, locale),
  ]);
  return row?.active && content ? { row, content } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/microgreens/[key]">) {
  const { locale, key } = await params;
  const found = await load(key, locale);
  if (!found) return {};

  const { text } = found.content;
  return {
    title: text.name,
    description: text.shortDescription ?? text.description,
    alternates: localeAlternates(`/microgreens/${key}`),
  };
}

export default async function VarietyPage({
  params,
}: PageProps<"/[locale]/microgreens/[key]">) {
  const { locale, key } = await params;
  setRequestLocale(locale);

  const found = await load(key, locale);
  if (!found) notFound();
  const { row, content } = found;
  const { text } = content;

  const t = await getTranslations("microgreens");
  const d = await getTranslations("microgreens.detail");
  const e = await getTranslations("microgreens.detail.errors");
  /* Hero first, then the gallery — the main image is also the first
     thumbnail, so the strip is the complete set of photographs rather than
     "the others". A variety with no photography at all falls back to the
     Sprout mark instead of an empty frame. */
  const hero = varietyHero(content);
  /* Seeds the stepper, so the control agrees with the header badge and a
     refresh does not look like it discarded the quantity. */
  const inCart = await readCartUnitsFor("variety", row.contentKey);
  const shots: Shot[] = [
    ...(hero ? [hero] : []),
    ...(content.images.gallery ?? []).map((file) => ({
      src: varietyImageUrl(content.key, file),
      alt: d("galleryAlt", { name: text.name }),
    })),
  ];

  /* A real date, not a rule the reader has to apply themselves. Ad-hoc orders
     are sown the next morning and cut `growDays` later (SPEC §18.6), so this
     is computable now — and "Ready by Sat 26 Sept" is a promise, where
     "10 days" is homework. `formatDeliveryDate` takes a BCP-47 tag, so the
     Kannada page gets Kannada month names. */
  const readyDate = adhocReadyDate(row.growDays);

  return (
    <DetailPage
      back={{ href: "/microgreens", label: d("back") }}
      name={text.name}
      shortDescription={text.shortDescription}
      gallery={{
        shots,
        thumbLabels: shots.map((_, i) => d("thumb", { n: i + 1, total: shots.length })),
        prevLabel: d("prevPhotos"),
        nextLabel: d("nextPhotos"),
      }}
      /* The facts strip is purely *when*, because *what it costs* lives in the
         buy box below it. Price appeared here and again in the buy box
         caption, and two copies of one number on one screen is where they
         start disagreeing.

         "Ready by" is a sub-line rather than a third column: it is not an
         independent fact, it is the grow-day count applied to today's date, so
         sitting under it reads as the answer to "10 days from when?". */
      facts={[
        {
          label: d("daysLabel"),
          value: d("days", { days: row.growDays }),
          note: d("readyInline", {
            date: formatDeliveryDate(readyDate, locale === "kn" ? "kn-IN" : "en-IN"),
          }),
        },
        { label: d("sownLabel"), value: d("sown") },
      ]}
      buy={
        <AddToCart
          kind="variety"
          contentKey={row.contentKey}
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
            /* Pre-formatted for every reachable quantity: a client component
               cannot call `getTranslations`, and currency formatting belongs
               to Intl via the message file rather than to concatenation on
               the client. 20 short strings is cheaper than a second
               translation system. */
            totals: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
              d("lineTotal", { total: (i + 1) * row.pricePer100g }),
            ),
            breakdowns: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
              d("lineBreakdown", {
                grams: (i + 1) * 100,
                price: row.pricePer100g,
              }),
            ),
            note: d("readyNote"),
            errors: {
              unitsInvalid: e("unitsInvalid"),
              notSellable: e("notSellable"),
              cartFull: e("cartFull"),
              generic: e("generic"),
            },
          }}
        />
      }
      aside={
        text.flavourNotes ? { heading: d("flavour"), body: text.flavourNotes } : null
      }
      description={text.description}
      table={
        text.nutrition?.length
          ? {
              heading: d("nutrition"),
              colLabel: d("colNutrient"),
              colValue: d("colLevel"),
              rows: text.nutrition,
              note: text.nutritionNote,
            }
          : null
      }
      list={
        text.benefits?.length
          ? {
              heading: d("benefits"),
              /* It has to say something the heading does not. "What each one
                 does" was the first attempt and it was just the heading again;
                 "In the body" supplies the frame the heading leaves out — the
                 left column is what is in the green, this one is what it does
                 in the person eating it. */
              columnLabel: d("colBenefit"),
              items: text.benefits,
              /* Required by the Food Safety and Standards (Advertising and
                 Claims) Regulations 2018 — the copy itself is already limited
                 to nutrient-function claims, and this says so out loud so a
                 reader cannot mistake the list for a health promise. */
              note: d("benefitsNote"),
            }
          : null
      }
      cautions={
        text.cautions?.length ? { heading: d("cautions"), items: text.cautions } : null
      }
      prose={text.growingTips ? { heading: d("growing"), body: text.growingTips } : null}
      faq={text.faq?.length ? { heading: d("faq"), items: text.faq } : null}
      footer={
        <>
          {t("plansPrompt")}{" "}
          <Link href="/#plans" className="text-forest underline underline-offset-4">
            {t("plansLink")}
          </Link>
          .
        </>
      }
    />
  );
}
