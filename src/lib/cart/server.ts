import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { listVarieties } from "@/lib/repo/varieties";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { attachContent, varietyHero } from "@/lib/content/varieties";
import { attachSeedContent, seedHero } from "@/lib/content/seeds";
import { attachTrayContent, trayHero } from "@/lib/content/trays";
import { attachGrowMediumContent, growMediumHero } from "@/lib/content/grow-media";
import { findSellableRack } from "@/lib/racks/catalogue";
import { rackLineName } from "@/lib/racks/describe";
import { rackReadyDate } from "@/lib/racks/lead-time";
import { seedMaxUnits, seedReadyDate, type SeedSourcing } from "@/lib/seeds/stock";
import { fromShelf, heldReadyDate } from "@/lib/trays/lead-time";
import { adhocReadyDate, latestDate } from "@/lib/delivery-date";
import {
  CART_COOKIE,
  GRAMS_PER_UNIT,
  MAX_UNITS_PER_LINE,
  cartUnitCount,
  isWeighed,
  lineId,
  parseCart,
  unitsFor,
  serialiseCart,
  type CartKind,
  type CartLine,
} from "./cart";

/**
 * Server-side cart reading — SPEC §18.6, extended to seeds and then to trays
 * on 17 Sep 2026.
 *
 * The cookie holds kinds, keys and quantities; **everything else is recomputed
 * here** from DynamoDB and the content files on every read. That is what makes
 * the displayed price the current price rather than whatever was true when the
 * customer added the item, what makes a client-supplied total impossible
 * (SPEC §9), and — since the seed rule changed on 17 Sep 2026 — what decides
 * whether each seed line is promised for tomorrow or for the vendor run, from
 * the stock the owner holds *now* rather than when the line was added.
 *
 * Mutations live in `src/app/[locale]/cart/actions.ts`. A server *component*
 * cannot write a cookie, so this module only reads.
 */

/** One hydrated line, with everything a page needs to render it. */
export type CartItem = {
  kind: CartKind;
  key: string;
  units: number;
  /**
   * Weight of this line, or **null for a kind that is not sold by weight**.
   *
   * Null rather than 0, deliberately: 0 g reads as "we weighed it and it came
   * to nothing", and a page rendering `{grams}` would print "0 g" beside a
   * tray. Null makes the page branch instead of quietly printing a wrong
   * figure. See `isWeighed`.
   */
  grams: number | null;
  name: string;
  /**
   * ₹ for **one unit of this kind** — per tray for a green, per 100 g for a
   * seed, per pack for a tray.
   *
   * Renamed from `pricePer100g` on 17 Sep 2026, when trays made that name
   * false for a third of the cart. The rename is the point: a field called
   * `pricePer100g` holding ₹160 for a pack of two trays is exactly the kind of
   * thing that gets multiplied by a weight two screens away. A green stopped
   * being priced per 100 g on 19 Sep 2026 and joined the kinds this name was
   * written for.
   */
  unitPrice: number;
  /** `units × unitPrice`, in rupees. Computed, never stored. */
  lineTotal: number;
  image: { src: string; alt: string } | null;
  /**
   * The ceiling this line's stepper may reach — `MAX_UNITS_PER_LINE`, and
   * for a seed the lower of that and what is on the shelf in 50 g units
   * (the owner, 25 Sep 2026). **0 means sold out.** A line above it (the
   * shelf fell after it was added) is listed in `overStock` and checkout
   * refuses it until reduced.
   */
  maxUnits: number;
  /** Varieties only — nothing else is grown. */
  growDays: number | null;
  /**
   * When this line alone would reach the customer. **Every line has one**, and
   * the reason differs by kind — three rules now: a green's is `growDays`
   * after tomorrow's sow, a seed's is tomorrow off the shelf, a tray's or a
   * grow medium's is tomorrow up to what is held and a day later beyond.
   *
   * Shown per line so a customer can see which item is holding the order
   * back — which is the whole reason the order's single date is not a
   * surprise.
   */
  readyDate: Date;
  /** For what we hold — seeds, trays, grow media: `"shelf"` when this line
   *  comes off our shelf, `"vendor"` when a tray or grow-media line is more
   *  than we hold and is brought in overnight (the owner, 25 Sep 2026). A
   *  seed is always `"shelf"`. Null for greens and racks. */
  sourcing: SeedSourcing | null;
};

