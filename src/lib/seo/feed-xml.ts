import { absoluteUrl } from "@/i18n/alternates";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import { adhocReadyDate, nextDay } from "@/lib/delivery-date";
import type { ProductType } from "@/lib/types";

/**
 * The shopping feed's items and the document they make — SPEC §28.7. What
 * goes in an item is decided by `shopping-feed.ts`, which reads the catalogue;
 * this half only writes, so it is tested without a database.
 */

export type FeedKind = Exclude<ProductType, "snacks">;

/** How each kind is listed. A `Record`, so a new kind has to decide. */
const KIND: Record<
  FeedKind,
  {
    /** Matched to a shipping service in Merchant Center, never shown: greens
     *  travel on our own run inside the delivery area, racks come from their
     *  vendor, everything else is a courier parcel from our pickup. */
    shippingLabel: "greens" | "parcel" | "rack";
    /** We grow the greens and pack the seed; a tray, a block of cocopeat or a
     *  rack carries its maker's name or none, and Merchant Center asks for
     *  the brand to be left empty rather than claimed. */
    ourBrand: boolean;
    /** No barcode exists: our own produce and seed, and goods made without
     *  one. Cocopeat is a branded retail pack that may carry one, and saying
     *  "none exists" about a product that has one gets it disapproved. */
    noIdentifiers: boolean;
  }
> = {
  microgreens: { shippingLabel: "greens", ourBrand: true, noIdentifiers: true },
  seeds: { shippingLabel: "parcel", ourBrand: true, noIdentifiers: true },
  trays: { shippingLabel: "parcel", ourBrand: false, noIdentifiers: true },
  media: { shippingLabel: "parcel", ourBrand: false, noIdentifiers: false },
  racks: { shippingLabel: "rack", ourBrand: false, noIdentifiers: true },
};

export type FeedItem = {
  kind: FeedKind;
  id: string;
  title: string;
  description: string;
  /** Without the locale, as `productLd` takes it. */
  path: string;
  /** Site paths, best first. */
  images: string[];
  /** ₹, as the page prints it. */
  price: number;
  inStock: boolean;
  /** Sold in 100 g units. */
  weighed: boolean;
  /** A green is sown for the order, so it ships when it is grown — a number of
   *  days that differs by variety. Every other kind has one handling time,
   *  set on its shipping service in Merchant Center. */
  handlingDays?: number;
  productType: string;
  variant?: { group: string; size: string; colour?: string };
};

/** Days from today until a green ordered now is cut and delivered — the
 *  date its page prints (`adhocReadyDate`), counted in days. */
export function greensHandlingDays(growDays: number, now: Date = new Date()): number {
  const today = nextDay(now).getTime() - 24 * 60 * 60 * 1000;
  return Math.round((adhocReadyDate(growDays, now).getTime() - today) / (24 * 60 * 60 * 1000));
}

/** Text for XML, with the characters a parser would trip on removed. */
function xml(value: string): string {
  return value
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const absolute = (src: string) => `${brand.url}${src}`;

/** Merchant Center's limits: a 150-character title, 5,000 of description and
 *  ten extra photographs. */
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`);

/** The RSS 2.0 document, with Google's `g:` namespace for the product fields. */
export function feedXml(channel: { title: string; description: string }, items: FeedItem[]): string {
  const tag = (name: string, value: string | number) => `<g:${name}>${xml(String(value))}</g:${name}>`;
  const entries = items.map((item) => {
    const kind = KIND[item.kind];
    const [image, ...more] = item.images;
    const fields = [
      tag("id", item.id),
      tag("title", clip(item.title, 150)),
      tag("description", clip(item.description, 5000)),
      tag("link", absoluteUrl(routing.defaultLocale, item.path)),
      tag("image_link", absolute(image)),
      ...more.slice(0, 10).map((src) => tag("additional_image_link", absolute(src))),
      tag("availability", item.inStock ? "in_stock" : "out_of_stock"),
      tag("price", `${item.price.toFixed(2)} INR`),
      tag("condition", "new"),
      ...(kind.ourBrand ? [tag("brand", brand.name)] : []),
      ...(kind.noIdentifiers ? [tag("identifier_exists", "no")] : []),
      tag("product_type", item.productType),
      tag("shipping_label", kind.shippingLabel),
      ...(item.weighed
        ? [tag("unit_pricing_measure", `${GRAMS_PER_UNIT}g`), tag("unit_pricing_base_measure", `${GRAMS_PER_UNIT}g`)]
        : []),
      ...(item.handlingDays !== undefined
        ? [tag("min_handling_time", item.handlingDays), tag("max_handling_time", item.handlingDays)]
        : []),
      ...(item.variant
        ? [
            tag("item_group_id", item.variant.group),
            tag("size", item.variant.size),
            ...(item.variant.colour ? [tag("color", item.variant.colour)] : []),
          ]
        : []),
    ];
    return `<item>\n${fields.map((f) => `  ${f}`).join("\n")}\n</item>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `<channel>`,
    `<title>${xml(channel.title)}</title>`,
    `<link>${brand.url}</link>`,
    `<description>${xml(channel.description)}</description>`,
    ...entries,
    `</channel>`,
    `</rss>`,
    ``,
  ].join("\n");
}
