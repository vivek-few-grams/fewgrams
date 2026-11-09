import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseBill, PurchaseLine } from "./bill";

/* A shelf in memory behind the three repositories, each taking stock the way
   its own does: trays and cocopeat by an atomic ADD that can go below zero
   (stock is a speed, not a limit), seed stopping at zero and saying how much
   it took. */
const shelf = new Map<string, number>();
const add = (kind: string) => async (key: string, n: number) => {
  shelf.set(`${kind}:${key}`, (shelf.get(`${kind}:${key}`) ?? 0) + n);
};
const takeBelowZero = (kind: string) => async (key: string, n: number) => {
  shelf.set(`${kind}:${key}`, (shelf.get(`${kind}:${key}`) ?? 0) - n);
  return n;
};
const takeToZero = async (key: string, n: number) => {
  const held = shelf.get(`seed:${key}`) ?? 0;
  const taken = Math.min(held, n);
  shelf.set(`seed:${key}`, held - taken);
  return taken;
};

vi.mock("@/lib/repo/trays", () => ({ returnToStock: add("tray"), takeFromStock: takeBelowZero("tray") }));
vi.mock("@/lib/repo/grow-media", () => ({
  returnToStock: add("media"),
  takeFromStock: takeBelowZero("media"),
}));
vi.mock("@/lib/repo/seeds", () => ({ returnToShelf: add("seed"), takeFromShelf: takeToZero }));

const { applyStockChange } = await import("./stock");
const { documentStockChange } = await import("./bill");
const { encodeShortfall } = await import("./shortfall");

const line = (kind: "tray" | "seed", key: string, quantity: number): PurchaseLine => ({
  category: "stock",
  item: { kind, key },
  description: key,
  quantity,
  taxable: 10000,
  rate: 0,
  igst: 0,
  cgst: 0,
  sgst: 0,
  credit: "none",
});

const note = (lines: PurchaseLine[]): PurchaseBill => ({
  id: "n1",
  doc: "creditNote",
  vendor: { id: "v1", name: "Seed Co", kind: "registered", gstin: null, state: null },
  number: "CN-3",
  date: "2026-11-05",
  reverseCharge: false,
  lines,
  paidOn: null,
  claim: null,
  match: null,
  file: null,
  notes: "",
  createdAt: "2026-11-05T00:00:00Z",
  updatedAt: "2026-11-05T00:00:00Z",
});

beforeEach(() => shelf.clear());

describe("a credit note on the shelf", () => {
  it("takes trays below zero as an order would, and stops seed at zero with the shortfall", async () => {
    shelf.set("tray:tray-pair", 1);
    shelf.set("seed:radish", 300);
    const sent = note([line("tray", "tray-pair", 3), line("seed", "radish", 500)]);
    const r = await applyStockChange(documentStockChange(null, sent));
    expect(Object.fromEntries(shelf)).toEqual({ "tray:tray-pair": -2, "seed:radish": 0 });
    expect(r.short).toEqual([{ kind: "seed", key: "radish", short: 200 }]);
    /* The notice the editor carries to the register. */
    expect(encodeShortfall(r.short)).toBe("seed:radish:200");
  });

  it("moves only the difference when edited, and puts back what it took when deleted", async () => {
    shelf.set("tray:tray-pair", 10);
    const two = note([line("tray", "tray-pair", 2)]);
    await applyStockChange(documentStockChange(null, two));
    expect(shelf.get("tray:tray-pair")).toBe(8);
    const three = note([line("tray", "tray-pair", 3)]);
    await applyStockChange(documentStockChange(two, three));
    expect(shelf.get("tray:tray-pair")).toBe(7);
    const r = await applyStockChange(documentStockChange(three, null));
    expect(shelf.get("tray:tray-pair")).toBe(10);
    expect(r.short).toEqual([]);
  });
});
