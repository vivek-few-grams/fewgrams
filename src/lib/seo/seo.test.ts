import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localeAlternates } from "@/i18n/alternates";
import robots from "@/app/robots";
import { clipDescription } from "./metadata";
import { productLd } from "./structured-data";

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
