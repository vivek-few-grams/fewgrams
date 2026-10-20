import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import { enabledProductTypes } from "@/lib/catalogue/visibility";
import type { ResolvedContent } from "@/lib/content/source";
import { getGrowMediumContent, growMediumHero, growMediumImageUrl } from "@/lib/content/grow-media";
import { getSeedContent, seedCutout, seedHero, seedImageUrl } from "@/lib/content/seeds";
import { getTrayContent, trayHero, trayImageUrl } from "@/lib/content/trays";
import { getVarietyContent, varietyHero, varietyImageUrl } from "@/lib/content/varieties";
import { rackCartKey } from "@/lib/racks/cart-key";
import { listSellableRacks } from "@/lib/racks/catalogue";
import { rackFacts, rackLineName, rackPagePath, rackPhotos, rackSizeLabel, rackSizeParam } from "@/lib/racks/describe";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listVarieties } from "@/lib/repo/varieties";
import { seedMaxUnits } from "@/lib/seeds/stock";
import { greensHandlingDays, type FeedItem } from "./feed-xml";
import { productId } from "./structured-data";

/**
 * The shopping feed — `/feeds/products.xml`, SPEC §28.7. Every product on sale,
 * one item each, in the RSS form Google Merchant Center and Microsoft's
 * Merchant Center both read. It is what puts Fewgrams in Google's free
 * Shopping listings and the shopping answers in its AI Mode.
 *
 * **Each item says what its page says.** Merchant Center visits the `link` and
 * checks the price and stock against the page's structured data (`productLd`),
 * and an item that disagrees is pulled. So every kind is read here the way its
 * page reads it — the same list (`activeOnly`, `onSale` for microgreens), the
 * same price field, the same stock rule, the same name message, and the same
 * id (`productId`). Change what a page prints and change it here too.
 *
 * **One item per thing a customer can put in the cart.** A rack is chosen by
 * height, size and colour on one page, so each choice is an item, linked to
 * the page with that choice in its address, sharing its range as
 * `item_group_id` — how Merchant Center expects variants to arrive.
 *
 * English only. Merchant Center takes one language per feed, and the English
 * pages are the ones the links name.
 *
 * Left out: snacks (nothing written yet), plans (a subscription, not a
 * product Shopping lists), and any item with no photograph or no price, which
 * Merchant Center would refuse.
 */

/** The page's photographs as the gallery orders them: the hero, then (a seed
 *  only) the grid's cut-out, then the gallery files. */
function photos<T>(
  content: ResolvedContent<T>,
  hero: { src: string } | null,
  imageUrl: (key: string, file: string) => string,
  cutout?: { src: string } | null,
): string[] {
  return [
    ...(hero ? [hero.src] : []),
    ...(cutout ? [cutout.src] : []),
    ...(content.images.gallery ?? []).map((file) => imageUrl(content.key, file)),
  ];
}

