import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { enabledProductTypes } from "@/lib/catalogue/visibility";
import type { ResolvedContent } from "@/lib/content/source";
import { getGrowMediumContent, growMediumCutout, growMediumHero } from "@/lib/content/grow-media";
import { getPlanContent } from "@/lib/content/plans";
import { getPackContent } from "@/lib/content/packs";
import { listSellablePacks } from "@/lib/packs/catalogue";
import { getSeedContent, seedCutout, seedHero } from "@/lib/content/seeds";
import { getTrayContent, trayCutout, trayHero } from "@/lib/content/trays";
import { getVarietyContent, varietyCutout, varietyHero } from "@/lib/content/varieties";
import { placeholderFor } from "@/lib/images/placeholder";
import { RACK_RANGES } from "@/lib/racks/cart-key";
import { listSellableRacks } from "@/lib/racks/catalogue";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listPlans } from "@/lib/repo/plans";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listVarieties } from "@/lib/repo/varieties";
import { seedSoldOut } from "@/lib/seeds/stock";
import type { SearchEntry, SearchImage } from "./entry";
import type { SearchKind } from "./match";

/**
 * Everything a visitor can search for, in one locale — SPEC §27.
 *
 * **Exactly what the category pages show, read the same way**: the same
 * `activeOnly` lists, the same "no content file, no entry", the same product
 * type switch. Search is a second way into those pages, so it must never find
 * an item the grid hides — an unpriced microgreen, a tray switched off, a rack
 * range with no published model — and link to a page that turns it away.
 *
 * Snacks are not here: nothing writes a `Product` yet, and the snack grid has
 * no detail page to link to. Add a kind when it does.
 */

/** A search entry with what only the results page prints. */
export type CatalogueEntry = SearchEntry & {
  /** The one-line description, in the visitor's language. */
  blurb: string;
  /** ₹, read fresh; what it is *per* is the kind's (`PRICE_MESSAGE`). Null
   *  for a plan with no monthly price — Pick Your Own. */
  price: number | null;
  /**
   * True for a seed with under 100 g on the shelf — the one kind that sells
   * out (CLAUDE.md, seeds). Search still finds it, because `/seeds` still
   * lists it, marked sold out; **related suggestions skip it**
   * (`src/lib/catalogue/related.ts`), because "Seeds to sow" offering one
   * that cannot be bought is a dead end (the audit, 31 Oct 2026). Never
   * reaches the header box's list, and says nothing of how much is held.
   */
  soldOut: boolean;
};

/** The cut-out when there is one, else the photo — the card grids' order. */
function picture(cutout: { src: string } | null, hero: { src: string } | null): SearchImage | null {
  const chosen = cutout
    ? { src: cutout.src, fit: "contain" as const }
    : hero
      ? { src: hero.src, fit: "cover" as const }
      : null;
  return chosen && { ...chosen, placeholder: placeholderFor(chosen.src) };
}

/** Every distinct value, in locale order — the English and Kannada names of
 *  one product, without the duplicate a fallback leaves. */
const distinct = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((v): v is string => !!v)),
];

