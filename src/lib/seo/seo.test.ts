import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localeAlternates } from "@/i18n/alternates";
import robots from "@/app/robots";
import { clipDescription } from "./metadata";
import { rackPagePath } from "@/lib/racks/describe";
import { feedXml, greensHandlingDays, type FeedItem } from "./feed-xml";
import { productId, productLd } from "./structured-data";

describe("localeAlternates", () => {
  it("names every language absolutely, with English as x-default", () => {
    expect(localeAlternates("kn", "/microgreens/kale")).toEqual({
      canonical: "https://fewgrams.com/kn/microgreens/kale",
      languages: {
        en: "https://fewgrams.com/microgreens/kale",
        kn: "https://fewgrams.com/kn/microgreens/kale",
        "x-default": "https://fewgrams.com/microgreens/kale",
      },
    });
  });

  it("gives the home page no trailing path", () => {
    const home = localeAlternates("en", "/");
    expect(home.canonical).toBe("https://fewgrams.com");
    expect(home.languages.kn).toBe("https://fewgrams.com/kn");
  });
});

describe("clipDescription", () => {
  it("leaves a short description alone, whitespace tidied", () => {
    expect(clipDescription("  Grown  to order.\n Cut today. ")).toBe("Grown to order. Cut today.");
  });

  it("keeps whole sentences when they fill at least half the room", () => {
    const first = "A".repeat(100) + ".";
    expect(clipDescription(`${first} ${"B".repeat(100)}.`)).toBe(first);
  });

  it("keeps a sentence that ends exactly at the limit", () => {
    const first = "A".repeat(159) + ".";
    expect(clipDescription(`${first} More words here.`)).toBe(first);
  });

  it("otherwise stops at a whole word, with an ellipsis", () => {
    const clipped = clipDescription(`${"word ".repeat(60)}end.`);
    expect(clipped.length).toBeLessThanOrEqual(160);
    expect(clipped).toMatch(/ word…$/);
  });
});

describe("productLd", () => {
  const base = {
    locale: "en",
    path: "/seeds/kale",
    id: "seeds-kale",
    name: "Kale microgreen seeds",
    images: ["/img/seeds/kale/hero.jpg"],
    inStock: true,
    ourBrand: true,
  };

  it("prices a weighed product per 100 g, in rupees, on the live site", () => {
    const ld = productLd({ ...base, price: { amount: 180, per100g: true } });
    expect(ld.image).toEqual(["https://fewgrams.com/img/seeds/kale/hero.jpg"]);
    expect(ld.offers).toMatchObject({
      price: 180,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: "https://fewgrams.com/seeds/kale",
      priceSpecification: { referenceQuantity: { value: 100, unitCode: "GRM" } },
    });
  });

  /* An unpriced product is off sale; an offer at ₹0 would be a false one. */
  it("offers nothing at price 0", () => {
    expect(productLd({ ...base, price: { amount: 0, per100g: true } })).not.toHaveProperty("offers");
  });

  it("says sold out when it is", () => {
    const ld = productLd({ ...base, inStock: false, price: { amount: 180, per100g: true } });
    expect(ld.offers).toMatchObject({ availability: "https://schema.org/OutOfStock" });
  });

  it("claims our brand only when asked to", () => {
    const tray = productLd({ ...base, ourBrand: false, price: { amount: 160, per100g: false } });
    expect(tray).not.toHaveProperty("brand");
    expect(tray.offers).not.toHaveProperty("priceSpecification");
  });

  /* A rack page describes the rack on screen, one of its range's choices. */
  it("names the group a choice belongs to", () => {
    const rack = productLd({
      ...base,
      path: rackPagePath("pipe", { h: 6, s: "1.5x3", c: null }),
      id: productId("racks", "pr-6f-5s-1.5x3"),
      ourBrand: false,
      price: { amount: 2599, per100g: false },
      group: productId("racks", "pipe"),
    });
    expect(rack).toMatchObject({ sku: "racks-pr-6f-5s-1.5x3", inProductGroupWithID: "racks-pipe" });
    expect(rack.offers).toMatchObject({ price: 2599, url: "https://fewgrams.com/shop/racks/pipe?h=6&s=1.5x3" });
  });
});

describe("rackPagePath", () => {
  it("puts the choice in the address the range page reads", () => {
    expect(rackPagePath("angle", { h: 6, s: "1.25x3", c: "orange" })).toBe("/shop/racks/angle?h=6&s=1.25x3&c=orange");
    expect(rackPagePath("pipe", { h: 4, s: "1x2", c: null })).toBe("/shop/racks/pipe?h=4&s=1x2");
  });
});

