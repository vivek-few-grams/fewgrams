import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { listGrowMedia } from "@/lib/repo/grow-media";
import {
  attachGrowMediumContent,
  growMediumCutout,
  growMediumHero,
} from "@/lib/content/grow-media";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { mediumReadyDate } from "@/lib/grow-media/lead-time";
import { CATEGORY_PANELS } from "@/lib/shop";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { Sprout } from "@/components/ui/Sprout";
import { Marquee } from "@/components/ui/Marquee";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";
import { RecommendedBadge } from "@/components/catalogue/RecommendedBadge";
import { Link } from "@/i18n/navigation";
import { QuickAdd } from "@/components/catalogue/QuickAdd";
import { quickAddFor } from "@/lib/cart/quick-add";
import Image from "next/image";

/**
 * `/shop/grow-media` — SPEC §24.5. Cocopeat first; perlite or vermiculite
 * would join as a content file and an admin row, not a code change.
 *
 * `/shop/trays` card for card, because the item is sold the same way and a
 * buyer compares the two sizes the same way: the **card** carries the facts
 * and a dated promise, the **detail page** carries the photographs, the
 * preparation steps and the buy box. Every reason for the layout — the 3:2
 * frame, the name-sorted order, the three media treatments, the date on the
 * card — is written out on the tray page and holds here unchanged.
 *
 * Dynamic for the same reason too: the price and the lead time are
 * admin-editable, and a cached date would go stale by a day, silently.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/shop/grow-media">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.categories" });
  return { title: t("media"), alternates: localeAlternates("/shop/grow-media") };
}

export default async function GrowMediaPage({ params }: PageProps<"/[locale]/shop/grow-media">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("media", locale);

  const t = await getTranslations("shop.growMedia");
  const c = await getTranslations("shop.category");
  const label = await getTranslations("common.categories");

  /* An item with no content file is skipped, not rendered nameless — the
     admin screen flags it in red with the path to create. */
  const rows = await attachGrowMediumContent(await listGrowMedia({ activeOnly: true }), locale);
  /* Cheapest first, then by name. **Not by name alone**, as `/shop/trays`
     sorts: the items here are pack sizes of one product, and a name sort puts
     "10 kg" ahead of "5 kg" because "1" sorts before "5". The price follows
     the size, so it orders them the way a buyer reads them. */
  const collator = new Intl.Collator(locale === "kn" ? "kn-IN" : "en-IN");
  const items = rows
    .filter((row) => row.content !== null)
    .sort(
      (a, b) =>
        a.price - b.price || collator.compare(a.content!.text.name, b.content!.text.name),
    );

  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";
  const panel = CATEGORY_PANELS.media;

  const quickAdd = await quickAddFor();

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-6 md:px-12 md:pb-24 md:pt-8">
      <CategoryStrip current="media" />

      <h1 className="mt-8 font-display text-[clamp(1.25rem,2.5vw,1.9rem)] font-bold leading-tight tracking-tight text-forest">
        {label("media")}
      </h1>
      <p className="mt-3 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      {items.length === 0 ? (
        <p className="mt-12 rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          {c("empty", { category: label("media").toLowerCase() })}
        </p>
      ) : (
        <>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {items.map((item, i) => {
              const content = item.content!;
              const photo = growMediumHero(content);
              const cutout = growMediumCutout(content);
              /* The spec labels, as on the tray grid — labels only. */
              const words = content.text.specs.map((row) => row.label);
              const ready = formatDeliveryDate(mediumReadyDate(item.leadDays), dateLocale);

              return (
                <li key={item.id} className="flex flex-col">
                  <Link href={`/shop/grow-media/${item.contentKey}`} className="group">
                    {/* The badge sits on a wrapper outside `.mcard`, so the
                        card's hover scale and tilt move the picture and not
                        the label. Every item here carries it — see
                        `RecommendedBadge` for why that is earned. */}
                    <div className="relative">
                    <RecommendedBadge
                      label={t("badge")}
                      className="absolute left-3 top-3 z-10 shadow-sm"
                    />
                    <div
                      className={`mcard flex aspect-[3/2] items-center justify-center ${panel.panelClass}`}
                    >
                      {cutout ? (
                        <>
                          <Marquee
                            words={words}
                            toneClass={panel.marqueeClass}
                            /* The tray card's sizing exactly — same 3:2 panel,
                               same `cqw` type, so the same measured speed.
                               See `shop/trays/page.tsx`. */
                            sizeClass="text-[7cqw]"
                          />
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
                        /* The launch state: the maker's own photograph, which
                           has its background, so it fills the card flat rather
                           than tilting as a rectangle (SPEC §17.4). */
                        <Image
                          src={photo.src}
                          alt={photo.alt}
                          fill
                          priority={i < 3}
                          sizes="(min-width: 768px) 30vw, 92vw"
                          className="object-cover"
                        />
                      ) : (
                        <>
                          <Marquee
                            words={words}
                            toneClass={panel.marqueeClass}
                            sizeClass="text-[7cqw]"
                          />
                          <div className="mcard__media w-[38%]">
                            <Sprout className="h-full w-full" stroke="#5a3e22" seed={i + 5} />
                          </div>
                        </>
                      )}
                    </div>
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
                  <div className="mt-auto flex items-center justify-between gap-4 pt-4">
                    <Link
                      href={`/shop/grow-media/${item.contentKey}`}
                      className="font-body text-xs font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
                    >
                      {t("cardLink")}
                    </Link>
                    <QuickAdd
                      {...quickAdd("media", item.contentKey, content.text.name)}
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