export type HydratedCart = {
  items: CartItem[];
  unitCount: number;
  grams: number;
  /** Sum of the line totals. Delivery is **not** included: SPEC §7 has set no
   *  ad-hoc rate for greens, seed or trays, and inventing one here would quote
   *  a number the business has not. */
  subtotal: number;
  /**
   * One delivery, on the slowest line's date (SPEC §18.6, §22.2). Null only
   * for an empty cart.
   *
   * It used to be null for a seed-only cart too, because a seed had nothing to
   * grow and SPEC §7 had set no dispatch rule for one. The rule exists now, so
   * every cart that holds anything can be given a date.
   */
  readyDate: Date | null;
  /** True when the lines do not all arrive on the same day, so the page can
   *  explain why everything comes on one later date instead of leaving it a
   *  surprise. */
  splitDates: boolean;
  /** True when at least one line is a seed, so the page can say that stock
   *  items travel with the greens rather than separately. */
  hasSeeds: boolean;
  /** True when at least one line is a green, which is what makes the date a
   *  grow window rather than a dispatch. */
  hasVarieties: boolean;
  /** True when at least one line is a tray or a mat. */
  hasTrays: boolean;
  /** True when at least one line is a grow medium. */
  hasMedia: boolean;
  /** True when at least one line is a rack, so the page can say that racks are
   *  built to order and delivered inside Bengaluru — a three-day line sitting
   *  under a ten-day one needs a reason, not just a date. */
  hasRacks: boolean;
  /** `lineId`s of seed lines asking for more than the shelf now holds —
   *  including a seed now sold out. Checkout refuses until they are reduced;
   *  the cart page says which. Never says how much is held. */
  overStock: string[];
  /**
   * Keys that were in the cookie but no longer resolve to something sellable —
   * deactivated in admin, deleted, or its content file removed.
   *
   * Surfaced rather than silently swallowed: the customer put it there, so
   * "it is gone" is information they are owed. The stale cookie entry is
   * cleaned up by the next mutation; a read cannot write.
   */
  unavailable: string[];
};

/** The raw cookie lines. Cheap — no database work. */
export async function readCartLines(): Promise<CartLine[]> {
  const store = await cookies();
  return parseCart(store.get(CART_COOKIE)?.value);
}

/** Total units across every kind, for the header badge. One catalogue read is
 *  avoided entirely: the badge needs no names or prices. */
export async function readCartCount(): Promise<number> {
  return cartUnitCount(await readCartLines());
}

/**
 * How many 100 g units of one item are already in the cart.
 *
 * Seeds the stepper on a detail page so the control and the header badge
 * cannot disagree — the stepper used to mount at 1 while the badge read 3.
 * Cookie-only, so it costs no catalogue read.
 */
export async function readCartUnitsFor(kind: CartKind, key: string): Promise<number> {
  return unitsFor(await readCartLines(), kind, key);
}

const EMPTY: HydratedCart = {
  items: [],
  unitCount: 0,
  grams: 0,
  subtotal: 0,
  readyDate: null,
  splitDates: false,
  hasSeeds: false,
  hasVarieties: false,
  hasTrays: false,
  hasMedia: false,
  hasRacks: false,
  overStock: [],
  unavailable: [],
};

/**
 * Join the cookie to the catalogue.
 *
 * Only `active` rows with a content file are sellable, which is the same test
 * the public pages apply — so nothing can be unbuyable on its own page yet
 * checkout-able from the cart. **Stock is not one of those tests.** A seed we
 * hold none of is still sellable; it just arrives on the vendor's date rather
 * than tomorrow (SPEC §22.2). A tray has no stock to test at all (§23.1).
 */