describe("shopping feed", () => {
  const green: FeedItem = {
    kind: "microgreens",
    id: "microgreens-broccoli",
    title: "Broccoli microgreens, 100 g",
    description: "Mild & sweet <b>leaves</b>.",
    path: "/microgreens/broccoli",
    images: ["/img/varieties/broccoli/hero.jpg", "/img/varieties/broccoli/tray.jpg"],
    price: 180,
    inStock: true,
    weighed: true,
    handlingDays: 9,
    productType: "Microgreens",
  };
  const rack: FeedItem = {
    kind: "racks",
    id: "racks-rk-6f-5s-1.25x3-1.4-orange",
    title: "Shelf racks · 6 ft · 5 shelves · 1.25 × 3 ft · Orange",
    description: "Steel shelves.\nHeight: 6 ft",
    path: "/shop/racks/shelf?h=6&s=1.25x3&c=orange",
    images: ["/img/racks/shelf/cutout.webp"],
    price: 4199,
    inStock: true,
    weighed: false,
    productType: "Racks",
    variant: { group: "racks-shelf", size: "6 ft high, 1.25 × 3 ft", colour: "Orange" },
  };
  const doc = feedXml({ title: "Fewgrams", description: "Fresh & local" }, [green, rack]);
  const item = (i: number) => doc.split("<item>")[i + 1].split("</item>")[0];

  it("is an RSS document in Google's namespace, escaped", () => {
    expect(doc).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0" xmlns:g="http:\/\/base.google.com\/ns\/1.0">/);
    expect(doc).toContain("<description>Fresh &amp; local</description>");
    expect(item(0)).toContain("<g:description>Mild &amp; sweet &lt;b&gt;leaves&lt;/b&gt;.</g:description>");
    expect(doc.match(/<item>/g)).toHaveLength(2);
  });

  it("links the English page and the photographs on the live site, priced in rupees", () => {
    expect(item(0)).toContain("<g:link>https://fewgrams.com/microgreens/broccoli</g:link>");
    expect(item(0)).toContain("<g:image_link>https://fewgrams.com/img/varieties/broccoli/hero.jpg</g:image_link>");
    expect(item(0)).toContain("<g:additional_image_link>https://fewgrams.com/img/varieties/broccoli/tray.jpg</g:additional_image_link>");
    expect(item(0)).toContain("<g:price>180.00 INR</g:price>");
    expect(item(1)).toContain("<g:link>https://fewgrams.com/shop/racks/shelf?h=6&amp;s=1.25x3&amp;c=orange</g:link>");
  });

  it("prices a weighed product per 100 g and gives a green its own growing time", () => {
    expect(item(0)).toContain("<g:unit_pricing_measure>100g</g:unit_pricing_measure>");
    expect(item(0)).toContain("<g:max_handling_time>9</g:max_handling_time>");
    expect(item(0)).toContain("<g:shipping_label>greens</g:shipping_label>");
    expect(item(1)).not.toContain("unit_pricing");
    expect(item(1)).not.toContain("handling_time");
  });

  it("claims our brand only for our own produce and seed", () => {
    expect(item(0)).toContain("<g:brand>Fewgrams</g:brand>");
    expect(item(0)).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(item(1)).not.toContain("<g:brand>");
  });

  it("sends a rack as one choice in its range's group", () => {
    expect(item(1)).toContain("<g:item_group_id>racks-shelf</g:item_group_id>");
    expect(item(1)).toContain("<g:color>Orange</g:color>");
    expect(item(1)).toContain("<g:size>6 ft high, 1.25 × 3 ft</g:size>");
    expect(item(1)).toContain("<g:shipping_label>rack</g:shipping_label>");
  });

  it("says out of stock when it is", () => {
    const soldOut = feedXml({ title: "F", description: "D" }, [{ ...green, kind: "seeds", inStock: false }]);
    expect(soldOut).toContain("<g:availability>out_of_stock</g:availability>");
  });

  /* Ordered at 10:00 IST on a Monday: sown Tuesday, cut eight days later. */
  it("counts a green's days to the date its page prints", () => {
    expect(greensHandlingDays(8, new Date("2026-10-19T10:00:00+05:30"))).toBe(9);
    expect(greensHandlingDays(8, new Date("2026-10-19T23:59:00+05:30"))).toBe(9);
  });
});

describe("robots.txt", () => {
  const rules = robots();
  const group = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
  const disallow = [group.disallow].flat();

  it("keeps crawlers out of per-person pages in both languages", () => {
    for (const p of ["/cart", "/kn/cart", "/checkout", "/kn/account", "/admin", "/api/"]) {
      expect(disallow).toContain(p);
    }
  });

  it("leaves Next's scripts and images crawlable, and points at the sitemap", () => {
    expect(disallow.some((p) => p?.startsWith("/_next"))).toBe(false);
    expect(rules.sitemap).toBe("https://fewgrams.com/sitemap.xml");
  });
});

/**
 * Every page a visitor can land on from a search result builds its title,
 * description, canonical, hreflang and share preview through `pageMetadata`,
 * or says it is not to be indexed. Without this, a new page ships with the
 * layout's home-page title and no canonical, and nothing else fails.
 */
describe("page metadata coverage", () => {
  const ROOT = path.join(process.cwd(), "src/app/[locale]");
  /* Signed-in or per-visitor areas — noindex by design, blocked in robots.ts. */
  const PRIVATE = /^(admin|account|checkout|login|forbidden|subscribe|search|cart)(\/|$)/;

  async function pages(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? pages(path.join(dir, e.name)) : e.name === "page.tsx" ? [path.join(dir, e.name)] : [],
      ),
    );
    return nested.flat();
  }

  it("every public page uses pageMetadata", async () => {
    const all = await pages(ROOT);
    const public_ = all.filter((p) => !PRIVATE.test(path.relative(ROOT, p)));
    expect(public_.length).toBeGreaterThan(15);
    const missing = [];
    for (const file of public_) {
      if (!(await readFile(file, "utf8")).includes("pageMetadata(")) missing.push(path.relative(ROOT, file));
    }
    expect(missing).toEqual([]);
  });

  it("every private page is noindex", async () => {
    const all = await pages(ROOT);
    const missing = [];
    for (const file of all.filter((p) => PRIVATE.test(path.relative(ROOT, p)))) {
      const src = await readFile(file, "utf8");
      if (/generateMetadata|export const metadata/.test(src) && !src.includes("index: false")) {
        missing.push(path.relative(ROOT, file));
      }
    }
    expect(missing).toEqual([]);
  });
});
