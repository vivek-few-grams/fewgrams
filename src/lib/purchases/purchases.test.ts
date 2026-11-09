import { describe, expect, it } from "vitest";
import { OUR_GSTIN } from "@/lib/tax/gstin";
import { HOME_STATE } from "@/lib/tax/states";
import {
  IS_GOODS,
  PURCHASE_CATEGORIES,
  freightCredit,
  owesPayBy,
  stockLineDefaults,
  type CreditUse,
  type PurchaseLine,
} from "./bill";
import { billCosts, billsPerItem, latestCosts } from "./cost";
import { appliesTo, describeOnPick, itemsKeptOnEdit, readBill } from "./read";
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
  gstin: "29AABCT1332L1ZA",
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

describe("stockLineDefaults", () => {
  it("starts a line at the rate the item is sold at, with no credit when exempt", () => {
    /* A test bill for 1 kg of radish seed defaulted to 18% and Full credit,
       and folded ₹72 of GST nobody charged into the seed's cost. */
    expect(stockLineDefaults({ kind: "seed", key: "radish" })).toEqual({ rate: 0, credit: "none" });
    expect(stockLineDefaults({ kind: "seed", key: "mustard" })).toEqual({ rate: 0, credit: "none" });
    expect(stockLineDefaults({ kind: "tray", key: "tray-pair" })).toEqual({ rate: 18, credit: "full" });
    expect(stockLineDefaults({ kind: "media", key: "horti-coir" })).toEqual({ rate: 5, credit: "full" });
  });
});