export async function shoppingFeedItems(now: Date = new Date()): Promise<FeedItem[]> {
  const locale = routing.defaultLocale;
  const [enabled, seo, category, greens, seedSeo, racksT] = await Promise.all([
    enabledProductTypes(),
    getTranslations({ locale, namespace: "common.seo" }),
    getTranslations({ locale, namespace: "common.categories" }),
    getTranslations({ locale, namespace: "microgreens.seo" }),
    getTranslations({ locale, namespace: "seeds.seo" }),
    getTranslations({ locale, namespace: "shop.racks" }),
  ]);
  const on = new Set(enabled);

  /** A short description, then each spec row on a line of its own — a tray
   *  or a block is decided by its four or five facts. */
  const withSpecs = (blurb: string, specs: Array<{ label: string; value: string }>) =>
    [blurb, ...specs.map((row) => seo("feedSpec", { label: row.label, value: row.value }))].join("\n");

  const weighedTitle = (name: string) => seo("feedWeighed", { name, grams: GRAMS_PER_UNIT });

  const [varieties, seeds, trays, media, racks] = await Promise.all([
    on.has("microgreens")
      ? listVarieties({ activeOnly: true }).then((rows) =>
          Promise.all(
            rows.map(async (row): Promise<FeedItem | null> => {
              const content = await getVarietyContent(row.contentKey, locale);
              if (!content) return null;
              const { text } = content;
              return {
                kind: "microgreens",
                id: productId("microgreens", row.contentKey),
                title: weighedTitle(greens("itemTitle", { name: text.name })),
                description: text.description || text.shortDescription || text.name,
                path: `/microgreens/${row.contentKey}`,
                images: photos(content, varietyHero(content), varietyImageUrl),
                price: row.pricePer100g,
                /* A green on sale is always orderable: it is sown for the order. */
                inStock: true,
                weighed: true,
                handlingDays: greensHandlingDays(row.growDays, now),
                productType: category("microgreens"),
              };
            }),
          ),
        )
      : [],
    on.has("seeds")
      ? listSeeds({ activeOnly: true }).then((rows) =>
          Promise.all(
            rows.map(async (row): Promise<FeedItem | null> => {
              const content = await getSeedContent(row.contentKey, locale);
              if (!content) return null;
              const { text } = content;
              return {
                kind: "seeds",
                id: productId("seeds", row.contentKey),
                title: weighedTitle(seedSeo("itemTitle", { name: text.name })),
                description: text.description || text.shortDescription || text.name,
                path: `/seeds/${row.contentKey}`,
                images: photos(content, seedHero(content), seedImageUrl, seedCutout(content)),
                price: row.pricePer100g,
                /* The shelf is the limit: under 100 g held is sold out. */
                inStock: seedMaxUnits(row.stockGrams) > 0,
                weighed: true,
                productType: category("seeds"),
              };
            }),
          ),
        )
      : [],
    on.has("trays")
      ? listTrays({ activeOnly: true }).then((rows) =>
          Promise.all(
            rows.map(async (row): Promise<FeedItem | null> => {
              const content = await getTrayContent(row.contentKey, locale);
              if (!content) return null;
              const { text } = content;
              return {
                kind: "trays",
                id: productId("trays", row.contentKey),
                title: text.name,
                description: withSpecs(text.shortDescription, text.specs),
                path: `/shop/trays/${row.contentKey}`,
                images: photos(content, trayHero(content), trayImageUrl),
                price: row.price,
                /* Nothing here sells out: past the packs held, an order waits a
                   day while more is brought in. */
                inStock: true,
                weighed: false,
                productType: category("trays"),
              };
            }),
          ),
        )
      : [],
    on.has("media")
      ? listGrowMedia({ activeOnly: true }).then((rows) =>
          Promise.all(
            rows.map(async (row): Promise<FeedItem | null> => {
              const content = await getGrowMediumContent(row.contentKey, locale);
              if (!content) return null;
              const { text } = content;
              return {
                kind: "media",
                id: productId("media", row.contentKey),
                title: text.name,
                description: withSpecs(text.shortDescription, text.specs),
                path: `/shop/grow-media/${row.contentKey}`,
                images: photos(content, growMediumHero(content), growMediumImageUrl),
                price: row.price,
                inStock: true,
                weighed: false,
                productType: category("media"),
              };
            }),
          ),
        )
      : [],
    on.has("racks")
      ? listSellableRacks().then((rows) =>
          rows.flatMap((rack) =>
            /* A pipe rack has no colour to choose; a steel rack is one item per
               colour its grade comes in, each its own cart line. */
            (rack.colours.length > 0 ? rack.colours : [null]).map(
              (colour): FeedItem => ({
                kind: "racks",
                id: productId("racks", rackCartKey(rack.sku, colour)),
                title: rackLineName(racksT, rack, colour),
                description: withSpecs(racksT(`ranges.${rack.range}.line`), rackFacts(racksT, rack)),
                path: rackPagePath(rack.range, { h: rack.heightFt, s: rackSizeParam(rack), c: colour }),
                images: rackPhotos(rack.range).map((photo) => photo.src),
                price: rack.price,
                /* Built for each order, never out of stock. */
                inStock: true,
                weighed: false,
                productType: category("racks"),
                variant: {
                  group: productId("racks", rack.range),
                  size: racksT("feedSize", { height: rack.heightFt, size: rackSizeLabel(racksT, rack) }),
                  ...(colour && { colour: racksT(`colours.${colour}`) }),
                },
              }),
            ),
          ),
        )
      : [],
  ]);

  return [...varieties, ...seeds, ...trays, ...media, ...racks].filter(
    (item): item is FeedItem => item !== null && item.price > 0 && item.images.length > 0,
  );
}

