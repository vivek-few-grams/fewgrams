import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { CATEGORY_PANELS } from "@/lib/shop";
import { Marquee } from "@/components/ui/Marquee";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";
import { Link } from "@/i18n/navigation";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { rackReadyDate } from "@/lib/racks/lead-time";
import { listSellableRacks } from "@/lib/racks/catalogue";
import Image from "next/image";

/**
 * `/shop/racks` — SPEC §19.6. The three rack ranges.
 *
 * **Its own static route**, which wins over `/shop/[category]` without a
 * redirect, exactly as `/shop/trays` does. What it replaces there was an empty
 * state: that page reads racks out of `ProductEntity` and nothing writes a rack
 * to the product catalogue, because a rack is computed from a component rate
 * card rather than entered as a finished SKU (§19). So the URL in the category
 * strip and the footer led to "no products in racks yet" while three admin
 * screens quietly priced the whole range.
 *
 * ## It answers a question about *kinds*, not about models
 *
 * The three ranges are not three price points of one product. A level is a
 * bolted steel plate, or an open angle rectangle with a mid-rail, or a pipe
 * perimeter braced from underneath (§19, §20, §21), and which of those you want
 * is the question a buyer actually has. So this page is one card per range with
 * a photograph and one sentence, and **choosing a rack happens on
 * `/shop/racks/[range]`** (§19.7) where the height, the shelf size and the
 * colour are.
 *
 * The page exists because the photography arrived on 17 Sep 2026 and had
 * nowhere to be — a tile on `/shop` shows one range, and three ranges need
 * three frames. It replaced an empty state: `/shop/[category]` reads racks out
 * of `ProductEntity` and finds none, because a rack is computed from a rate
 * card rather than entered as a SKU.
 *
 * **A from-price, not a price.** The figure is the cheapest published model in
 * the range; the height and shelf size the customer picks decide the real one.
 * A range with no published models is not rendered at all, rather than linked
 * to a page that would 404.
 *
 * ## Why there is no price, said out loud rather than left blank
 *
 * `leadNote` carries the one thing a dated promise does not explain by itself:
 * *"for racks within Bangalore location, the delivery timeline is three days"*.
 * Three days on a made-to-order steel rack is fast enough that a buyer will
 * wonder whether it is a city figure, so the note says so — and says we do not
 * deliver them outside Bengaluru, which is true of the whole site (SPEC §7) but
 * least obvious here.
 *
 * The earlier version of this note said nothing here was priced online. It was
 * replaced rather than added to, because it is no longer true.
 *
 * **Dynamic as of 17 Sep 2026**, when the owner asked for add-to-cart. It was
 * static while the ranges were structure, copy and three photographs; now each
 * card prints a real delivery date and a cheapest-price figure read from the
 * published models, and a cached price is the one thing a shop must never
 * serve. A range with no published models is dropped rather than linked to an
 * empty page.
 */

/** The three ranges, in the order a buyer should meet them: the closed shelf
 *  first because it is what "rack" means to most people, then the same steel
 *  without plates, then the one built from something else entirely. Each key
 *  names both its message block and its asset folder. */
const RANGES = ["shelf", "angle", "pipe"] as const;

/**
 * Six properties scroll behind each rack, and they are **six different
 * things** rather than the range name repeated — on the owner's instruction,
 * because a marquee of one phrase reads as a rendering fault rather than as
 * content: *"so that it is clear that we are showing different properties not
 * the same text getting scrolled"*.
 *
 * Numbered keys rather than an array, because nothing in `messages/` is an
 * array and nothing in this codebase calls `t.raw()` — flat keys keep the
 * typed-placeholder checking and the en/kn parity test working as they do
 * everywhere else.
 *
 * Six is fixed for all three ranges, so they scroll at the same density.
 *
 * **What these may not say.** No price, no height and no shelf count: all
 * three are per-model figures the admin screens tune (§19), and copy that
 * restates a tuned number goes stale the first time it moves — the same rule
 * that keeps `growDays` out of variety copy and the lead time out of tray
 * specs (CLAUDE.md). "Built to your size" and "Load rated" are the drift-proof
 * ways to say the same things. The two steel ranges deliberately share four of
 * their six, because they are the same steel: what separates them is
 * "Steel shelf plates" against "Open on every level" and "Takes an LED tube".
 */
const PROPS = [1, 2, 3, 4, 5, 6] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/shop/racks">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.categories" });
  return { title: t("racks"), alternates: localeAlternates("/shop/racks") };
}