describe("readVendor", () => {
  it("reads the state off a registered vendor's GSTIN", () => {
    const r = readVendor(
      form({
        name: "Tray Co",
        kind: "registered",
        gstin: "29aabct1332l1za",
        filing: "quarterly",
        isNew: "1",
      }),
    );
    expect(r.ok && r.value).toMatchObject({
      gstin: "29AABCT1332L1ZA",
      state: HOME_STATE,
      filing: "quarterly",
      active: true,
    });
  });

  it("refuses a GSTIN that fails its check digit", () => {
    const r = readVendor(form({ name: "X", kind: "registered", gstin: "29HTUPS6000Q1ZJ" }));
    expect(r.ok).toBe(false);
  });

  it("refuses our own GSTIN, which passes its check digit", () => {
    const r = readVendor(form({ name: "Us", kind: "registered", gstin: OUR_GSTIN.toLowerCase() }));
    expect(!r.ok && r.state).toMatchObject({ code: "gstinOurs", field: "gstin" });
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

  it("takes no figure in a head that does not apply, however small", () => {
    const inter = ctx(vendor({ state: { code: "27", name: "Maharashtra" }, gstin: "27AAPFU0939F1ZV" }));
    /* IGST on a Karnataka line: within a rupee of the worked 0, and refused. */
    const igst = readBill(bill([line({ igst: "0.50" })]), ctx());
    expect(!igst.ok && igst.state).toMatchObject({ code: "taxWrongHead", field: "igst.0" });
    /* CGST on another state's line. */
    const cgst = readBill(bill([line({ cgst: "0.90" })]), inter);
    expect(!cgst.ok && cgst.state).toMatchObject({ code: "taxWrongHead", field: "cgst.0" });
    /* Any head on an exempt seed line — that made a seed bill "claimable". */
    const seed = readBill(
      bill([line({ item: "seed:radish", quantity: "250", rate: "0", sgst: "0.75" })]),
      ctx(vendor({ supplies: ["seed:radish"] })),
    );
    expect(!seed.ok && seed.state).toMatchObject({ code: "taxWrongHead", field: "sgst.0" });
    /* Blank or an exact 0 is fine; the heads that apply still take theirs. */
    const zero = readBill(bill([line({ igst: "0", cgst: "90.40" })]), ctx());
    expect(zero.ok && zero.value.lines[0]).toMatchObject({ igst: 0, cgst: 9040, sgst: 9000 });
  });

  it("keeps a typed head on a line so small that the worked figure rounds to 0", () => {
    /* ₹0.02 at 5%, Karnataka: CGST and SGST each work out to 0 paise, but
       they apply, so the bill's own paisa is kept. */
    const r = readBill(bill([line({ taxable: "0.02", rate: "5", cgst: "0.01" })]), ctx());
    expect(r.ok && r.value.lines[0]).toMatchObject({ cgst: 1, sgst: 0 });
  });

  it("says which heads apply by rate and state", () => {
    expect(appliesTo(18, true)).toEqual({ igst: false, cgst: true, sgst: true });
    expect(appliesTo(18, false)).toEqual({ igst: true, cgst: false, sgst: false });
    expect(appliesTo(0, true)).toEqual({ igst: false, cgst: false, sgst: false });
    expect(appliesTo(0, false)).toEqual({ igst: false, cgst: false, sgst: false });
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

  it("exempts items already on a bill only while it is still that vendor's", () => {
    const stockLine: Pick<PurchaseLine, "category" | "item"> = {
      category: "stock",
      item: { kind: "seed", key: "radish" },
    };
    const current = {
      vendor: { id: "v1", name: "Seed Co", kind: "registered" as const, gstin: null, state: null },
      lines: [{ ...stockLine } as PurchaseLine],
    };
    expect([...itemsKeptOnEdit(current, "v1")]).toEqual(["seed:radish"]);
    /* Switched to a vendor who does not sell radish: no exemption, so the
       line is refused as not supplied. */
    expect(itemsKeptOnEdit(current, "v2").size).toBe(0);
    expect(itemsKeptOnEdit(null, "v1").size).toBe(0);
    const switched = readBill(bill([line({ item: "seed:radish", quantity: "250" })]), {
      ...ctx(),
      onBill: itemsKeptOnEdit({ ...current, vendor: { ...current.vendor, id: "v0" } }, "v1"),
    });
    expect(!switched.ok && switched.state).toMatchObject({ code: "itemNotSupplied" });
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

describe("describeOnPick", () => {
  it("follows the item while the description is the one it filled in, and keeps typed text", () => {
    /* Radish picked after alfalfa saved as "Alfalfa" (8 Nov 2026). */
    expect(describeOnPick("Alfalfa", "Alfalfa", "Radish")).toBe("Radish");
    expect(describeOnPick("", undefined, "Radish")).toBe("Radish");
    expect(describeOnPick("", "Alfalfa", "Radish")).toBe("Radish");
    expect(describeOnPick("Radish seed, 1 kg pouch", "Alfalfa", "Radish")).toBe("Radish seed, 1 kg pouch");
    expect(describeOnPick("Alfalfa sprouting", undefined, "Radish")).toBe("Alfalfa sprouting");
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

  it("shares shipping across every goods line by value before GST, and costs only the stock share", () => {
    /* ₹1,000 of trays to sell and ₹9,000 of trays to grow in, both 18%, and
       ₹500 of shipping with ₹90 tax: the stock trays carry a tenth of it,
       ₹59 — not all ₹590, as they did while only stock lines shared. */
    const growing = {
      ...stockLine("tray", "tray-pair", 90, 900000, 162000),
      category: "growing" as const,
      item: null,
    };
    const c = billCosts([stockLine("tray", "tray-pair", 10, 100000, 18000), growing, freight(50000, 9000)]);
    expect(c.get("tray:tray-pair")).toBe(Math.round((118000 + 5900) / 10));
    expect(c.size).toBe(1);
  });

  it("shares shipping by value before GST, so a 0% seed and an 18% tray carry it alike", () => {
    /* ₹1,000 of seed (500 g, exempt) and ₹1,000 of trays (+₹180), ₹200 of
       shipping (+₹36): ₹118 each. By value with tax the trays took more. */
    const c = billCosts([
      stockLine("seed", "radish", 500, 100000),
      stockLine("tray", "tray-pair", 10, 100000, 18000),
      freight(20000, 3600),
    ]);
    expect(c.get("seed:radish")).toBe(Math.round(((100000 + 11800) * 100) / 500));
    expect(c.get("tray:tray-pair")).toBe(Math.round((118000 + 11800) / 10));
  });

  it("leaves services out of the shipping's share — they came without the parcel", () => {
    const software = {
      ...stockLine("tray", "tray-pair", 1, 500000, 90000),
      category: "software" as const,
      item: null,
    };
    const alone = billCosts([stockLine("tray", "tray-pair", 10, 100000), freight(10000, 0)]);
    const withService = billCosts([stockLine("tray", "tray-pair", 10, 100000), software, freight(10000, 0)]);
    expect(withService.get("tray:tray-pair")).toBe(alone.get("tray:tray-pair"));
    expect(alone.get("tray:tray-pair")).toBe(11000);
  });

  it("knows which categories are goods", () => {
    expect(PURCHASE_CATEGORIES.filter((c) => IS_GOODS[c])).toEqual([
      "stock",
      "rack",
      "growing",
      "packaging",
      "other",
    ]);
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

  it("gives shipping the credit of the goods only — the lines its cost is shared across", () => {
    const l = (category: "stock" | "growing" | "software" | "courier", rate: number, credit: CreditUse) => ({
      category,
      rate,
      credit,
    });
    /* Trays to sell beside a software subscription: the shipping came with
       the trays, so it is Full, not Shared. */
    expect(freightCredit([l("stock", 18, "full"), l("software", 18, "shared")])).toBe("full");
    expect(freightCredit([l("stock", 0, "full"), l("courier", 18, "shared")])).toBe("none");
    /* Trays to sell and trays to grow in: both goods, so mixed. */
    expect(freightCredit([l("stock", 18, "full"), l("growing", 18, "none")])).toBe("shared");
    /* Nothing that is goods: the fallback. */
    expect(freightCredit([l("software", 18, "shared")])).toBe("shared");
  });
});
