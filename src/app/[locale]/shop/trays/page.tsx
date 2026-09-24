import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { listTrays } from "@/lib/repo/trays";
import { attachTrayContent, trayCutout, trayHero } from "@/lib/content/trays";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { trayReadyDate } from "@/lib/trays/lead-time";
import { CATEGORY_PANELS } from "@/lib/shop";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { Sprout } from "@/components/ui/Sprout";
import { Marquee } from "@/components/ui/Marquee";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";
import { Link } from "@/i18n/navigation";
import { QuickAdd } from "@/components/catalogue/QuickAdd";
import { quickAddFor } from "@/lib/cart/quick-add";
import Image from "next/image";

/**
 * `/shop/trays` — SPEC §23.5. Trays and drainage cells.
 *
 * **Its own route, not `/shop/[category]`.** A static segment wins over the
 * dynamic one in the App Router, so this file takes the URL without a redirect
 * and `[category]` keeps serving racks and snacks off `ProductEntity`
 * untouched. The reason it needs its own page is the data: trays left
 * `ProductEntity` for their own entity and their own content files on 17 Sep
 * 2026 (see the `Tray` type), so there is nothing for the generic page to
 * read. Branching inside the shared page would have put two catalogues in one
 * component to save a file.
 *
 * It is still a **grid** rather than a described catalogue like `/seeds`, but
 * every card links to a detail page — `/shop/trays/[key]`, added later the
 * same day on the owner's instruction after this file first argued there was
 * no need for one. The split that settled it: the **card** carries the facts,
 * so three items are comparable in one glance; the **page** carries the
 * photographs and the buy box, which is what a card cannot hold (§23.3).
 *
 * ## The date is on the card, before anyone commits to anything
 *
 * Every item here is bought in when it is ordered (SPEC §23.1), so the one
 * thing a buyer needs that the price does not tell them is **when**. The card
 * therefore prints a real date, computed per item from its own `leadDays`,
 * rather than "ordered on request" — the same reasoning that put the dated
 * promise in the seed buy box (SPEC §22.2) instead of a policy sentence.
 *
 * That makes this page dynamic, which it is anyway: prices and lead times are
 * admin-editable, and a cached date would go stale overnight in the worst
 * possible way — by a day, silently.
 *
 * ## Buying happens on the detail page, not here
 *
 * Twenty steppers and three live totals across three cards would be a form
 * rather than a grid, and a buyer deciding between ₹160 and ₹270 wants the
 * specs and the price in one eyeful — which is the detail page's job.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/shop/trays">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.categories" });
  return { title: t("trays"), alternates: localeAlternates("/shop/trays") };
}

export default async function TraysPage({ params }: PageProps<"/[locale]/shop/trays">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("trays", locale);

  const t = await getTranslations("shop.trays");
  const c = await getTranslations("shop.category");
  const label = await getTranslations("common.categories");

  /* Rows joined to their content files. An item with no file is **skipped**,
     not rendered nameless — the admin screen is where that is flagged, in red
     with the path to create (SPEC §23.4). */
  const rows = await attachTrayContent(await listTrays({ activeOnly: true }), locale);
  /* Sorted on the **displayed name**, not the key. `listTrays` returns GSI1
     key order, and the name lives in the content file which the repository
     does not read — so key order is whatever the keys happen to spell. The
     same fix `/seeds` needed (SPEC §22.7), applied here before it can be
     noticed: a collator so Kannada sorts by its own rules rather than by code
     point. */
  const collator = new Intl.Collator(locale === "kn" ? "kn-IN" : "en-IN");
  const items = rows
    .filter((row) => row.content !== null)
    .sort((a, b) => collator.compare(a.content!.text.name, b.content!.text.name));

  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";
  const panel = CATEGORY_PANELS.trays;

  const quickAdd = await quickAddFor();

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-6 md:px-12 md:pb-24 md:pt-8">
      <CategoryStrip current="trays" />

      <h1 className="mt-8 font-display text-[clamp(1.25rem,2.5vw,1.9rem)] font-bold leading-tight tracking-tight text-forest">
        {label("trays")}
      </h1>
      <p className="mt-3 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      {items.length === 0 ? (
        <p className="mt-12 rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          {c("empty", { category: label("trays").toLowerCase() })}
        </p>
      ) : (
        <>
          {/* Three items, and each carries a spec table — so two columns on a
              phone would give every card four wrapped rows of specification.
              One column below `md`, then three. */}
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {items.map((item, i) => {
              const content = item.content!;
              const photo = trayHero(content);
              const cutout = trayCutout(content);
              /* The same labels the spec list below prints in full — what is
                 in the pack, the size, the thickness, the material. Labels
                 only, exactly as the seed grid does it; see `Marquee`. */
              const words = content.text.specs.map((row) => row.label);
              const ready = formatDeliveryDate(trayReadyDate(item.leadDays), dateLocale);

              return (
                <li key={item.id} className="flex flex-col">
                  {/* Photograph, name and price are one link — the whole top
                      of the card is the target, because a buyer aims at the
                      picture. The spec list below stays outside it: it is
                      reference text somebody may want to select and compare,
                      and wrapping a `dl` in an anchor turns drag-to-select
                      into drag-to-navigate. */}
                  <Link href={`/shop/trays/${item.contentKey}`} className="group">
                  {/* 3:2, not the square the other category grids use — and
                      it is an asset decision rather than a layout one. The
                      detail page's gallery frame is `aspect-[3/2]`, so a square
                      master would be letterboxed there while a 3:2 master would
                      be cropped at the sides here: one photograph could not
                      serve both. Matching the two means one shot per file.

                      It also suits the subject. Every item in this category is
                      a wide flat object — a 60 × 30 cm tray, a 50 × 25 cm mat —
                      and a square frame around one is mostly margin. */}
                  <div
                    className={`mcard flex aspect-[3/2] items-center justify-center ${panel.panelClass}`}
                  >
                    {/* The same three treatments `Tile` has, for the same
                        reason: the photography arrives one product at a time,
                        and a cut-out is a different picture from a hero rather
                        than a better one. A hero dropped into the media box
                        would sit on the panel as a rectangle and the tilt would
                        read as a skewed photograph, so it fills the card flat
                        instead — the honest version of "no cut-out yet".

                        This grid is not `Tile` itself because the card carries
                        a price, four spec rows and a dated promise under the
                        picture, and `Tile` is square with a name and one line
                        of meta. Only the panel is shared, via `Marquee`. */}
                    {cutout ? (
                      <>
                        <Marquee
                          words={words}
                          toneClass={panel.marqueeClass}
                          /* `cqw`, not the default's `vw` — 7% of the card
                             rather than of the window. A 3:2 panel is short
                             and wide, so capped `vw` type leaves a hole at
                             the loop seam once the grid drops to one column
                             (see `.mcard` in globals.css). At 7% of the width,
                             twelve lines come to 1.2 panel heights at every
                             width, and the scroll speed stops changing with
                             the viewport. */
                          sizeClass="text-[7cqw]"
                          /* No `durationSeconds`: one half of the block is
                             1.20 panel heights — 334px on the measured
                             419 x 279 card — so the CSS default of 8s already
                             runs it at 42px/s, inside 15% of the 48px/s house
                             speed. Not worth a number that would then need
                             maintaining. */
                        />
                        {/* 96%, as on a variety tile, and the cut-out is padded
                            to 88% of its own 3:2 frame by `scripts/cutout.py` —
                            so the tray sits at ~84% of the card at rest and the
                            marquee keeps a legible band above and below it.

                            **The ceiling is the hover, not the layout.** The
                            media box itself overflows when scaled 1.1 and
                            rotated 4°, and is meant to: what has to stay inside
                            the clip is the *subject*, which is 88% of that box.
                            Measured on the 419 x 279 card at 1440px, the tray is
                            354px wide at rest and 402px hovered — 8px of
                            clearance each side. The height never binds; it comes
                            to two thirds of the card. Anything larger needs the
                            cut-out re-padded tighter than 88%, not a wider box. */}
                        <div className="mcard__media relative aspect-[3/2] w-[96%]">
                          <Image
                            src={cutout.src}
                            alt={cutout.alt}
                            fill
                            priority={i < 3}
                            sizes="(min-width: 768px) 30vw, 92vw"
                            className="object-contain"
                          />
                        </div>
                      </>
                    ) : photo ? (
                      /* `priority` on the first row, which here is every card:
                         three items, one row on desktop. The top-left is this
                         page's Largest Contentful Paint element and
                         lazy-loading it costs a round trip. */
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        fill
                        priority={i < 3}
                        sizes="(min-width: 768px) 30vw, 92vw"
                        className="object-cover"
                      />
                    ) : (
                      /* No photography yet, so the brand mark rather than a
                         broken image or an empty panel — with the specs still
                         scrolling, so the treatment does not appear and
                         disappear as shots land. `seed` varies the mark per
                         card so three cards are not three identical
                         drawings. */
                      <>
                        <Marquee
                          words={words}
                          toneClass={panel.marqueeClass}
                          /* `cqw`, not the default's `vw` — 7% of the card
                             rather than of the window. A 3:2 panel is short
                             and wide, so capped `vw` type leaves a hole at
                             the loop seam once the grid drops to one column
                             (see `.mcard` in globals.css). At 7% of the width,
                             twelve lines come to 1.2 panel heights at every
                             width, and the scroll speed stops changing with
                             the viewport. */
                          sizeClass="text-[7cqw]"
                          /* No `durationSeconds`: one half of the block is
                             1.20 panel heights — 334px on the measured
                             419 x 279 card — so the CSS default of 8s already
                             runs it at 42px/s, inside 15% of the 48px/s house
                             speed. Not worth a number that would then need
                             maintaining. */
                        />
                        <div className="mcard__media w-[38%]">
                          <Sprout className="h-full w-full" stroke="#033923" seed={i + 3} />
                        </div>
                      </>
                    )}
                  </div>

                  <h2 className="mt-4 font-display text-base font-semibold text-forest transition-colors group-hover:text-stone">
                    {content.text.name}
                  </h2>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-forest">
                    {c("price", { price: item.price })}
                  </p>
                  </Link>
                  <p className="mt-2 font-body text-sm leading-relaxed text-stone">
                    {content.text.shortDescription}
                  </p>

                  {/* The spec table, as a description list: these are
                      label-and-value pairs, so `dl` is what they are. A table
                      would need a caption and column headers to say the same
                      thing. */}
                  <dl className="mt-4 divide-y divide-forest/10 border-t border-forest/10 font-body text-xs">
                    {content.text.specs.map((row) => (
                      <div key={row.label} className="flex gap-3 py-2">
                        <dt className="w-[40%] shrink-0 text-stone">{row.label}</dt>
                        <dd className="text-forest">{row.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="mt-4 font-body text-xs font-semibold text-forest">
                    {t("dispatch", { date: ready })}
                  </p>
                  {/* An explicit link as well as the card. A linked image is
                      invisible to anyone scanning for something to click, and
                      `mt-auto` lines this row up across three cards whose text
                      runs to different lengths. */}
                  <div className="mt-auto flex items-center justify-between gap-4 pt-4">
                    <Link
                      href={`/shop/trays/${item.contentKey}`}
                      className="font-body text-xs font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
                    >
                      {t("cardLink")}
                    </Link>
                    <QuickAdd
                      {...quickAdd("tray", item.contentKey, content.text.name)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-12 max-w-2xl rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
            {t("note")}
          </p>
        </>
      )}
    </section>
  );
}
