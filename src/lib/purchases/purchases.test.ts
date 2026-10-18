import { describe, expect, it } from "vitest";
import { HOME_STATE } from "@/lib/tax/states";
import { freightCredit, owesPayBy } from "./bill";
import { billCosts, billsPerItem, latestCosts } from "./cost";
import { readBill } from "./read";
import { isSupplyKey, supplierChanges, suppliersOf } from "./supplies";
import { readVendor, type Vendor } from "./vendor";

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

const vendor = (over: Partial<Vendor> = {}): Vendor => ({
  id: "v1",
  name: "Tray Co",
  kind: "registered",
  gstin: "29HTUPS6000Q1ZI",
  state: HOME_STATE,
  address: "",
  phone: "",
  email: "",
  filing: "monthly",
  supplies: ["tray:tray-pair"],
  notes: "",
  active: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const ctx = (v: Vendor = vendor()) => ({
  vendors: new Map([[v.id, v]]),
  stockItems: new Set(["tray:tray-pair", "seed:radish"]),
  today: "2026-10-30",
});

const line = (over: Record<string, string> = {}) => ({
  category: "stock",
  item: "tray:tray-pair",
  description: "",
  quantity: "10",
  taxable: "1000",
  rate: "18",
  igst: "",
  cgst: "",
  sgst: "",
  credit: "full",
  ...over,
});

const bill = (lines: Record<string, string>[], extra: Record<string, string> = {}) =>
  form({
    vendorId: "v1",
    number: "INV/26-27/0012",
    date: "2026-10-20",
    ...extra,
    ...Object.fromEntries(Object.keys(line()).map((k) => [k, lines.map((l) => l[k])])),
  });

describe("readVendor", () => {
  it("reads the state off a registered vendor's GSTIN", () => {
    const r = readVendor(
      form({
        name: "Tray Co",
        kind: "registered",
        gstin: "29htups6000q1zi",
        filing: "quarterly",
        isNew: "1",
      }),
    );
    expect(r.ok && r.value).toMatchObject({
      gstin: "29HTUPS6000Q1ZI",
      state: HOME_STATE,
      filing: "quarterly",
      active: true,
    });
  });

  it("refuses a GSTIN that fails its check digit", () => {
    const r = readVendor(form({ name: "X", kind: "registered", gstin: "29HTUPS6000Q1ZJ" }));
    expect(r.ok).toBe(false);
  });

  it("keeps no GSTIN or state for a foreign vendor", () => {
    const r = readVendor(form({ name: "Cloudflare", kind: "foreign", gstin: "29HTUPS6000Q1ZI" }));
    expect(r.ok && r.value).toMatchObject({ gstin: null, state: null, filing: "unknown" });
  });
});

describe("readBill", () => {
  it("works the tax out as CGST + SGST from a Karnataka vendor", () => {
    const r = readBill(bill([line()]), ctx());
    expect(r.ok && r.value.lines[0]).toMatchObject({
      taxable: 100000,
      cgst: 9000,
      sgst: 9000,
      igst: 0,
      item: { kind: "tray", key: "tray-pair" },
      quantity: 10,
      description: "tray-pair",
    });
  });

  it("works it out as IGST from another state's vendor", () => {
    const r = readBill(
      bill([line()]),
      ctx(vendor({ state: { code: "27", name: "Maharashtra" }, gstin: "27AAPFU0939F1ZV" })),
    );
    expect(r.ok && r.value.lines[0]).toMatchObject({ igst: 18000, cgst: 0 });
  });

  it("keeps the bill's own figure within a rupee, and refuses a slipped digit", () => {
    const ok = readBill(bill([line({ cgst: "90.40", sgst: "90.40" })]), ctx());
    expect(ok.ok && ok.value.lines[0].cgst).toBe(9040);
    const slip = readBill(bill([line({ cgst: "900" })]), ctx());
    expect(slip.ok).toBe(false);
    if (!slip.ok) expect(slip.state).toMatchObject({ code: "taxOff", field: "cgst.0" });
  });

  it("charges an unregistered vendor's bill no GST", () => {
    const r = readBill(
      bill([line({ category: "packaging", item: "", description: "Boxes", quantity: "" })]),
      ctx(vendor({ kind: "unregistered", gstin: null, state: null })),
    );
    expect(r.ok && r.value.lines[0]).toMatchObject({ rate: 0, cgst: 0, sgst: 0, igst: 0 });
  });

  it("puts a foreign vendor's bill on reverse charge, as IGST", () => {
    const r = readBill(
      bill([line({ category: "software", item: "", description: "Hosting", quantity: "" })]),
      ctx(vendor({ kind: "foreign", gstin: null, state: null })),
    );
    expect(r.ok && r.value.reverseCharge).toBe(true);
    expect(r.ok && r.value.lines[0]).toMatchObject({ igst: 18000, cgst: 0 });
  });

  it("refuses stock with no item or a part quantity, and points at the row", () => {
    const noItem = readBill(bill([line(), line({ item: "" })]), ctx());
    expect(!noItem.ok && noItem.state).toMatchObject({ code: "itemRequired", field: "item.1" });
    const part = readBill(bill([line({ quantity: "2.5" })]), ctx());
    expect(!part.ok && part.state).toMatchObject({ code: "quantityInvalid", field: "quantity.0" });
  });

  it("takes only what the vendor supplies, except an item already on the bill", () => {
    const other = readBill(bill([line({ item: "seed:radish", quantity: "250" })]), ctx());
    expect(!other.ok && other.state).toMatchObject({
      code: "itemNotSupplied",
      field: "item.0",
      values: { row: "1", vendor: "Tray Co" },
    });
    const kept = readBill(bill([line({ item: "seed:radish", quantity: "250" })]), {
      ...ctx(),
      onBill: new Set(["seed:radish"]),
    });
    expect(kept.ok && kept.value.lines[0].item).toEqual({ kind: "seed", key: "radish" });
  });

  it("skips blank rows and refuses a bill with none left", () => {
    const blank = { ...line(), item: "", description: "", taxable: "", quantity: "" };
    expect(readBill(bill([blank]), ctx())).toMatchObject({ ok: false, state: { code: "linesRequired" } });
    const r = readBill(bill([line(), blank]), ctx());
    expect(r.ok && r.value.lines).toHaveLength(1);
  });

  it("refuses a future bill, and takes a payment made before the bill", () => {
    expect(readBill(bill([line()], { date: "2026-11-01" }), ctx())).toMatchObject({
      ok: false,
      state: { code: "dateFuture" },
    });
    expect(readBill(bill([line()], { paidOn: "2026-10-01" }), ctx())).toMatchObject({
      ok: true,
      value: { paidOn: "2026-10-01" },
    });
  });
});

describe("billsPerItem", () => {
  it("counts each bill once per item it names, and only stock lines", () => {
    const stock = (kind: "seed" | "tray", key: string) => ({
      category: "stock" as const,
      item: { kind, key },
    });
    const counts = billsPerItem([
      {
        lines: [
          stock("seed", "radish"),
          stock("seed", "radish"),
          { category: "freight" as const, item: null },
        ],
      },
      { lines: [stock("seed", "radish"), stock("tray", "radish")] },
    ]);
    expect(Object.fromEntries(counts)).toEqual({ "seed:radish": 2, "tray:radish": 1 });
  });
});

describe("the 180-day rule", () => {
  const taxed = {
    category: "stock" as const,
    item: null,
    description: "x",
    quantity: null,
    taxable: 100000,
    rate: 18,
    igst: 18000,
    cgst: 0,
    sgst: 0,
    credit: "full" as const,
  };
  const b = (over: Partial<Parameters<typeof owesPayBy>[0]> = {}) =>
    ({
      vendor: { kind: "registered" as const },
      reverseCharge: false,
      lines: [taxed],
      date: "2026-10-20",
      ...over,
    }) as Parameters<typeof owesPayBy>[0];

  it("applies to credit on a bill we pay the vendor, not to reverse charge or no GST", () => {
    expect(owesPayBy(b())).toBe(true);
    expect(owesPayBy(b({ reverseCharge: true }))).toBe(false);
    expect(owesPayBy(b({ lines: [{ ...taxed, rate: 0, igst: 0 }] }))).toBe(false);
  });
});

describe("supplies", () => {
  it("knows each seed, tray and medium by content key, and the four rack supplies", () => {
    expect(
      ["seed:radish", "tray:drain-cell-mat", "media:horti-coir", "rack:pipe-connectors"].every(isSupplyKey),
    ).toBe(true);
    expect(["seed", "seed:Radish", "rack:pipe", "variety:radish", "tray:"].some(isSupplyKey)).toBe(false);
  });

  it("writes only the vendors whose list changes", () => {
    const a = vendor({ id: "a", supplies: ["rack:pipe-pipes"] });
    const b = vendor({ id: "b", supplies: [] });
    const c = vendor({ id: "c", supplies: ["rack:pipe-connectors"] });
    /* Pipes move from a to b; c is untouched. */
    const changed = supplierChanges([a, b, c], "rack:pipe-pipes", ["b"]);
    expect(changed.map((v) => [v.id, v.supplies])).toEqual([
      ["a", []],
      ["b", ["rack:pipe-pipes"]],
    ]);
    expect(suppliersOf([a, b, c], "rack:pipe-connectors")).toEqual(["c"]);
  });

  it("lets one product have several vendors", () => {
    const none = { supplies: [] };
    const changed = supplierChanges(
      [vendor({ id: "a", ...none }), vendor({ id: "b", ...none })],
      "seed:basil",
      ["a", "b"],
    );
    expect(changed.map((v) => v.supplies)).toEqual([["seed:basil"], ["seed:basil"]]);
  });
});

describe("costs from bills", () => {
  const stockLine = (
    kind: "seed" | "tray" | "media",
    key: string,
    quantity: number,
    taxable: number,
    tax = 0,
  ) =>
    ({
      category: "stock",
      item: { kind, key },
      description: key,
      quantity,
      taxable,
      rate: tax ? 18 : 0,
      igst: tax,
      cgst: 0,
      sgst: 0,
      credit: "full",
    }) as const;
  const freight = (taxable: number, igst: number) =>
    ({
      category: "freight",
      item: null,
      description: "Shipping",
      quantity: null,
      taxable,
      rate: 18,
      igst,
      cgst: 0,
      sgst: 0,
      credit: "none",
    }) as const;

  it("costs seed per 100 g and a tray per pack, tax included", () => {
    const c = billCosts([
      stockLine("seed", "radish", 250, 12500),
      stockLine("tray", "tray-pair", 10, 100000, 18000),
    ]);
    expect(c.get("seed:radish")).toBe(5000); // ₹125 for 250 g → ₹50 per 100 g
    expect(c.get("tray:tray-pair")).toBe(11800); // ₹1,180 for 10 packs
  });

  it("shares shipping across the stock lines by value", () => {
    /* ₹600 + ₹400 of seed, ₹100 of shipping with ₹18 tax: 11.8% on each. */
    const c = billCosts([
      stockLine("seed", "mustard", 1000, 60000),
      stockLine("seed", "radish", 500, 40000),
      freight(10000, 1800),
    ]);
    expect(c.get("seed:mustard")).toBe(Math.round((60000 + 11800 * 0.6) / 10));
    expect(c.get("seed:radish")).toBe(Math.round(((40000 + 11800 * 0.4) * 100) / 500));
  });

  it("adds two lines for one item together", () => {
    const c = billCosts([stockLine("seed", "radish", 250, 12500), stockLine("seed", "radish", 250, 17500)]);
    expect(c.get("seed:radish")).toBe(6000);
  });

  it("takes each item's cost from its latest bill", () => {
    const b = (id: string, date: string, createdAt: string, taxable: number) => ({
      id,
      number: id,
      date,
      createdAt,
      vendor: { id: "v", name: "Seed Co", kind: "registered" as const, gstin: null, state: null },
      lines: [stockLine("seed", "radish", 100, taxable)],
    });
    const costs = latestCosts([
      b("late", "2026-10-20", "2026-10-21T00:00:00Z", 7000),
      b("early", "2026-10-01", "2026-10-25T00:00:00Z", 5000),
      b("same-day-first", "2026-10-20", "2026-10-20T00:00:00Z", 9000),
    ]);
    expect(costs.get("seed:radish")).toEqual({
      cost: 70,
      source: { billId: "late", number: "late", date: "2026-10-20", vendor: "Seed Co" },
    });
  });

  it("gives shipping the credit of the goods it brought", () => {
    const l = (rate: number, credit: "full" | "none" | "shared", category = "stock" as const) => ({
      category,
      rate,
      credit,
    });
    expect(freightCredit([l(0, "full"), l(0, "full")])).toBe("none");
    expect(freightCredit([l(18, "full"), l(5, "full")])).toBe("full");
    expect(freightCredit([l(0, "full"), l(18, "full")])).toBe("shared");
    expect(freightCredit([])).toBe("shared");
  });
});
