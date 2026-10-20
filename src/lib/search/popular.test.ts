import { describe, expect, it } from "vitest";
import { ordersPerProduct } from "@/lib/orders/popularity";
import type { SearchEntry } from "./entry";
import { pickExamples, pickPopular, pickTopSeeds } from "./popular";

/**
 * What the empty search box shows — SPEC §27.2. The ranking is the one place
 * sales reach search, so these pin that an order counts once, a seed's sales
 * are never a microgreen's, and an empty shop still shows its whole range.
 */

const entry = (kind: SearchEntry["kind"], key: string, name = key): SearchEntry => ({
  kind,
  key,
  href: `/${key}`,
  name,
  image: null,
  terms: { names: [name], kind: [], blurbs: [] },
});

const shelf = [
  entry("variety", "radish"),
  entry("variety", "sunflower"),
  entry("variety", "pea"),
  entry("plan", "essential", "Everyday Essentials"),
  entry("seed", "radish"),
  entry("seed", "basil"),
  entry("tray", "tray-pair"),
  entry("media", "horti-coir", "Horti-Coir cocopeat — 5 kg block"),
  entry("rack", "shelf"),
];

describe("ordersPerProduct", () => {
  it("counts each order once per product, keyed by kind and key", () => {
    const orders = [
      {
        lines: [
          { kind: "seed", key: "radish" },
          { kind: "variety", key: "radish" },
        ],
      },
      {
        lines: [
          { kind: "seed", key: "radish" },
          { kind: "seed", key: "radish" },
        ],
      },
    ];
    expect(ordersPerProduct(orders)).toEqual({ "seed:radish": 2, "variety:radish": 1 });
  });
});

describe("pickPopular", () => {
  it("shows one of each kind at a time when nothing has sold, and says so", () => {
    expect(pickPopular(shelf, {})).toEqual({
      ids: [
        "variety-radish",
        "tray-tray-pair",
        "media-horti-coir",
        "rack-shelf",
        "variety-sunflower",
        "variety-pea",
      ],
      ranked: false,
    });
  });

  it("puts the most-ordered first and keeps the rest in range order", () => {
    const { ids, ranked } = pickPopular(shelf, { "tray:tray-pair": 4, "variety:pea": 1 });
    expect(ranked).toBe(true);
    expect(ids.slice(0, 3)).toEqual(["tray-tray-pair", "variety-pea", "variety-radish"]);
  });

  it("leaves seeds out — they have their own row, and would show twice", () => {
    const { ids, ranked } = pickPopular(shelf, { "seed:radish": 9 });
    expect(ids.some((id) => id.startsWith("seed-"))).toBe(false);
    expect(ranked).toBe(false);
  });

  it("counts a rack's orders against its range", () => {
    expect(pickPopular(shelf, { "rack:rk-6f-5s-1.25x3-1.4-orange": 3 }).ids[0]).toBe("rack-shelf");
  });

  it("leaves plans out — a subscription is not an order line", () => {
    expect(pickPopular(shelf, {}, 50).ids).not.toContain("plan-essential");
  });

  it("ignores a sale of something no longer on sale", () => {
    expect(pickPopular(shelf, { "tray:old-tray": 99 }).ids).not.toContain("tray-old-tray");
  });
});

describe("pickTopSeeds", () => {
  it("lists the seeds by name while nothing has sold, as the /seeds grid does", () => {
    expect(pickTopSeeds(shelf, {}, "en")).toEqual({ ids: ["seed-basil", "seed-radish"], ranked: false });
  });

  it("puts the most grams sold first, as the home page's seed strip does", () => {
    expect(pickTopSeeds(shelf, { radish: 500 }, "en")).toEqual({
      ids: ["seed-radish", "seed-basil"],
      ranked: true,
    });
  });

  it("holds seeds only", () => {
    expect(pickTopSeeds(shelf, {}, "en", 50).ids.every((id) => id.startsWith("seed-"))).toBe(true);
  });
});

describe("pickExamples", () => {
  it("offers short names one kind at a time, never one too long for a phone", () => {
    const names = pickExamples(shelf);
    expect(names.slice(0, 3)).toEqual(["radish", "Everyday Essentials", "radish"]);
    expect(names).not.toContain("Horti-Coir cocopeat — 5 kg block");
  });
});
