import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseBill } from "./bill";
import type { ItemCost } from "./cost";

/* What the index answers — set per test to the state *before* the write the
   caller has just made, which is what GSI1 can still return on AWS. */
let listed: PurchaseBill[] = [];
const trayCosts = new Map<string, ItemCost | null>();

vi.mock("@/lib/repo/purchases", () => ({ listBills: async () => listed }));
vi.mock("@/lib/repo/seeds", () => ({
  getSeedMargin: async () => ({ markupPercent: 0, roundUpToNearest: 1 }),
  setSeedCost: async () => null,
}));
vi.mock("@/lib/repo/trays", () => ({
  setTrayCost: async (key: string, cost: ItemCost | null) => {
    trayCosts.set(key, cost);
  },
}));
vi.mock("@/lib/repo/grow-media", () => ({ setGrowMediumCost: async () => {} }));
vi.mock("@/lib/varieties/reprice", () => ({ repriceVarieties: async () => {} }));

const { billsForCost, costFromBills } = await import("./reprice");

/** A bill of ten tray packs at `taxable` paise, no tax. */
const bill = (id: string, date: string, taxable: number): PurchaseBill => ({
  id,
  vendor: { id: "v", name: "Tray Co", kind: "registered", gstin: null, state: null },
  number: id,
  date,
  reverseCharge: false,
  lines: [
    {
      category: "stock",
      item: { kind: "tray", key: "tray-pair" },
      description: "Tray pair",
      quantity: 10,
      taxable,
      rate: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      credit: "none",
    },
  ],
  paidOn: null,
  claim: null,
  match: null,
  file: null,
  notes: "",
  createdAt: `${date}T00:00:00Z`,
  updatedAt: `${date}T00:00:00Z`,
});

beforeEach(() => {
  listed = [];
  trayCosts.clear();
});

describe("billsForCost", () => {
  it("replaces a listed bill with the one just written, adds a new one, and drops a deleted one", () => {
    const a = bill("a", "2026-10-01", 1000);
    const b = bill("b", "2026-10-02", 2000);
    const edited = { ...a, lines: [{ ...a.lines[0], taxable: 5000 }] };
    expect(billsForCost([a, b], { written: edited })).toEqual([edited, b]);
    const fresh = bill("c", "2026-10-03", 3000);
    expect(billsForCost([a, b], { written: fresh })).toEqual([a, b, fresh]);
    expect(billsForCost([a, b], { deletedId: "a" })).toEqual([b]);
    expect(billsForCost([a, b])).toEqual([a, b]);
  });
});

describe("costFromBills", () => {
  it("costs from a new bill the index does not show yet", async () => {
    listed = [bill("old", "2026-10-01", 100000)];
    await costFromBills(["tray:tray-pair"], { written: bill("new", "2026-10-20", 150000) });
    expect(trayCosts.get("tray-pair")?.cost).toBe(150); // ₹1,500 for 10 packs
    expect(trayCosts.get("tray-pair")?.source.billId).toBe("new");
  });

  it("costs from an edited bill as saved, not as the index still lists it", async () => {
    const before = bill("one", "2026-10-20", 100000);
    listed = [before];
    await costFromBills(["tray:tray-pair"], {
      written: { ...before, lines: [{ ...before.lines[0], taxable: 120000 }] },
    });
    expect(trayCosts.get("tray-pair")?.cost).toBe(120);
  });

  it("falls back to the bill before one just deleted, even while the index lists it", async () => {
    listed = [bill("old", "2026-10-01", 100000), bill("gone", "2026-10-20", 150000)];
    await costFromBills(["tray:tray-pair"], { deletedId: "gone" });
    expect(trayCosts.get("tray-pair")?.source.billId).toBe("old");
    expect(trayCosts.get("tray-pair")?.cost).toBe(100);
  });

  it("clears the cost when the deleted bill was the only one", async () => {
    listed = [bill("gone", "2026-10-20", 150000)];
    await costFromBills(["tray:tray-pair"], { deletedId: "gone" });
    expect(trayCosts.get("tray-pair")).toBeNull();
  });
});