export const searchCatalogue = cache(async (locale: string): Promise<CatalogueEntry[]> => {
  const enabled = new Set(await enabledProductTypes());
  const kindLabels = await Promise.all(
    routing.locales.map((l) => getTranslations({ locale: l, namespace: "search.kinds" })),
  );
  const kindTerms = (kind: SearchKind) => distinct(kindLabels.map((t) => t(kind)));

  /**
   * One kind whose words live in a content file — varieties, seeds, trays and
   * grow media share a loader (`createContentSource`) and so share this.
   *
   * Every locale's file is read, for the terms; the visitor's is shown. A row
   * with no content file is skipped, as the grids skip it.
   */
  async function described<
    R extends { contentKey: string },
    T extends { name: string; shortDescription?: string },
  >(
    kind: SearchKind,
    rows: R[],
    opts: {
      get: (key: string, locale: string) => Promise<ResolvedContent<T> | null>;
      href: (key: string) => string;
      image: (content: ResolvedContent<T>) => SearchImage | null;
      price: (row: R) => number;
      soldOut: (row: R) => boolean;
    },
  ): Promise<CatalogueEntry[]> {
    const entries = await Promise.all(
      rows.map(async (row) => {
        const all = await Promise.all(routing.locales.map((l) => opts.get(row.contentKey, l)));
        const shown = await opts.get(row.contentKey, locale);
        if (!shown) return null;
        return {
          kind,
          key: row.contentKey,
          href: opts.href(row.contentKey),
          name: shown.text.name,
          image: opts.image(shown),
          terms: {
            names: distinct(all.map((c) => c?.text.name)),
            kind: kindTerms(kind),
            blurbs: distinct(all.map((c) => c?.text.shortDescription)),
          },
          blurb: shown.text.shortDescription ?? "",
          price: opts.price(row),
          soldOut: opts.soldOut(row),
        } satisfies CatalogueEntry;
      }),
    );
    return entries.filter((e) => e !== null);
  }

  /* `.then` rather than an `await` inside the array: an `await` there would
     finish each table read before the next one started. */
  const [varieties, seeds, trays, media, racks, plans] = await Promise.all([
    enabled.has("microgreens")
      ? listVarieties({ activeOnly: true }).then((rows) =>
          described("variety", rows, {
            get: getVarietyContent,
            href: (key) => `/microgreens/${key}`,
            image: (c) => picture(varietyCutout(c), varietyHero(c)),
            price: (row) => row.pricePer100g,
            /* Grown to order; `onSale` is the whole test. */
            soldOut: () => false,
          }),
        )
      : [],
    enabled.has("seeds")
      ? listSeeds({ activeOnly: true }).then((rows) =>
          described("seed", rows, {
            get: getSeedContent,
            href: (key) => `/seeds/${key}`,
            image: (c) => picture(seedCutout(c), seedHero(c)),
            price: (row) => row.pricePer100g,
            soldOut: (row) => seedSoldOut(row.stockGrams),
          }),
        )
      : [],
    enabled.has("trays")
      ? listTrays({ activeOnly: true }).then((rows) =>
          described("tray", rows, {
            get: getTrayContent,
            href: (key) => `/shop/trays/${key}`,
            image: (c) => picture(trayCutout(c), trayHero(c)),
            price: (row) => row.price,
            /* Stock is a speed here, not a limit: nothing sells out. */
            soldOut: () => false,
          }),
        )
      : [],
    enabled.has("media")
      ? listGrowMedia({ activeOnly: true }).then((rows) =>
          described("media", rows, {
            get: getGrowMediumContent,
            href: (key) => `/shop/grow-media/${key}`,
            image: (c) => picture(growMediumCutout(c), growMediumHero(c)),
            price: (row) => row.price,
            soldOut: () => false,
          }),
        )
      : [],
    enabled.has("racks") ? rackRanges(locale, kindTerms("rack")) : [],
    planEntries(locale, kindTerms("plan")),
  ]);
  /* Not behind a product-type switch: a pack is on sale exactly when it and
     every part are (`listSellablePacks`), which is the test its page applies. */
  const packs = await packEntries(locale, kindTerms("pack"));

  return [...varieties, ...plans, ...seeds, ...trays, ...media, ...racks, ...packs];
});

/**
 * One entry per starter pack on sale (SPEC §29), linking to its page, where
 * the seeds and colour are chosen. Named and described from its content file
 * in every locale; pictured by its rack, or its trays when it has none.
 */
