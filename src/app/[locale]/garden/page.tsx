import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { GardenJourney } from "@/components/garden/GardenJourney";
import type { GardenProduct, GardenShelf } from "@/components/garden/types";
import {
  TRAY_FINISH_KEYS,
  isLook,
  isTrayFinish,
  type Look,
  type TrayFinish,
} from "@/components/tray-play/kinds";
import { stepFrom } from "@/components/garden/steps";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listSeeds } from "@/lib/repo/seeds";
import { listVarieties } from "@/lib/repo/varieties";
import { attachTrayContent, trayCutout } from "@/lib/content/trays";
import { attachGrowMediumContent, growMediumCutout, growMediumHero } from "@/lib/content/grow-media";
import { attachSeedContent, seedCutout } from "@/lib/content/seeds";
import { attachContent as attachVarietyContent, varietyCutout } from "@/lib/content/varieties";
import { listSellableRacks } from "@/lib/racks/catalogue";
import { isProductTypeEnabled } from "@/lib/catalogue/visibility";
import { seedMaxUnits } from "@/lib/seeds/stock";
import { quickAddFor } from "@/lib/cart/quick-add";

/**
 * `/garden` — the play garden, SPEC §25. A visitor grows a virtual tray from
 * empty to harvest, and meets each thing we sell at the step it is needed.
 *
 * The page is a server component so every product the garden shows is real:
 * read from DynamoDB and the content files exactly as the shop reads them,
 * priced from the record and dropped when it is not on sale. The garden
 * itself — the steps, the stage and the buttons — is `GardenJourney`.
 *
 * The three looks the garden can grow are the three drawn on the home page.
 * Each maps to the seed and the microgreen of the same plant; a seed that is
 * sold out is still sowable in the game but not offered for sale.
 *
 * Dynamic, like the shop: prices and stock are tuned in admin.
 */
export const dynamic = "force-dynamic";

const SEED_FOR: Record<Look, string> = {
  amaranth: "red-amaranthus",
  radish: "radish",
  sunflower: "sunflower",
  mustard: "mustard",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/garden">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "garden.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/garden"),
  };
}

export default async function GardenPage({ params, searchParams }: PageProps<"/[locale]/garden">) {
  const { locale } = await params;
  setRequestLocale(locale);
  /* Where the visitor was: the step, the tray and the seed are in the URL
     (see GardenJourney). Anything unknown falls back to the start. */
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const initial = {
    step: stepFrom(one(q.step)),
    tray: isTrayFinish(one(q.tray)) ? (one(q.tray) as TrayFinish) : TRAY_FINISH_KEYS[0],
    greens: isLook(one(q.greens)) ? (one(q.greens) as Look) : ("radish" as Look),
  };

  const [traysOn, mediaOn, seedsOn, greensOn, racksOn] = await Promise.all([
    isProductTypeEnabled("trays"),
    isProductTypeEnabled("media"),
    isProductTypeEnabled("seeds"),
    isProductTypeEnabled("microgreens"),
    isProductTypeEnabled("racks"),
  ]);
  const [trayRows, mediaRows, seedRows, varietyRows, racks, quickAdd, t, rackText] = await Promise.all([
    traysOn ? listTrays({ activeOnly: true }) : [],
    mediaOn ? listGrowMedia({ activeOnly: true }) : [],
    seedsOn ? listSeeds({ activeOnly: true }) : [],
    greensOn ? listVarieties({ activeOnly: true }) : [],
    racksOn ? listSellableRacks() : [],
    quickAddFor(),
    getTranslations("garden.product"),
    getTranslations("shop.racks.ranges"),
  ]);
  const [trays, media, seeds, varieties] = await Promise.all([
    attachTrayContent(trayRows, locale),
    attachGrowMediumContent(mediaRows, locale),
    attachSeedContent(seedRows, locale),
    attachVarietyContent(varietyRows, locale),
  ]);

  const trayShelf = {} as Record<TrayFinish, GardenProduct | null>;
  for (const finish of TRAY_FINISH_KEYS) {
    const row = trays.find((r) => r.contentKey === finish && r.content);
    trayShelf[finish] = row?.content
      ? {
          kind: "tray",
          key: row.contentKey,
          name: row.content.text.name,
          price: t("pricePack", { price: row.price }),
          href: `/shop/trays/${row.contentKey}`,
          image: trayCutout(row.content),
          quickAdd: quickAdd("tray", row.contentKey, row.content.text.name),
        }
      : null;
  }

  /* The smallest block: one tray's worth, which is what this garden fills.
     Picked by price, not by key order — the 1 kg block (`horti-coir-small`,
     3 Oct 2026) sorts after the 5 kg `horti-coir`. */
  const block = media
    .filter((m) => m.content)
    .reduce<(typeof media)[number] | undefined>(
      (min, m) => (!min || m.price < min.price ? m : min),
      undefined,
    );
  const medium: GardenProduct | null = block?.content
    ? {
        kind: "media",
        key: block.contentKey,
        name: block.content.text.name,
        price: t("priceBlock", { price: block.price }),
        href: `/shop/grow-media/${block.contentKey}`,
        /* No cut-out is drawn for the block yet; its photograph will do
           at thumbnail size. */
        image: growMediumCutout(block.content) ?? growMediumHero(block.content),
        quickAdd: quickAdd("media", block.contentKey, block.content.text.name),
      }
    : null;

  const seedShelf = {} as Record<Look, GardenProduct | null>;
  const greens = {} as GardenShelf["greens"];
  for (const look of Object.keys(SEED_FOR) as Look[]) {
    const key = SEED_FOR[look];
    const seed = seeds.find((s) => s.contentKey === key && s.content);
    const max = seed ? seedMaxUnits(seed.stockGrams) : 0;
    seedShelf[look] =
      seed?.content && max > 0
        ? {
            kind: "seed",
            key,
            name: seed.content.text.name,
            price: t("priceSeed", { price: seed.pricePer100g }),
            href: `/seeds/${key}`,
            image: seedCutout(seed.content),
            quickAdd: quickAdd("seed", key, seed.content.text.name, max),
          }
        : null;
    const green = varieties.find((v) => v.contentKey === key && v.content);
    greens[look] = green?.content
      ? {
          kind: "variety",
          key,
          name: green.content.text.name,
          price: t("priceTray", { price: green.pricePerTray }),
          /* The whole range, not this one variety (the owner, 2 Oct 2026):
             every microgreen in the garden opens `/microgreens`. */
          href: "/microgreens",
          image: varietyCutout(green.content),
          quickAdd: quickAdd("variety", key, green.content.text.name),
        }
      : null;
  }

  /* The light step's rack is the plated shelf range (props.ts,
     `shelfRack`), so that is the range offered, when it has a published
     model. No price is shown (the owner, 2 Oct 2026); a rack has sizes
     and a colour to choose, so it links to its range. */
  const shelfRacks = racks.filter((r) => r.range === "shelf");
  const rack =
    shelfRacks.length > 0
      ? {
          name: rackText("shelf.name"),
          href: "/shop/racks/shelf",
          image: {
            src: "/racks/shelf/cutout.webp",
            alt: rackText("shelf.imageAlt"),
          },
        }
      : null;

  const shelf: GardenShelf = {
    trays: trayShelf,
    medium,
    seeds: seedShelf,
    greens,
    rack,
    freshHref: greensOn ? "/microgreens" : null,
  };

  return <GardenJourney shelf={shelf} initial={initial} />;
}
