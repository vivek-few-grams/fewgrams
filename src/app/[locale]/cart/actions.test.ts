import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/lib/cart/cart";

/* The cookie, and which lines are on sale, stood in for. */
const h = vi.hoisted(() => ({
  cookie: [] as CartLine[],
  offSale: new Set<string>(),
  written: [] as CartLine[][],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cart/server", () => ({
  readCartLines: async () => h.cookie,
  sellableLines: async (lines: CartLine[]) => lines.filter((l) => !h.offSale.has(`${l.kind}:${l.key}`)),
  writeCartLines: async (lines: CartLine[]) => {
    h.written.push(lines);
  },
}));
vi.mock("@/lib/repo/seeds", () => ({
  listSeeds: async () => [
    { id: "s-alfalfa", contentKey: "alfalfa", pricePer100g: 150, stockGrams: 500, active: true },
  ],
}));
vi.mock("@/lib/repo/varieties", () => ({ listVarieties: async () => [] }));
vi.mock("@/lib/repo/trays", () => ({ listTrays: async () => [] }));
vi.mock("@/lib/repo/grow-media", () => ({ listGrowMedia: async () => [] }));
vi.mock("@/lib/racks/catalogue", () => ({ findSellableRack: async () => null }));
vi.mock("@/lib/packs/catalogue", () => ({ resolvePackLine: async () => null }));

const { dropUnavailable, removeCartLine, setCartQuantity } = await import("./actions");

/** The owner's cart on 7 Nov 2026 — see `src/lib/cart/server.test.ts`. */
const ownersCart: CartLine[] = [
  { kind: "variety", key: "alfalfa", units: 1 },
  { kind: "seed", key: "alfalfa", units: 1 },
  { kind: "variety", key: "beetroot", units: 1 },
];
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  h.cookie = ownersCart;
  h.offSale = new Set(["variety:alfalfa", "variety:beetroot"]);
  h.written = [];
});

describe("off-sale lines leave the cookie", () => {
  it("when the cart or checkout page opens (`dropUnavailable`)", async () => {
    await dropUnavailable();
    expect(h.written).toEqual([[{ kind: "seed", key: "alfalfa", units: 1 }]]);
  });

  it("and nothing is written when nothing is off sale", async () => {
    h.offSale = new Set();
    await dropUnavailable();
    expect(h.written).toEqual([]);
  });

  it("on any save — an add or a quantity change carries none of them", async () => {
    const state = await setCartQuantity(
      { status: "idle" },
      form({ kind: "seed", key: "alfalfa", units: "2" }),
    );
    expect(state).toEqual({ status: "saved" });
    expect(h.written).toEqual([[{ kind: "seed", key: "alfalfa", units: 2 }]]);
  });

  it("on a remove", async () => {
    await removeCartLine(form({ kind: "seed", key: "alfalfa" }));
    expect(h.written).toEqual([[]]);
  });
});