async function packEntries(locale: string, kind: string[]): Promise<CatalogueEntry[]> {
  const packs = await listSellablePacks(locale);
  return Promise.all(
    packs.map(async (p) => {
      const key = p.pack.contentKey;
      const all = await Promise.all(routing.locales.map((l) => getPackContent(key, l)));
      const src = p.rack ? `/img/racks/${p.rack.range}/cutout.webp` : (p.tray.image?.src ?? null);
      return {
        kind: "pack",
        key,
        href: `/shop/packs/${key}`,
        name: p.text.name,
        image: src ? { src, fit: "contain", placeholder: placeholderFor(src) } : null,
        terms: {
          names: distinct(all.map((c) => c?.text.name)),
          kind,
          blurbs: distinct(all.map((c) => c?.text.tagline)),
        },
        blurb: p.text.tagline,
        price: p.pack.price,
        /* `listSellablePacks` already leaves out a pack whose seeds are not
           there to fill it. */
        soldOut: false,
      } satisfies CatalogueEntry;
    }),
  );
}

/**
 * One entry per rack **range** with a published model, as `/shop/racks`
 * lists them. A rack has no content file (SPEC §19.5); its range's name and
 * line are messages, so they are read from `shop.racks.ranges` in every
 * locale. The price is the range's from-price, the cheapest model in it.
 */
async function rackRanges(locale: string, kind: string[]): Promise<CatalogueEntry[]> {
  const racks = await listSellableRacks();
  const all = await Promise.all(
    routing.locales.map((l) => getTranslations({ locale: l, namespace: "shop.racks.ranges" })),
  );
  const shown = await getTranslations({ locale, namespace: "shop.racks.ranges" });
  return RACK_RANGES.flatMap((range) => {
    const inRange = racks.filter((r) => r.range === range);
    if (inRange.length === 0) return [];
    const src = `/img/racks/${range}/cutout.webp`;
    return [
      {
        kind: "rack",
        key: range,
        href: `/shop/racks/${range}`,
        name: shown(`${range}.name`),
        image: { src, fit: "contain", placeholder: placeholderFor(src) },
        terms: {
          names: distinct(all.map((t) => t(`${range}.name`))),
          kind,
          blurbs: distinct(all.map((t) => t(`${range}.line`))),
        },
        blurb: shown(`${range}.line`),
        price: Math.min(...inRange.map((r) => r.price)),
        soldOut: false,
      } satisfies CatalogueEntry,
    ];
  });
}

/**
 * The weekly plans, as the home page lists them, each linking where its card's
 * button does: a subscribable plan to `/subscribe?plan=<key>`, Pick Your Own
 * — no monthly price — to the microgreens it is picked from.
 *
 * A plan's photo is `/img/plans/<key>.webp` when there is one, and the
 * placeholder manifest is how that is known: `placeholders.test.ts` fails on
 * any photo the manifest lacks, and the Lambda has no `public/` folder to look
 * in.
 */
async function planEntries(locale: string, kind: string[]): Promise<CatalogueEntry[]> {
  const plans = await listPlans({ activeOnly: true });
  const entries = await Promise.all(
    plans.map(async (plan) => {
      const all = await Promise.all(routing.locales.map((l) => getPlanContent(plan.contentKey, l)));
      const shown = await getPlanContent(plan.contentKey, locale);
      if (!shown) return null;
      const src = `/img/plans/${plan.contentKey}.webp`;
      const placeholder = placeholderFor(src);
      return {
        kind: "plan",
        key: plan.contentKey,
        href: plan.monthlyPrice === null ? "/microgreens" : `/subscribe?plan=${plan.contentKey}`,
        name: shown.text.name,
        image: placeholder ? { src, fit: "cover", placeholder } : null,
        terms: {
          names: distinct(all.map((c) => c?.text.name)),
          kind,
          blurbs: distinct(all.map((c) => c?.text.tagline)),
        },
        blurb: shown.text.tagline,
        price: plan.monthlyPrice,
        soldOut: false,
      } satisfies CatalogueEntry;
    }),
  );
  return entries.filter((e) => e !== null);
}
