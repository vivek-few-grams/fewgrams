import { absoluteUrl } from "@/i18n/alternates";
import { brand } from "@/lib/brand";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import { contact } from "@/lib/content/contact";

/**
 * Structured data (schema.org JSON-LD) — what lets a search result show a
 * price and "In stock" under a product, and what Merchant Center and AI
 * shopping answers check a page against.
 *
 * **Every value is one the page itself prints**, passed in by the page from
 * the same row and content file it renders. Structured data that disagrees
 * with the visible page is a Google policy violation, and a price kept
 * anywhere else is how they would come to disagree.
 *
 * No address and no city: the owner keeps the city out of search for now
 * (20 Oct 2026), and the registered address is for the legal pages.
 */

type Json = Record<string, unknown>;

const ORG_ID = `${brand.url}/#organization`;

/** Who sells — referenced by id from every product, described in full once. */
const seller = { "@type": "Organization", "@id": ORG_ID, name: brand.name, url: brand.url };

const absolute = (src: string) => `${brand.url}${src}`;

/** For the home page: the business, and how to reach it. */
export function organizationLd(): Json {
  const telephone = `+91${contact.phone}`;
  return {
    "@context": "https://schema.org",
    ...seller,
    /* A square raster: Google's logo rules want at least 112px and a format
       Google Images reads, so the 180px app icon rather than the SVG lockup. */
    logo: absolute("/apple-icon.png"),
    email: contact.email,
    telephone,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: contact.email,
      telephone,
      areaServed: "IN",
      availableLanguage: ["English", "Kannada"],
    },
  };
}

/** For the home page: the site, and the search box an assistant can use. */
export function websiteLd(locale: string): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl(locale, "/")}#website`,
    url: absoluteUrl(locale, "/"),
    name: brand.name,
    inLanguage: `${locale}-IN`,
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl(locale, "/search")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** The price the page prints, and whether it is per 100 g. */
export type ProductPrice = { amount: number; per100g: boolean };

export function productLd(p: {
  locale: string;
  /** Without the locale: `/seeds/kale`. */
  path: string;
  /** `productId(kind, key)` — the same id the shopping feed carries. */
  id: string;
  name: string;
  description?: string;
  /** Site paths, best first. */
  images: string[];
  price: ProductPrice;
  inStock: boolean;
  /** Only when it is ours to claim — we grow the greens and pack the seed; a
   *  tray or a block of cocopeat carries its maker's name, not ours. */
  ourBrand: boolean;
  /** The `productId` of the group this is one choice in — a rack's range. */
  group?: string;
}): Json {
  const url = absoluteUrl(p.locale, p.path);
  const availability = `https://schema.org/${p.inStock ? "InStock" : "OutOfStock"}`;
  const price = p.price;

  const offers = price.amount > 0 && {
    "@type": "Offer",
    url,
    price: price.amount,
    priceCurrency: "INR",
    availability,
    itemCondition: "https://schema.org/NewCondition",
    seller,
    /* Sold by weight: the price is per 100 g, said in a form a machine reads
       rather than left to the words around it. */
    ...(price.per100g && {
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: price.amount,
        priceCurrency: "INR",
        referenceQuantity: { "@type": "QuantitativeValue", value: GRAMS_PER_UNIT, unitCode: "GRM" },
      },
    }),
  };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    url,
    sku: p.id,
    ...(p.group && { inProductGroupWithID: p.group }),
    name: p.name,
    ...(p.description && { description: p.description }),
    ...(p.images.length > 0 && { image: p.images.map(absolute) }),
    ...(p.ourBrand && { brand: { "@type": "Brand", name: brand.name } }),
    ...(offers && { offers }),
  };
}

/** A product's id outside the site — the structured data's `sku` and the
 *  shopping feed's `id`, which Merchant Center matches up. Kind and key
 *  together, because "radish" is a microgreen and a seed (see the cart's
 *  keying rule); a rack's key is its cart key, so each colour is its own. */
export function productId(kind: "microgreens" | "seeds" | "trays" | "media" | "racks", key: string): string {
  return `${kind}-${key}`;
}

/** The trail a breadcrumb shows, in the same order, as absolute addresses. */
export function breadcrumbLd(locale: string, items: Array<{ name: string; path: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(locale, item.path),
    })),
  };
}
