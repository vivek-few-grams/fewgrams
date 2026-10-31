import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { listPacks } from "@/lib/repo/packs";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { getPackContent, type PackText } from "@/lib/content/packs";
import { attachSeedContent, seedCutout } from "@/lib/content/seeds";
import { attachTrayContent, trayCutout } from "@/lib/content/trays";
import { attachGrowMediumContent, growMediumCutout } from "@/lib/content/grow-media";
import type { ContentRow } from "@/lib/content/source";
import { listSellableRacks, type SellableRack } from "@/lib/racks/catalogue";
import { rackCartKey } from "@/lib/racks/cart-key";
import type { RackColour } from "@/lib/racks/colours";
import { seedMaxUnits } from "@/lib/seeds/stock";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import type { Pack, PackPart } from "@/lib/types";
import { packSeedMenu } from "./menu";
import { parsePackCartKey } from "./key";

/**
 * The starter packs as a customer meets them — SPEC §29.
 *
 * A pack row names its parts by key; this joins each key to the row behind it
 * and keeps a pack **only when every part is on sale**: the rack published in
 * a colour, the tray and the cocopeat active with their content files, and
 * enough seeds on the menu to fill the pack. A pack missing any of them is
 * not something anyone could be sent, so it is dropped — the rack catalogue's
 * "half a description is worse than an absence" (`listSellableRacks`).
 *
 * The single gate, as `findSellableRack` is for a rack: the pages, the cart and
 * the checkout all ask here rather than re-deriving the test.
 */

export type PackImage = { src: string; alt: string };

/** The /shop tile's picture of a coir block (CLAUDE.md, grow media). */
const MEDIUM_CUTOUT = "/img/shop/grow-media-block-cutout.webp";

/** The /shop tile's row of our seed packets. A pack's seeds are the buyer's
 *  pick, so the picture is the packets in general rather than one variety's
 *  — which would also change whenever a bill moved the cheapest seed. */
const SEEDS_CUTOUT = "/img/shop/seeds-cutout.webp";

/**
 * The parts' cut-outs, biggest first — the rack, the trays, the seed
 * packets, the block — in the order the comparison lists them. Only pictures
 * that exist; every pack holds seeds, so the packets are always there (the
 * owner, 31 Oct 2026: "we are missing a seed packet image").
 */
export function packPictures(sellable: SellablePack): string[] {
  return [
    sellable.rack ? `/img/racks/${sellable.rack.range}/cutout.webp` : null,
    sellable.tray.image?.src ?? null,
    SEEDS_CUTOUT,
    sellable.medium?.image?.src ?? null,
  ].filter((src): src is string => src !== null);
}

/** A part of a pack as a page shows it. `image` is a transparent cut-out,
 *  never a photograph with its own ground, or null. */
export type PackItem = { key: string; name: string; image: PackImage | null };

/** One seed a pack can be filled with. */
export type PackSeed = PackItem & { stockGrams: number };

/** A stocked part — the tray or the block — with the specs from its own
 *  content file. The first row is what is in its pack, by the tray and grow
 *  media contracts' order ("2 trays: one with drain holes…"). */
export type PackStocked = PackItem & { stockPacks: number; specs: ContentRow[] };

export type SellablePack = {
  pack: Pack;
  text: PackText;
  /** The angle rack, with the colours its grade comes in; null for a pack
   *  with no rack. */
  rack: SellableRack | null;
  tray: PackStocked;
  medium: PackStocked | null;
  /** The cheapest seeds right now (`packSeedMenu`), in that order. */
  menu: PackSeed[];
};

type PackCatalogue = {
  packs: SellablePack[];
  /** Every seed a pack line could still hold — on sale with a content file —
   *  so a line added before the menu moved is still readable. */
  seeds: Map<string, PackSeed>;
};

const loadPackCatalogue = cache(async (locale: string): Promise<PackCatalogue> => {
  const [packs, seedRows, trayRows, mediumRows, racks] = await Promise.all([
    listPacks({ activeOnly: true }),
    listSeeds({ activeOnly: true }),
    listTrays({ activeOnly: true }),
    listGrowMedia({ activeOnly: true }),
    listSellableRacks(),
  ]);
  if (packs.length === 0) return { packs: [], seeds: new Map() };

  const [withSeedContent, withTrayContent, withMediumContent] = await Promise.all([
    attachSeedContent(seedRows, locale),
    attachTrayContent(trayRows, locale),
    attachGrowMediumContent(mediumRows, locale),
  ]);

  const seedsWithText = withSeedContent.filter((s) => s.content && s.pricePer100g > 0);
  const seeds = new Map<string, PackSeed>(
    seedsWithText.map((s) => [
      s.contentKey,
      {
        key: s.contentKey,
        name: s.content!.text.name,
        image: seedCutout(s.content!),
        stockGrams: s.stockGrams,
      },
    ]),
  );

  const out: SellablePack[] = [];
  for (const pack of packs) {
    if (!(pack.price > 0) || pack.seedCount < 1 || pack.trayCount < 1) continue;
    const content = await getPackContent(pack.contentKey, locale);
    if (!content) continue;

    /* Open-frame angle racks only: the tube light mounts on their middle rail
       and they ship from our own pickup with everything else (SPEC §29.1). */
    let rack: SellableRack | null = null;
    if (pack.rackSku !== null) {
      const sku = pack.rackSku.toLowerCase();
      rack = racks.find((r) => r.range === "angle" && r.sku.toLowerCase() === sku) ?? null;
      if (!rack || pack.rackCount < 1) continue;
    }

    const trayRow = withTrayContent.find((t) => t.contentKey === pack.trayKey && t.content);
    if (!trayRow?.content) continue;

    let medium: SellablePack["medium"] = null;
    if (pack.mediumKey !== null) {
      const m = withMediumContent.find((r) => r.contentKey === pack.mediumKey && r.content);
      if (!m?.content || pack.mediumCount < 1) continue;
      medium = {
        key: m.contentKey,
        name: m.content.text.name,
        /* The pack pictures its parts as cut-outs on a coloured ground, and a
           cocopeat block has only a photograph — so the shop's own block
           cut-out stands in, as it does on the /shop tile. */
        image: growMediumCutout(m.content) ?? { src: MEDIUM_CUTOUT, alt: m.content.text.name },
        stockPacks: m.stockPacks,
        specs: m.content.text.specs,
      };
    }

    const menu = packSeedMenu(seedsWithText, pack.menuSize).map((s) => seeds.get(s.contentKey)!);
    if (menu.length < pack.seedCount) continue;

    out.push({
      pack,
      text: content.text,
      rack,
      tray: {
        key: trayRow.contentKey,
        name: trayRow.content.text.name,
        image: trayCutout(trayRow.content),
        stockPacks: trayRow.stockPacks,
        specs: trayRow.content.text.specs,
      },
      medium,
      menu,
    });
  }
  return { packs: out, seeds };
});