export default async function RacksPage({ params }: PageProps<"/[locale]/shop/racks">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("shop.racks");
  const c = await getTranslations("shop.category");
  const label = await getTranslations("common.categories");
  const panel = CATEGORY_PANELS.racks;

  /* One read for all three ranges — `listSellableRacks` is `cache`d, so the
     cards and any later lookup in this request share it. */
  const racks = await listSellableRacks();
  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";
  /* One date for every rack: three days is our own build time, not a per-model
     or per-quantity figure (`RACK_LEAD_DAYS`). */
  const ready = t("dispatch", {
    date: formatDeliveryDate(rackReadyDate(), dateLocale),
  });

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
      <CategoryStrip current="racks" />

      <h1 className="mt-8 font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
        {label("racks")}
      </h1>
      <p className="mt-3 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      {/* One column on a phone, three above `md`. Three cards and no spec
          tables, so unlike the tray grid there is nothing here that would wrap
          badly two-up — but a rack is a portrait photograph, and two portrait
          frames side by side on a 390px screen would be 160px wide. */}
      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {RANGES.map((range, i) => {
          const inRange = racks.filter((x) => x.range === range);
          /* A range whose models are all unpublished or deactivated is not
             rendered at all, rather than linked to a page that would 404. */
          if (inRange.length === 0) return null;
          const from = Math.min(...inRange.map((x) => x.price));
          return (
          <li key={range} className="flex flex-col">
            {/* 4:5 portrait, against the 3:2 the tray grid uses. It is the
                subject again: a rack is 4 ft tall in 3 ft of width, and a
                landscape frame around one is two bands of empty panel.

                The panel is the link target, because a buyer aims at the
                picture. The copy below stays outside it: a range description
                is text somebody may want to select, and wrapping it in an
                anchor turns drag-to-select into drag-to-navigate. */}
            <Link href={`/shop/racks/${range}`} className="group block">
            <div
              className={`mcard flex aspect-[4/5] items-center justify-center ${panel.panelClass}`}
            >
              {/* Six properties of this range — see `PROPS`. Values, not
                  labels, which is the opposite of the tray card (§23.5): a
                  tray's specs are two-column pairs whose labels are the short
                  half, whereas a rack has no figures to pair here at all. The
                  §17.4 rule these are checked against is about *claims*, not
                  about labels — "Powder coated" is a statement of what the
                  steel is, not an unsubstantiated nutrient claim. */}
              <Marquee
                words={PROPS.map((n) => t(`ranges.${range}.prop${n}`))}
                toneClass={panel.marqueeClass}
                /* `cqw` for the same reason the tray card uses it — a panel
                   this tall needs the type to scale with the card, or the
                   marquee's block stops overflowing it and the loop shows a
                   seam. 6% rather than the tray card's 7% because this is one
                   long phrase rather than four short labels: at 7% of a
                   portrait card "Orange, green or purple" runs most of the way
                   off both edges. At 6% it is ~25px on the 419px card and fits
                   inside it.

                   `minLines` follows from those two numbers and is not a taste
                   decision — this panel is 4:5, so
                   1.25 / (0.95 x 0.06) = 21.9 lines just to reach the panel's
                   height. 26 puts one half at 1.19 panel heights, and six
                   words round up to 30 lines. Ten, the default, measured 0.38
                   here before the properties landed. */
                sizeClass="text-[6cqw]"
                minLines={26}
                /* Six words round 26 up to 30 lines, which makes one half of
                   the block 1.37 panel heights — 715px on the 419px card. At
                   the house speed of 48px/s that is 15s, against the 8s the
                   CSS defaults to.

                   Left at 8s this card ran at 89px/s, nearly twice a variety
                   tile, which is what the owner saw: *"Text should scroll bit
                   slow"*. The cause was a duration being shared where a speed
                   was meant — a taller block covers more ground in the same
                   time. */
                durationSeconds={15}
              />
              {/* 88% of the media box, and the media box at 82% of the card's
                  height. The cut-out is padded to 88% of its own 4:5 frame by
                  `scripts/cutout.py`, normalised on **height** — all three
                  subjects are narrower than 4:5, so they come out the same
                  height with their widths varying by the rack, which is the
                  object rather than the photography. */}
              <div className="mcard__media relative aspect-[4/5] h-[82%]">
                <Image
                  src={`/racks/${range}/cutout.webp`}
                  alt={t(`ranges.${range}.imageAlt`)}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 768px) 30vw, 92vw"
                  className="object-contain"
                />
              </div>
            </div>
            </Link>

            <h2 className="mt-4 font-display text-base font-semibold text-forest">
              {t(`ranges.${range}.name`)}
            </h2>
            {/* "From ₹1,250" rather than a price, because a range is not one
                product: the figure is the cheapest published model in it, and
                the height and shelf size the customer picks are what decide
                the real one. The shared `shop.category.from` string, which is
                already the site's word for this. */}
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-forest">
              {c("from", { price: from })}
            </p>
            <p className="mt-2 font-body text-sm leading-relaxed text-stone">
              {t(`ranges.${range}.line`)}
            </p>
            <p className="mt-4 font-body text-xs font-semibold text-forest">
              {ready}
            </p>
            {/* An explicit link as well as the card, for the reason the tray
                grid has one: a linked picture is invisible to anyone scanning
                for something to click, and `mt-auto` lines this row up across
                three cards whose copy runs to different lengths. */}
            <Link
              href={`/shop/racks/${range}`}
              className="mt-auto pt-4 font-body text-xs font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
            >
              {t("cardLink")}
            </Link>
          </li>
          );
        })}
      </ul>

      <p className="mt-12 max-w-2xl rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
        {t("leadNote")}
      </p>
    </section>
  );
}
