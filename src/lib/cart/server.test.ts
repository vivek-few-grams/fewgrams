import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Seed, Variety } from "@/lib/types";
import { serialiseCart, type CartLine } from "./cart";

/* The cookie and the catalogue, stood in for. The content files are the real
   ones, so a name here is the name a customer reads. */
const h = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  varieties: [] as unknown[],
  seeds: [] as unknown[],
  failCatalogue: false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (h.cookie ? { value: h.cookie } : undefined) }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
const listVarieties = vi.fn(async () => {
  if (h.failCatalogue) throw new Error("DynamoDB is down");
  return h.varieties;
});
vi.mock("@/lib/repo/varieties", () => ({ listVarieties }));
vi.mock("@/lib/repo/seeds", () => ({ listSeeds: async () => h.seeds }));
vi.mock("@/lib/repo/trays", () => ({ listTrays: async () => [] }));
vi.mock("@/lib/repo/grow-media", () => ({ listGrowMedia: async () => [] }));
vi.mock("@/lib/racks/catalogue", () => ({ findSellableRack: async () => null }));
vi.mock("@/lib/packs/catalogue", () => ({ resolvePackLine: async () => null }));

const { hydrateLines, readCartCount, sellableLines } = await import("./server");

const radish: Variety = {
  id: "v-radish",
  contentKey: "radish",
  pricePer100g: 130,
  yieldGramsPerTrayMin: 300,
  yieldGramsPerTrayMax: 400,
  growDays: 7,
  active: true,
};
const alfalfaSeed: Seed = {
  id: "s-alfalfa",
  contentKey: "alfalfa",
  pricePer100g: 150,
  stockGrams: 200,
  active: true,
};

/** The owner's cart on 7 Nov 2026: the alfalfa seed on sale, and alfalfa and
 *  beetroot microgreens the sowing log had just priced off sale. */
const ownersCart: CartLine[] = [
  { kind: "variety", key: "alfalfa", units: 1 },
  { kind: "seed", key: "alfalfa", units: 1 },
  { kind: "variety", key: "beetroot", units: 1 },
];

beforeEach(() => {
  /* On sale: radish (green) and alfalfa (seed). `listVarieties({ activeOnly })`
     answers only what is on sale, so off-sale alfalfa and beetroot are absent. */
  h.varieties = [radish];
  h.seeds = [alfalfaSeed];
  h.cookie = undefined;
  h.failCatalogue = false;
  listVarieties.mockClear();
});

describe("a cart holding lines that went off sale", () => {
  it("lists only what is on sale, and names the rest by product and kind", async () => {
    const cart = await hydrateLines(ownersCart, "en");
    expect(cart.items.map((i) => `${i.kind}:${i.key}`)).toEqual(["seed:alfalfa"]);
    expect(cart.unavailable).toEqual([
      { kind: "variety", key: "alfalfa", name: "Alfalfa" },
      { kind: "variety", key: "beetroot", name: "Beetroot" },
    ]);
    /* Totals count only what can be bought. */
    expect(cart.subtotal).toBe(150);
  });

  it("puts on the badge exactly the number of lines the cart page lists", async () => {
    h.cookie = serialiseCart(ownersCart);
    const cart = await hydrateLines(ownersCart, "en");
    /* The badge said 3 over a page listing 1, until 7 Nov 2026. */
    expect(await readCartCount("en")).toBe(cart.items.length);
    expect(await readCartCount("en")).toBe(1);
  });

  it("keeps only the lines on sale, in their order", async () => {
    expect(await sellableLines(ownersCart)).toEqual([{ kind: "seed", key: "alfalfa", units: 1 }]);
    const fine: CartLine[] = [
      { kind: "seed", key: "alfalfa", units: 2 },
      { kind: "variety", key: "radish", units: 1 },
    ];
    expect(await sellableLines(fine)).toBe(fine);
  });

  it("names a line whose content file is gone by its kind, not its key", async () => {
    const cart = await hydrateLines([{ kind: "variety", key: "no-such-green", units: 1 }], "en");
    expect(cart.unavailable).toEqual([{ kind: "variety", key: "no-such-green", name: null }]);
  });
});

describe("the header badge", () => {
  it("reads no catalogue for an empty cart", async () => {
    expect(await readCartCount("en")).toBe(0);
    expect(listVarieties).not.toHaveBeenCalled();
  });

  it("falls back to the cookie's count when the catalogue cannot be read", async () => {
    h.cookie = serialiseCart(ownersCart);
    h.failCatalogue = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readCartCount("en")).toBe(3);
  });
});