/** Every pack on sale, in column order. */
export async function listSellablePacks(locale: string): Promise<SellablePack[]> {
  return (await loadPackCatalogue(locale)).packs;
}

export async function findSellablePack(packKey: string, locale: string): Promise<SellablePack | null> {
  return (await listSellablePacks(locale)).find((p) => p.pack.contentKey === packKey) ?? null;
}

/** Whether any pack is on sale — `/shop` and the garden show their links
 *  only then. */
export async function hasSellablePacks(locale: string): Promise<boolean> {
  return (await listSellablePacks(locale)).length > 0;
}

/**
 * The header's cheaper question: is any pack active, priced and written? One
 * Query, because the header is on every page and the full test reads the rack
 * card, three catalogues and every seed. A pack that passes this but has a
 * part off sale shows the packs page's empty state for as long as that lasts.
 */
export const hasActivePacks = cache(async (): Promise<boolean> => {
  const packs = (await listPacks({ activeOnly: true })).filter((p) => p.price > 0);
  for (const p of packs) if (await getPackContent(p.contentKey, "en")) return true;
  return false;
});

/** A pack line, resolved: the pack, the choices made, and what is inside. */
export type PackLine = {
  sellable: SellablePack;
  colour: RackColour | null;
  seeds: PackSeed[];
  parts: PackPart[];
  /** "Orange · Beetroot, Dill, Kale, Radish" — the choices, in words. */
  detail: string;
  /** Packs one line can hold: the twenty-unit cap, and 100 g of every chosen
   *  seed per pack against the shelf. */
  maxUnits: number;
};

/**
 * The pack a cart key describes, or null when it is not one anybody can buy.
 *
 * `fresh` is the stricter test, for adding: every seed must be on the pack's
 * menu **now**. A line already in a cart is held to less — each seed still on
 * sale — because the menu moves with bill costs, and a customer should not
 * find their basket refused because a seed's cost rose between the add and
 * the checkout. Either way the colour must be one the rack comes in, there
 * must be exactly the pack's number of seeds, and the pack must still be on
 * sale.
 */
export async function resolvePackLine(
  key: string,
  locale: string,
  opts: { fresh: boolean },
): Promise<PackLine | null> {
  const choice = parsePackCartKey(key);
  if (!choice) return null;
  const { packs, seeds: allSeeds } = await loadPackCatalogue(locale);
  const sellable = packs.find((p) => p.pack.contentKey === choice.packKey);
  if (!sellable) return null;
  const { pack, rack } = sellable;

  if (rack) {
    if (choice.colour === null || !rack.colours.includes(choice.colour)) return null;
  } else if (choice.colour !== null) {
    return null;
  }

  if (choice.seeds.length !== pack.seedCount) return null;
  const pool = opts.fresh ? new Map(sellable.menu.map((s) => [s.key, s])) : allSeeds;
  const seeds = choice.seeds.map((k) => pool.get(k));
  if (seeds.some((s) => !s)) return null;
  const chosen = seeds as PackSeed[];

  const parts: PackPart[] = [
    ...(rack && choice.colour
      ? [{ kind: "rack" as const, key: rackCartKey(rack.sku, choice.colour), units: pack.rackCount }]
      : []),
    { kind: "tray", key: pack.trayKey, units: pack.trayCount },
    ...chosen.map((s) => ({ kind: "seed" as const, key: s.key, units: 1 })),
    ...(pack.mediumKey !== null
      ? [{ kind: "media" as const, key: pack.mediumKey, units: pack.mediumCount }]
      : []),
  ];

  const colours = await getTranslations({ locale, namespace: "shop.racks.colours" });
  const seedNames = chosen.map((s) => s.name).join(", ");
  const detail = choice.colour ? `${colours(choice.colour)} · ${seedNames}` : seedNames;

  return {
    sellable,
    colour: choice.colour,
    seeds: chosen,
    parts,
    detail,
    maxUnits: Math.min(MAX_UNITS_PER_LINE, ...chosen.map((s) => seedMaxUnits(s.stockGrams))),
  };
}
