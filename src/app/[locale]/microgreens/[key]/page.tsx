import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Info, TriangleAlert } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { Sprout } from "@/components/ui/Sprout";
import { getVarietyByKey } from "@/lib/repo/varieties";
import {
  getVarietyContent,
  varietyHero,
  varietyImageUrl,
} from "@/lib/content/varieties";
import { VarietyGallery, type Shot } from "./VarietyGallery";
import { AddToCart } from "./AddToCart";
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
 * **Quantity selector and add-to-cart are here** (SPEC §18.6), backed by a
 * real cookie cart — `src/lib/cart/`. Checkout is still phase 5 (§14), which
 * `/cart` says plainly rather than offering a pay button that cannot pay.
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
  const inCart = await readCartUnitsFor(key);
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
  /* The facts strip is now purely *when*, because *what it costs* moved into
     the buy box below it. Price appeared here and again in the buy box
     caption, and two copies of one number on one screen is where they start
     disagreeing.

     "Ready by" is a sub-line rather than a fourth column: it is not an
     independent fact, it is the grow-day count applied to today's date, so
     sitting under it reads as the answer to "10 days from when?". */
  const facts = [
    {
      label: d("daysLabel"),
      value: d("days", { days: row.growDays }),
      note: d("readyInline", {
        date: formatDeliveryDate(readyDate, locale === "kn" ? "kn-IN" : "en-IN"),
      }),
    },
    { label: d("sownLabel"), value: d("sown") },
  ];

  return (
    <article className="mx-auto max-w-[1400px] px-6 pb-12 pt-5 md:px-12 md:pb-16 md:pt-6">
      {/* Left-aligned with the gallery below it. `items-center` centres the
          arrow against the cap height of the label — without it the glyph sits
          on the baseline and reads as dropped. */}
      <Link
        href="/microgreens"
        className="inline-flex items-center gap-2 font-body text-xs uppercase tracking-widest text-stone transition-colors hover:text-forest"
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        {d("back")}
      </Link>

      {/* Photograph and the headline facts, side by side from `lg` up. Below
          that the image leads, because on a phone the picture is what makes
          somebody keep scrolling.

          Explicit row/column placement from `lg` up, with the buy column
          spanning both rows: the gallery is far shorter than the title, facts
          and buy box stacked beside it, which left a screen-deep hole under the
          thumbnails. The flavour notes moved out of that column and into the
          hole.

          DOM order stays gallery -> buy column -> flavour notes, which is the
          right single-column order on a phone; the grid only re-places them at
          `lg`, so the tasting note never jumps above the price on mobile. */}
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-2 lg:gap-x-14 lg:gap-y-0">
        <div className="lg:col-start-1 lg:row-start-1">
        {shots.length > 0 ? (
          <VarietyGallery
            shots={shots}
            thumbLabels={shots.map((_, i) =>
              d("thumb", { n: i + 1, total: shots.length }),
            )}
            prevLabel={d("prevPhotos")}
            nextLabel={d("nextPhotos")}
          />
        ) : (
          /* Same 3:2 as VarietyGallery's frame, so the page does not change
             shape between a variety that has photographs and one that does
             not yet. */
          <div className="mcard flex aspect-[3/2] items-center justify-center overflow-hidden bg-forest">
            <div className="w-[62%]">
              <Sprout className="h-full w-full" stroke="#A8CF8E" />
            </div>
          </div>
        )}
        </div>

        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <h1 className="font-display text-[clamp(2rem,4.6vw,3.4rem)] font-bold leading-[1.05] tracking-tight text-forest">
            {text.name}
          </h1>
          {text.shortDescription && (
            <p className="mt-4 max-w-md font-body text-base leading-relaxed text-stone">
              {text.shortDescription}
            </p>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-forest/15 pt-6">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="font-body text-[10px] uppercase tracking-widest text-stone">
                  {f.label}
                </dt>
                <dd className="mt-1.5 font-display text-base font-semibold leading-snug text-forest">
                  {f.value}
                  {f.note && (
                    <span className="mt-1 block font-body text-xs font-normal text-stone">
                      {f.note}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <AddToCart
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
        </div>

        {text.flavourNotes && (
          /* Under the gallery, filling the hole the short photo column left
             beside the much taller buy column — not stacked under the buy box,
             which is what put it there.

             `lg:pt-8` rather than a margin: on a phone the grid's own gap does
             the spacing, and a margin would double up with it.

             Left accent rather than a fill — the one filled panel on this
             screen is the buy box, and a second competing block would flatten
             the emphasis it exists to carry. */
          <div className="lg:col-start-1 lg:row-start-2 lg:pt-8">
            {/* The border lives on this inner element, not on the wrapper that
                carries `lg:pt-8`. On the wrapper it spanned the padding too, so
                the rule started a centimetre above the heading it marks. */}
            <div className="border-l-2 border-sage pl-4">
              <h2 className="font-body text-[10px] uppercase tracking-widest text-stone">
                {d("flavour")}
              </h2>
              <p className="mt-1.5 font-body text-sm leading-relaxed text-ink">
                {text.flavourNotes}
              </p>
            </div>
          </div>
        )}
      </div>

      {text.description && (
        <div className="mt-16 max-w-3xl">
          {/* Split on blank lines so a future multi-paragraph description
              renders as paragraphs rather than one wall of text. */}
          {text.description.split(/\n\s*\n/).map((para, i) => (
            <p
              key={i}
              className="mt-5 font-body text-[15px] leading-[1.85] text-ink first:mt-0"
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {/* Nutrition and what those nutrients do sit side by side: the table is
          the claim, the list is what it means, and separating them by a screen
          of scroll makes the reader hold the table in their head. */}
      <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:gap-16">
        {text.nutrition && text.nutrition.length > 0 && (
          <section>
            <SectionHeading>{d("nutrition")}</SectionHeading>
            <table className="mt-6 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-forest/20">
                  <th className="pb-2 font-body text-[10px] font-medium uppercase tracking-widest text-stone">
                    {d("colNutrient")}
                  </th>
                  <th className="pb-2 font-body text-[10px] font-medium uppercase tracking-widest text-stone">
                    {d("colLevel")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {text.nutrition.map((r) => (
                  <tr key={r.label} className="border-b border-forest/10">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-body text-sm font-medium text-ink"
                    >
                      {r.label}
                    </th>
                    <td className="py-3 font-body text-sm text-stone">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {text.nutritionNote && (
              <p className="mt-4 flex gap-2.5 font-body text-xs leading-relaxed text-stone">
                <Info size={15} strokeWidth={1.75} className="mt-px shrink-0" />
                {text.nutritionNote}
              </p>
            )}
          </section>
        )}

        {text.benefits && text.benefits.length > 0 && (
          <section>
            <SectionHeading>{d("benefits")}</SectionHeading>
            <ul className="mt-6 space-y-3.5">
              {text.benefits.map((b) => (
                <li
                  key={b}
                  className="border-l-2 border-sage pl-4 font-body text-sm leading-relaxed text-ink"
                >
                  {b}
                </li>
              ))}
            </ul>
            {/* Required by the Food Safety and Standards (Advertising and
                Claims) Regulations 2018 — the copy itself is already limited to
                nutrient-function claims, and this says so out loud so a reader
                cannot mistake the list for a health promise. */}
            <p className="mt-5 font-body text-xs leading-relaxed text-stone">
              {d("benefitsNote")}
            </p>
          </section>
        )}
      </div>

      {text.cautions && text.cautions.length > 0 && (
        <section className="mt-16 rounded-2xl border border-terracotta/25 bg-terracotta/[0.04] p-6 md:p-8">
          <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-terracotta">
            <TriangleAlert size={18} strokeWidth={1.75} />
            {d("cautions")}
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {text.cautions.map((c) => (
              <li key={c} className="font-body text-sm leading-relaxed text-ink">
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {text.growingTips && (
        <section className="mt-16 max-w-3xl">
          <SectionHeading>{d("growing")}</SectionHeading>
          <p className="mt-5 font-body text-[15px] leading-[1.85] text-ink">
            {text.growingTips}
          </p>
        </section>
      )}

      {text.faq && text.faq.length > 0 && (
        <section className="mt-16 max-w-3xl">
          <SectionHeading>{d("faq")}</SectionHeading>
          {/* Native `<details>`: keyboard accessible, works without
              JavaScript, and the answers are in the HTML whether or not they
              are open, so a crawler indexes them. */}
          <div className="mt-6 border-t border-forest/15">
            {text.faq.map((item) => (
              <details
                key={item.question}
                className="group border-b border-forest/15 py-4"
              >
                <summary className="flex items-center justify-between gap-4 font-display text-[15px] font-semibold text-forest transition-colors group-hover:text-stone [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-body text-lg leading-none text-stone transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl font-body text-sm leading-[1.8] text-stone">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      <p className="mt-16 border-t border-forest/15 pt-8 font-body text-sm text-stone">
        {t("plansPrompt")}{" "}
        <Link href="/#plans" className="text-forest underline underline-offset-4">
          {t("plansLink")}
        </Link>
        .
      </p>
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.3rem,2.4vw,1.8rem)] font-bold leading-tight tracking-tight text-forest">
      {children}
    </h2>
  );
}

