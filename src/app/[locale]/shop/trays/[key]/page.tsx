import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { getTrayByKey } from "@/lib/repo/trays";
import { getTrayContent, trayHero, trayImageUrl } from "@/lib/content/trays";
import { DetailPage } from "@/components/catalogue/DetailPage";
import { AddToCart } from "@/components/catalogue/AddToCart";
import type { Shot } from "@/components/catalogue/Gallery";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { readCartUnitsFor } from "@/lib/cart/server";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { fromShelf, heldReadyDate } from "@/lib/trays/lead-time";

/**
 * `/shop/trays/[key]` — SPEC §23.3. The tray detail page.
 *
 * Built 17 Sep 2026 on the owner's instruction, which **reversed** the call
 * made earlier the same day that this category did not need one:
 *
 * > *"We need to build details page for Trays & drainage, very minimal to
 * > display images, price, add to cart and dimension and quality and
 * > material."*
 *
 * The earlier reasoning — that a tray is four facts and a price, so a detail
 * page would be a spec table and nothing else — was right about the *content*
 * and wrong about what a page is for. Two things it missed:
 *
 * 1. **Photographs need somewhere to be.** A grid card holds one square; a
 *    tray with a drain hole, the same tray stacked, and a mat interlocked with
 *    its neighbour are three pictures that sell the thing. The gallery is the
 *    reason this page exists even though its text is short.
 * 2. **Add to cart needs a page.** The grid cannot carry twenty steppers and a
 *    live total per card, and a buyer deciding between ₹160 and ₹270 wants to
 *    read the specs in the same eyeful as the price.
 *
 * ## "Very minimal" is a constraint honoured literally
 *
 * `DetailPage` makes everything except the gallery, the title, the facts and
 * the buy box optional, so this page passes **nothing else**: no long
 * description, no FAQ, no cautions, no two-column band. The four spec rows
 * from the content file become the `facts` — the dimension, the grade and the
 * material the owner asked to show — and the price lives only in the buy box,
 * because two copies of one number on one screen is where they start
 * disagreeing (SPEC §18.10).
 *
 * That is also why the spec table is **not** rendered below as well. On a seed
 * page the facts and the table say different things; here they would be the
 * same four rows twice.
 *
 * ## The date moves with the quantity (the owner, 25 Sep 2026)
 *
 * `AddToCart` takes `dispatch` as one line per reachable quantity. Up to the
 * packs we hold, a tray ships from our shelf next day; beyond them it is
 * brought in overnight and ships a day later (`heldReadyDate`). So stepping
 * past the count changes the promise before the customer commits — without
 * the count ever being printed.
 *
 * Three lookups have to succeed, the same test the grid applies:
 *
 * | Missing | Result | Why |
 * |---|---|---|
 * | DynamoDB row | 404 | Nothing sets a price, so it is not sold |
 * | Row is inactive | 404 | Withdrawn; a live page would take orders |
 * | Content file | 404 | Cannot be named, so cannot be described |
 */
export const dynamic = "force-dynamic";

async function load(key: string, locale: string) {
  /* Both reads are cheap and independent, so they run together rather than
     gating the file read on the row. `getTrayContent` is `cache`d per request,
     so generateMetadata and the page share one file read. */
  const [row, content] = await Promise.all([
    getTrayByKey(key),
    getTrayContent(key, locale),
  ]);
  return row?.active && content ? { row, content } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/shop/trays/[key]">) {
  const { locale, key } = await params;
  const found = await load(key, locale);
  if (!found) return {};

  const { text } = found.content;
  return {
    title: text.name,
    description: text.shortDescription,
    alternates: localeAlternates(`/shop/trays/${key}`),
  };
}

export default async function TrayPage({
  params,
}: PageProps<"/[locale]/shop/trays/[key]">) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("trays", locale);

  const found = await load(key, locale);
  if (!found) notFound();
  const { row, content } = found;
  const { text } = content;

  const t = await getTranslations("shop.trays");
  const d = await getTranslations("shop.trays.detail");
  const e = await getTranslations("shop.trays.detail.errors");

  const hero = trayHero(content);
  const inCart = await readCartUnitsFor("tray", row.contentKey);
  const shots: Shot[] = [
    ...(hero ? [hero] : []),
    ...(content.images.gallery ?? []).map((file) => ({
      src: trayImageUrl(content.key, file),
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
      back={{ href: "/shop/trays", label: d("back") }}
      name={text.name}
      shortDescription={text.shortDescription}
      gallery={{
        shots,
        thumbLabels: shots.map((_, i) => d("thumb", { n: i + 1, total: shots.length })),
        prevLabel: d("prevPhotos"),
        nextLabel: d("nextPhotos"),
      }}
      /* The spec rows straight from the content file: what is in the pack, the
         size, the thickness and the material. Four of them, which the facts
         grid lays out two by two.

         Rendered here rather than in the `table` slot below because that is
         the whole of what this page has to say — a table underneath would be
         these same four rows a second time. */
      facts={text.specs.map((spec) => ({ label: spec.label, value: spec.value }))}
      buy={
        <AddToCart
          kind="tray"
          contentKey={row.contentKey}
          /* The per-line wholesale cap, and the only cap: more than we hold
             still sells, a day later. */
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
               client. */
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
      /* Everything else `DetailPage` offers is deliberately omitted — the
         owner asked for minimal, and a tray has nothing to put in a tasting
         note, a nutrition table, a cautions list or five FAQs. */
    />
  );
}
