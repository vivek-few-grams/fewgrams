import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { getGrowMediumByKey } from "@/lib/repo/grow-media";
import {
  getGrowMediumContent,
  growMediumHero,
  growMediumImageUrl,
} from "@/lib/content/grow-media";
import { DetailPage } from "@/components/catalogue/DetailPage";
import { AddToCart } from "@/components/catalogue/AddToCart";
import { RecommendedBadge } from "@/components/catalogue/RecommendedBadge";
import type { Shot } from "@/components/catalogue/Gallery";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { readCartUnitsFor } from "@/lib/cart/server";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { fromShelf, heldReadyDate } from "@/lib/trays/lead-time";

/**
 * `/shop/grow-media/[key]` — SPEC §24.3. The grow-medium detail page.
 *
 * The tray detail page (`/shop/trays/[key]`) plus **one band: how to use
 * it** — and the "Recommended by Fewgrams" badge with our own note on why
 * (SPEC §24.10). A tray is ready out of the box; a compressed coir block has to be
 * soaked and broken up first, and the water it takes tells a buyer how big a
 * bucket they need before they order. Everything else is the tray page's
 * "very minimal" layout — the spec rows are the headline facts and are not
 * repeated as a table, and the price lives only in the buy box.
 *
 * The date moves with the quantity as a tray's does: next day up to the
 * blocks we hold, a day later beyond (`heldReadyDate`).
 *
 * 404 unless the row exists, is active, and has a content file — the grid's
 * own test.
 */
export const dynamic = "force-dynamic";

async function load(key: string, locale: string) {
  const [row, content] = await Promise.all([
    getGrowMediumByKey(key),
    getGrowMediumContent(key, locale),
  ]);
  return row?.active && content ? { row, content } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/shop/grow-media/[key]">) {
  const { locale, key } = await params;
  const found = await load(key, locale);
  if (!found) return {};

  const { text } = found.content;
  return {
    title: text.name,
    description: text.shortDescription,
    alternates: localeAlternates(`/shop/grow-media/${key}`),
  };
}

export default async function GrowMediumPage({
  params,
}: PageProps<"/[locale]/shop/grow-media/[key]">) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("media", locale);

  const found = await load(key, locale);
  if (!found) notFound();
  const { row, content } = found;
  const { text } = content;

  const t = await getTranslations("shop.growMedia");
  const d = await getTranslations("shop.growMedia.detail");
  const e = await getTranslations("shop.growMedia.detail.errors");

  const hero = growMediumHero(content);
  const inCart = await readCartUnitsFor("media", row.contentKey);
  const shots: Shot[] = [
    ...(hero ? [hero] : []),
    ...(content.images.gallery ?? []).map((file) => ({
      src: growMediumImageUrl(content.key, file),
      alt: d("galleryAlt", { name: text.name }),
    })),
  ];

  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";
  /* One line per quantity the stepper reaches (the owner, 25 Sep 2026): up
     to what we hold ships from our shelf next day, beyond it a day later.
     The count itself is never printed. */
  const dispatch = Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) => {
    const units = i + 1;
    const date = formatDeliveryDate(heldReadyDate(units, row.stockPacks), dateLocale);
    return fromShelf(units, row.stockPacks) ? t("dispatchShelf", { date }) : t("dispatchRestock", { date });
  });

  return (
    <DetailPage
      back={{ href: "/shop/grow-media", label: d("back") }}
      eyebrow={<RecommendedBadge label={t("badge")} />}
      name={text.name}
      shortDescription={text.shortDescription}
      gallery={{
        shots,
        thumbLabels: shots.map((_, i) => d("thumb", { n: i + 1, total: shots.length })),
        prevLabel: d("prevPhotos"),
        nextLabel: d("nextPhotos"),
      }}
      facts={text.specs.map((spec) => ({ label: spec.label, value: spec.value }))}
      buy={
        <AddToCart
          kind="media"
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
            dispatch,
            totals: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
              d("lineTotal", { total: (i + 1) * row.price }),
            ),
            breakdowns: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
              d("lineBreakdown", { count: i + 1, price: row.price }),
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
      /* Why we recommend it, in our own words, under the gallery — the note
         the badge above the title stands on (SPEC §24.10). */
      aside={{ heading: d("noteHeading"), body: text.ourNote }}
      /* The one thing a grow medium has to say that a tray does not. */
      list={{
        heading: d("howToHeading"),
        columnLabel: d("howToColumn"),
        items: text.howToUse,
      }}
      /* What the grade does for a plant — for Horti-Coir, why low EC
         matters. Below the steps, full measure, as prose (SPEC §24.11). */
      prose={{ heading: text.whyTitle, body: text.why }}
    />
  );
}