export async function hydrateCart(
  locale: string,
  now: Date = new Date(),
): Promise<HydratedCart> {
  const lines = await readCartLines();
  if (lines.length === 0) return EMPTY;

  /* Each catalogue is read only when the cart actually holds that kind — a
     greens-only cart should not pay for a seed query, and now not for a tray
     query either. */
  const wants = (kind: CartKind) => lines.some((l) => l.kind === kind);
  const [varieties, seeds, trays, media] = await Promise.all([
    wants("variety") ? listVarieties({ activeOnly: true }) : [],
    wants("seed") ? listSeeds({ activeOnly: true }) : [],
    wants("tray") ? listTrays({ activeOnly: true }) : [],
    wants("media") ? listGrowMedia({ activeOnly: true }) : [],
  ]);
  const [withVarietyContent, withSeedContent, withTrayContent, withMediumContent] =
    await Promise.all([
      attachContent(varieties, locale),
      attachSeedContent(seeds, locale),
      attachTrayContent(trays, locale),
      attachGrowMediumContent(media, locale),
    ]);

  /**
   * How a kind's delivery date is worked out. **Internal — never reaches a
   * page.**
   *
   * A discriminated union rather than three nullable fields on `Base`: with
   * several nullable fields whose valid combinations existed only in a
   * comment. This way the switch below is exhaustive, and a fourth kind is a
   * compile error rather than a silently missed branch.
   */
  type Timing =
    | { by: "grow"; growDays: number }
    | { by: "shelf" }
    /* Trays and grow media, held in Bengaluru since 25 Sep 2026: next day
       up to the packs held, a day later beyond (`heldReadyDate`). The
       count never reaches a page. */
    | { by: "held"; stockPacks: number }
    /* A rack's is our own build time, one constant for every range
       (`RACK_LEAD_DAYS`). */
    | { by: "build" };

  /**
   * A catalogue row, minus everything that depends on how much was ordered.
   *
   * `readyDate`, `grams` and `sourcing` are **not** here on purpose: since
   * 17 Sep 2026 a seed's date is a function of the quantity as well as the row,
   * so computing it once per catalogue row would freeze it at the wrong answer.
   */
  type Base = Omit<CartItem, "units" | "grams" | "lineTotal" | "readyDate" | "sourcing"> & {
    timing: Timing;
  };

  const byId = new Map<string, Base>();
  for (const v of withVarietyContent) {
    if (!v.content) continue;
    byId.set(lineId({ kind: "variety", key: v.contentKey }), {
      kind: "variety",
      key: v.contentKey,
      name: v.content.text.name,
      unitPrice: v.pricePerTray,
      image: varietyHero(v.content),
      maxUnits: MAX_UNITS_PER_LINE,
      growDays: v.growDays,
      timing: { by: "grow", growDays: v.growDays },
    });
  }
  for (const s of withSeedContent) {
    if (!s.content) continue;
    /* The shelf is the limit (the owner, 25 Sep 2026): `maxUnits` is what
       is held, in 50 g units. A seed we hold none of stays a line — with a
       max of 0, so the cart says it is sold out rather than dropping it. */
    byId.set(lineId({ kind: "seed", key: s.contentKey }), {
      kind: "seed",
      key: s.contentKey,
      name: s.content.text.name,
      unitPrice: s.pricePer50g,
      image: seedHero(s.content),
      maxUnits: seedMaxUnits(s.stockGrams),
      growDays: null,
      timing: { by: "shelf" },
    });
  }
  for (const tr of withTrayContent) {
    if (!tr.content) continue;
    /* No stock cap: more than is held still sells, a day later (the owner,
       25 Sep 2026). `price` is per pack, which is why `unitPrice` carries no
       weight in its name. */
    byId.set(lineId({ kind: "tray", key: tr.contentKey }), {
      kind: "tray",
      key: tr.contentKey,
      name: tr.content.text.name,
      unitPrice: tr.price,
      image: trayHero(tr.content),
      maxUnits: MAX_UNITS_PER_LINE,
      growDays: null,
      timing: { by: "held", stockPacks: tr.stockPacks },
    });
  }

  for (const m of withMediumContent) {
    if (!m.content) continue;
    /* The tray rule exactly. */
    byId.set(lineId({ kind: "media", key: m.contentKey }), {
      kind: "media",
      key: m.contentKey,
      name: m.content.text.name,
      unitPrice: m.price,
      image: growMediumHero(m.content),
      maxUnits: MAX_UNITS_PER_LINE,
      growDays: null,
      timing: { by: "held", stockPacks: m.stockPacks },
    });
  }

  /* Racks are resolved **per line, by key**, which is the one kind that cannot
     be loaded as a catalogue and matched afterwards. The other three each have
     a content folder with a handful of files; a rack key is one combination out
     of 100 published models crossed with the colours its grade offers, so
     listing "all sellable racks" as `byId` entries would build a map of
     several hundred to answer at most twelve questions. `findSellableRack`
     shares one `cache`d rate-card read between them.

     It is also the kind with no content file, so its name is composed from its
     own figures (`rackLineName`) — see §19.9 on why a model has no stored
     customer-facing name. */
  if (wants("rack")) {
    const t = await getTranslations({ locale, namespace: "shop.racks" });
    for (const line of lines) {
      if (line.kind !== "rack") continue;
      const found = await findSellableRack(line.key);
      if (!found) continue;
      byId.set(lineId(line), {
        kind: "rack",
        key: line.key,
        name: rackLineName(t, found.rack, found.colour),
        /* The published price, read and never recomputed — see `catalogue.ts`.
           One rack is one unit, so `unitPrice` is the rack. */
        unitPrice: found.rack.price,
        /* One photograph per *range*, not per model: a 4 ft and a 6 ft rack of
           the same range are the same object at two heights, and there is no
           per-model photography and no content file to name one from. The alt
           text is the line's own name, which is more specific than the range
           alt would be. */
        image: {
          src: `/racks/${found.rack.range}/cutout.webp`,
          alt: rackLineName(t, found.rack, found.colour),
        },
        maxUnits: MAX_UNITS_PER_LINE,
        growDays: null,
        timing: { by: "build" },
      });
    }
  }

  const items: CartItem[] = [];
  const unavailable: string[] = [];

  /* Cookie order is preserved — it is the order the customer added things in,
     and re-sorting a cart makes a line appear to move when you edit it. */
  for (const line of lines) {
    const base = byId.get(lineId(line));
    if (!base) {
      unavailable.push(line.key);
      continue;
    }
    /* A weight only for the kinds that have one. A tray is a pack, and
       printing "1 pack · 100 g" beside it would be an invented figure. */
    const grams = isWeighed(line.kind) ? line.units * GRAMS_PER_UNIT : null;

    /* `timing` is destructured off rather than spread through, because it
       carries the grams we hold and `CartItem` is handed to a page. Every date
       here is per line and recomputed on every read — a green's from its grow
       window, a seed's from this quantity against today's shelf figure, a
       tray's from its supplier's lead time, a rack's from our own build
       time. */
    const { timing, ...rest } = base;
    const sourcing: SeedSourcing | null =
      timing.by === "shelf"
        ? "shelf"
        : timing.by === "held"
          ? fromShelf(line.units, timing.stockPacks)
            ? "shelf"
            : "vendor"
          : null;

    const readyDate =
      timing.by === "grow"
        ? adhocReadyDate(timing.growDays, now)
        : timing.by === "shelf"
          ? seedReadyDate(now)
          : timing.by === "held"
            ? heldReadyDate(line.units, timing.stockPacks, now)
            : rackReadyDate(now);

    items.push({
      ...rest,
      units: line.units,
      grams,
      lineTotal: line.units * base.unitPrice,
      readyDate,
      sourcing,
    });
  }

  const dates = items.map((i) => i.readyDate);

  return {
    items,
    unitCount: items.reduce((n, i) => n + i.units, 0),
    /* Weighed kinds only — a tray contributes nothing to a weight, which is
       why `grams` is nullable per line rather than 0. */
    grams: items.reduce((n, i) => n + (i.grams ?? 0), 0),
    subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
    readyDate: latestDate(dates),
    /* On the day, not the instant — every date here is already 00:00 IST, so
       comparing timestamps is comparing calendar days. */
    splitDates: new Set(dates.map((d) => d.getTime())).size > 1,
    hasSeeds: items.some((i) => i.kind === "seed"),
    hasVarieties: items.some((i) => i.kind === "variety"),
    hasTrays: items.some((i) => i.kind === "tray"),
    hasMedia: items.some((i) => i.kind === "media"),
    hasRacks: items.some((i) => i.kind === "rack"),
    unavailable,
    overStock: items.filter((i) => i.units > i.maxUnits).map(lineId),
  };
}

/** Cookie options, in one place so a mutation cannot set them differently
 *  from the read path's expectations. */
export function cartCookieOptions() {
  return {
    /* No client script needs to read this, and one that could read it could
       also forge it. Every mutation goes through a server action. */
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    /* 30 days. Long enough that a cart survives a weekend of deliberation,
       short enough that prices are not being re-quoted from last quarter. */
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  };
}

/** Write cart lines back to the cookie. Only callable from a server action or
 *  route handler — Next refuses a cookie write during a component render. */
export async function writeCartLines(lines: CartLine[]): Promise<void> {
  const store = await cookies();
  const value = serialiseCart(lines);
  if (!value) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, value, cartCookieOptions());
}
