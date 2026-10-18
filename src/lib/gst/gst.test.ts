import { describe, expect, it } from "vitest";
import type { PurchaseBill, PurchaseLine } from "@/lib/purchases/bill";
import { billStatus, lineTax, payBy, stockChange } from "@/lib/purchases/bill";
import { orderTax, subscriptionTax } from "@/lib/tax/order-tax";
import { HOME_STATE, gstStateFor } from "@/lib/tax/states";
import { B2CL_ABOVE, buildGstr1 } from "./gstr1";
import { claimAfterMatch, claimFromMatch, invoiceKey, matchStatement, parseGstr2b } from "./gstr2b";
import { buildGstr3b, settle } from "./gstr3b";
import { ZERO, setOff, sumHeads } from "./ledger";
import {
  dueDates,
  monthFromReturnPeriod,
  monthIndex,
  monthsOf,
  quarterOf,
  quartersSince,
  returnPeriod,
} from "./period";
import { openingFor, quarterView, type GstBooks } from "./quarter";
import type { CreditDoc, SaleDoc } from "./sales";

const KERALA = gstStateFor("Kerala")!;

/** An order-shaped sale: greens, a tray pair and cocopeat, one courier parcel. */
function sale(
  over: Partial<SaleDoc> & { pos?: SaleDoc["pos"] } = {},
  totals = { tray: 339, greens: 240 },
): SaleDoc {
  const lines = [
    { kind: "variety" as const, key: "radish", lineTotal: totals.greens },
    { kind: "tray" as const, key: "tray-pair", lineTotal: totals.tray },
  ];
  const pos = over.pos === undefined ? HOME_STATE : over.pos;
  return {
    number: "FG/2627/00001",
    date: "2026-10-20",
    source: "order",
    id: "FGAAAAAAAAAA",
    buyer: null,
    rows: orderTax(lines, [{ lines: ["variety:radish", "tray:tray-pair"], charge: 0 }], pos),
    quantities: { "variety:radish": 2, "tray:tray-pair": 1 },
    ...over,
    pos,
  };
}

const line = (over: Partial<PurchaseLine> = {}): PurchaseLine => ({
  category: "stock",
  item: { kind: "tray", key: "tray-pair" },
  description: "Trays",
  quantity: 10,
  taxable: 100000,
  rate: 18,
  ...lineTax(100000, 18, true),
  credit: "full",
  ...over,
});

const bill = (over: Partial<PurchaseBill> = {}): PurchaseBill => ({
  id: "b1",
  vendor: { id: "v1", name: "Tray Co", kind: "registered", gstin: "29AAPFU0939F1ZV", state: HOME_STATE },
  number: "INV/26-27/0012",
  date: "2026-10-20",
  reverseCharge: false,
  lines: [line()],
  paidOn: null,
  claim: null,
  match: null,
  file: null,
  notes: "",
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
  ...over,
});

describe("periods", () => {
  it("names quarters by financial year", () => {
    expect(quarterOf("2026-10")).toBe("2627-Q3");
    expect(quarterOf("2027-01")).toBe("2627-Q4");
    expect(quarterOf("2027-04")).toBe("2728-Q1");
    expect(monthsOf("2627-Q4")).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(monthIndex("2026-11")).toBe(2);
  });

  it("knows what is due when, for a quarterly filer in Karnataka", () => {
    expect(dueDates("2627-Q3")).toEqual({
      iff: ["2026-11-13", "2026-12-13"],
      pmt06: ["2026-11-25", "2026-12-25"],
      gstr1: "2027-01-13",
      gstr3b: "2027-01-22",
    });
  });

  it("lists quarters from registration", () => {
    expect(quartersSince("2026-10-17")).toEqual(["2627-Q3"]);
    expect(quartersSince("2027-05-01")).toEqual(["2627-Q3", "2627-Q4", "2728-Q1"]);
  });

  it("speaks the portal's return period", () => {
    expect(returnPeriod("2026-12")).toBe("122026");
    expect(monthFromReturnPeriod("102026")).toBe("2026-10");
    expect(monthFromReturnPeriod("132026")).toBeNull();
  });
});

describe("setOff", () => {
  it("spends IGST credit where the head's own credit falls short", () => {
    const r = setOff({ igst: 0, cgst: 1000, sgst: 1000 }, { igst: 800, cgst: 1000, sgst: 200 });
    expect(r.used.igst.sgst).toBe(800);
    expect(r.cash).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(r.leftover).toEqual({ igst: 0, cgst: 0, sgst: 0 });
  });

  it("never lets CGST credit pay SGST", () => {
    const r = setOff({ igst: 0, cgst: 0, sgst: 500 }, { igst: 0, cgst: 2000, sgst: 0 });
    expect(r.cash.sgst).toBe(500);
    expect(r.leftover.cgst).toBe(2000);
  });

  it("lets CGST and SGST credit pay IGST", () => {
    const r = setOff({ igst: 1000, cgst: 0, sgst: 0 }, { igst: 0, cgst: 600, sgst: 600 });
    expect(r.cash.igst).toBe(0);
    expect(r.leftover).toEqual({ igst: 0, cgst: 0, sgst: 200 });
  });
});

describe("GSTR-1", () => {
  it("puts a consumer's taxable rows in table 7 and the greens in table 8", () => {
    const g = buildGstr1([sale()], []);
    expect(g.b2b).toEqual([]);
    expect(g.b2cs).toHaveLength(1);
    expect(g.b2cs[0]).toMatchObject({ rate: 18, intra: true, taxable: 28729 });
    expect(g.b2cs[0].cgst + g.b2cs[0].sgst).toBe(5171);
    expect(g.nil).toEqual([{ intra: true, registered: false, exempt: 24000 }]);
    expect(g.docs.invoices).toEqual({ from: "FG/2627/00001", to: "FG/2627/00001", count: 1 });
  });

  it("gives a GSTIN buyer a table 4 entry and registered exempt rows", () => {
    const g = buildGstr1([sale({ buyer: { gstin: "29HTUPS6000Q1ZI", name: "Leaf Co" } })], []);
    expect(g.b2b).toHaveLength(1);
    expect(g.b2b[0]).toMatchObject({
      gstin: "29HTUPS6000Q1ZI",
      value: 57900,
      items: [{ rate: 18, taxable: 28729 }],
    });
    expect(g.b2cs).toEqual([]);
    expect(g.nil[0]).toMatchObject({ registered: true });
    expect(g.hsn.every((h) => h.b2b)).toBe(true);
  });

  it("sends a large inter-state consumer invoice to table 5", () => {
    const big = sale({ pos: KERALA }, { tray: B2CL_ABOVE / 100 + 1, greens: 0 });
    expect(buildGstr1([sale({ pos: KERALA }, { tray: B2CL_ABOVE / 100, greens: 0 })], []).b2cl).toEqual([]);
    const g = buildGstr1([big], []);
    expect(g.b2cl).toHaveLength(1);
    expect(g.b2cl[0].items[0].igst).toBeGreaterThan(0);
    expect(g.b2cs).toEqual([]);
  });

  it("nets a consumer credit note in tables 7, 8 and 12 of its own period", () => {
    const d = sale();
    const credit: CreditDoc = { number: "CN/2627/00001", date: "2026-11-02", invoice: d };
    const g = buildGstr1([d], [credit]);
    expect(g.b2cs).toEqual([]);
    expect(g.nil).toEqual([]);
    expect(g.hsn).toEqual([]);
    expect(g.cdnr).toEqual([]);
    expect(g.docs.creditNotes?.count).toBe(1);
  });

  it("puts a B2B credit note in table 9B", () => {
    const d = sale({ buyer: { gstin: "29HTUPS6000Q1ZI", name: "Leaf Co" } });
    const g = buildGstr1([], [{ number: "CN/2627/00001", date: "2026-11-02", invoice: d }]);
    expect(g.cdnr).toHaveLength(1);
    expect(g.cdnr[0].invoice.number).toBe("FG/2627/00001");
  });

  it("counts table 12 quantities by line, not by delivery row", () => {
    const g = buildGstr1([sale()], []);
    expect(g.hsn.find((h) => h.hsn === "0709")).toMatchObject({ qty: 2, uqc: "NOS", value: 24000 });
    expect(g.hsn.find((h) => h.hsn === "3926")).toMatchObject({ qty: 1, uqc: "PAC" });
  });

  it("lists sales with no place of supply, which the portal will refuse", () => {
    expect(buildGstr1([sale({ pos: null })], []).unplaced).toHaveLength(1);
  });

  it("reports a subscription as exempt greens", () => {
    const sub: SaleDoc = {
      ...sale(),
      source: "subscription",
      rows: subscriptionTax([{ planKey: "essential", lineTotal: 1199 }], HOME_STATE),
      quantities: { "plan:essential": 4 },
    };
    const g = buildGstr1([sub], []);
    expect(g.b2cs).toEqual([]);
    expect(g.nil[0].exempt).toBe(119900);
    expect(g.hsn[0]).toMatchObject({ hsn: "0709", qty: 4 });
  });
});

describe("GSTR-3B", () => {
  it("reports sales, exempt sales and inter-state consumer sales", () => {
    const r = buildGstr3b([sale(), sale({ pos: KERALA, number: "FG/2627/00002" })], [], [], []);
    expect(r.outward.taxable).toBe(28729 * 2);
    expect(r.outward.igst).toBe(5171);
    expect(r.exempt).toBe(48000);
    expect(r.interStateB2c).toEqual([{ pos: KERALA, taxable: 28729, igst: 5171 }]);
  });

  it("reverses all credit on growing and the exempt share of shared costs", () => {
    const r = buildGstr3b(
      [sale()],
      [],
      [
        {
          taxable: 1000,
          heads: { igst: 0, cgst: 90, sgst: 90 },
          credit: "full",
          reverseCharge: false,
          imported: false,
        },
        {
          taxable: 1000,
          heads: { igst: 180, cgst: 0, sgst: 0 },
          credit: "shared",
          reverseCharge: false,
          imported: false,
        },
        {
          taxable: 1000,
          heads: { igst: 0, cgst: 90, sgst: 90 },
          credit: "none",
          reverseCharge: false,
          imported: false,
        },
      ],
      [],
    );
    const share = 24000 / (24000 + 28729);
    expect(r.rule42.share).toBeCloseTo(share, 6);
    expect(r.itc.reversed.igst).toBe(Math.round(180 * share));
    expect(r.itc.reversed.cgst).toBe(90);
    expect(r.itc.net.cgst).toBe(90);
  });

  it("makes reverse-charge tax a cash payment however much credit there is", () => {
    const r = buildGstr3b(
      [],
      [],
      [
        {
          taxable: 10000,
          heads: { igst: 1800, cgst: 0, sgst: 0 },
          credit: "full",
          reverseCharge: true,
          imported: false,
        },
      ],
      [],
    );
    expect(r.reverseCharge.igst).toBe(1800);
    const s = settle(r, { credit: { igst: 99999, cgst: 0, sgst: 0 }, cash: ZERO }, ZERO);
    expect(s.cashNeeded.igst).toBe(1800);
    expect(s.toPay.igst).toBe(1800);
  });

  it("puts a foreign vendor's credit in 4A(2), a domestic reverse charge in 4A(3)", () => {
    const rc = (imported: boolean) => ({
      taxable: 10000,
      heads: { igst: 1800, cgst: 0, sgst: 0 },
      credit: "full" as const,
      reverseCharge: true,
      imported,
    });
    const r = buildGstr3b([], [], [rc(true), rc(false)], []);
    expect(r.itc.importServices.igst).toBe(1800);
    expect(r.itc.reverseCharge.igst).toBe(1800);
    expect(r.reverseCharge.igst).toBe(3600);
    expect(r.itc.net.igst).toBe(3600);
  });

  it("subtracts what was already deposited, head by head", () => {
    const r = buildGstr3b([sale()], [], [], []);
    const s = settle(r, { credit: ZERO, cash: ZERO }, { igst: 0, cgst: 1000, sgst: 0 });
    expect(s.toPay.cgst).toBe(s.cashNeeded.cgst - 1000);
    expect(s.toPay.sgst).toBe(s.cashNeeded.sgst);
  });
});

describe("the quarter", () => {
  const books = (over: Partial<GstBooks> = {}): GstBooks => ({
    sales: [sale()],
    credits: [],
    bills: [],
    payments: [],
    filings: [],
    ...over,
  });

  it("claims credit in its GSTR-2B month, not its bill month", () => {
    const late = bill({ date: "2026-10-20", claim: { month: "2027-01", source: "gstr2b" } });
    const v = quarterView(books({ bills: [late] }), "2627-Q3");
    expect(sumHeads(v.figures.gstr3b.itc.net)).toBe(0);
    const next = quarterView(books({ bills: [late] }), "2627-Q4");
    expect(next.figures.gstr3b.itc.other.cgst).toBe(9000);
  });

  it("carries unused credit into the next quarter", () => {
    const big = bill({ claim: { month: "2026-10", source: "gstr2b" } });
    const opening = openingFor(books({ bills: [big] }), "2627-Q4");
    expect(opening.credit.cgst + opening.credit.sgst).toBe(18000 - 5171);
  });

  it("uses a filed quarter's own closing balances", () => {
    const filed = {
      quarter: "2627-Q3",
      gstr1: { filedOn: "2027-01-10", arn: "AA" },
      gstr3b: { filedOn: "2027-01-20", arn: "BB" },
      closing: { credit: { igst: 5, cgst: 6, sgst: 7 }, cash: ZERO },
      updatedAt: "",
    };
    expect(openingFor(books({ filings: [filed] }), "2627-Q4").credit).toEqual({ igst: 5, cgst: 6, sgst: 7 });
    expect(quarterView(books({ filings: [filed] }), "2627-Q3").locked).toBe(true);
  });

  it("works out month 2's payment on the quarter so far, less month 1's deposit", () => {
    const nov = sale({ number: "FG/2627/00002", date: "2026-11-05" });
    const paid = {
      id: "p1",
      month: "2026-10",
      paidOn: "2026-11-20",
      reference: "C1",
      heads: { igst: 0, cgst: 2586, sgst: 2585 },
      createdAt: "",
    };
    const v = quarterView(books({ sales: [sale(), nov], payments: [paid] }), "2627-Q3");
    expect(sumHeads(v.monthly[0].settlement.toPay)).toBe(5171);
    expect(sumHeads(v.monthly[0].paid)).toBe(5171);
    expect(sumHeads(v.monthly[1].settlement.toPay)).toBe(5171);
    expect(v.summaries[0].byCategory).toMatchObject({ variety: 24000, tray: 33900 });
  });
});

describe("GSTR-2B", () => {
  const file = JSON.stringify({
    data: {
      gstin: "29HTUPS6000Q1ZI",
      rtnprd: "102026",
      docdata: {
        b2b: [
          {
            ctin: "29AAPFU0939F1ZV",
            trdnm: "Tray Co",
            inv: [
              {
                inum: "INV/26-27/0012 ",
                dt: "10-10-2026",
                val: 1180,
                rev: "N",
                itcavl: "Y",
                items: [{ rt: 18, txval: 1000, cgst: 90, sgst: 90, igst: 0 }],
              },
              {
                inum: "X9",
                dt: "11-10-2026",
                val: 118,
                rev: "N",
                itcavl: "Y",
                items: [{ rt: 18, txval: 100, cgst: 9, sgst: 9 }],
              },
            ],
          },
        ],
      },
    },
  });

  it("reads the portal's download", () => {
    const r = parseGstr2b(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.statement.month).toBe("2026-10");
    expect(r.statement.invoices[0]).toMatchObject({
      number: "INV/26-27/0012",
      date: "2026-10-10",
      taxable: 100000,
      cgst: 9000,
    });
    expect(parseGstr2b("{}")).toEqual({ ok: false, code: "notGstr2b" });
    expect(parseGstr2b("nope")).toEqual({ ok: false, code: "notJson" });
  });

  it("matches a bill whatever its spacing and punctuation, and lists the rest", () => {
    const r = parseGstr2b(file);
    if (!r.ok) throw new Error();
    const m = matchStatement(r.statement, [bill({ number: "inv 26-27 0012" })]);
    expect(m.matched).toHaveLength(1);
    expect(m.matched[0].match.status).toBe("matched");
    expect(m.unknown.map((u) => u.number)).toEqual(["X9"]);
    expect(invoiceKey("29aapfu0939f1zv", "a/1")).toBe(invoiceKey("29AAPFU0939F1ZV", "A 1"));
  });

  it("flags a bill the vendor reported differently", () => {
    const r = parseGstr2b(file);
    if (!r.ok) throw new Error();
    const off = bill({ lines: [line({ taxable: 120000, ...lineTax(120000, 18, true) })] });
    expect(matchStatement(r.statement, [off]).matched[0].match.status).toBe("mismatch");
  });

  it("claims a matched bill in the statement's month, and nothing that differs", () => {
    const r = parseGstr2b(file);
    if (!r.ok) throw new Error();
    const found = matchStatement(r.statement, [bill()]).matched[0];
    expect(claimFromMatch(found)).toEqual({ month: r.statement.month, source: "gstr2b" });
    const off = bill({ lines: [line({ taxable: 120000, ...lineTax(120000, 18, true) })] });
    expect(claimFromMatch(matchStatement(r.statement, [off]).matched[0])).toBeNull();
    expect(claimFromMatch({ ...found, invoice: { ...found.invoice, itcAvailable: false } })).toBeNull();
  });

  it("takes back a claim the statement gave once the amounts disagree, never one made by hand", () => {
    const r = parseGstr2b(file);
    if (!r.ok) throw new Error();
    const off = (claim: PurchaseBill["claim"]) =>
      matchStatement(r.statement, [
        bill({ claim, lines: [line({ taxable: 120000, ...lineTax(120000, 18, true) })] }),
      ]).matched[0];
    expect(claimAfterMatch(off({ month: "2026-10", source: "gstr2b" }))).toBeNull();
    expect(claimAfterMatch(off({ month: "2026-10", source: "manual" }))).toEqual({
      month: "2026-10",
      source: "manual",
    });
    const agreed = matchStatement(r.statement, [bill({ claim: null })]).matched[0];
    expect(claimAfterMatch(agreed)).toEqual({ month: r.statement.month, source: "gstr2b" });
  });
});

describe("purchase bills", () => {
  it("adds tax to the value as a vendor's invoice does", () => {
    expect(lineTax(100000, 18, true)).toEqual({ igst: 0, cgst: 9000, sgst: 9000 });
    expect(lineTax(100000, 5, false)).toEqual({ igst: 5000, cgst: 0, sgst: 0 });
    expect(lineTax(100000, 0, true)).toEqual({ igst: 0, cgst: 0, sgst: 0 });
  });

  it("moves stock by the difference an edit makes", () => {
    const before = [line({ quantity: 10 }), line({ item: { kind: "seed", key: "radish" }, quantity: 500 })];
    const after = [line({ quantity: 12 })];
    expect(Object.fromEntries(stockChange(before, after))).toEqual({
      "tray:tray-pair": 2,
      "seed:radish": -500,
    });
    expect(Object.fromEntries(stockChange([line({ category: "growing" })], []))).toEqual({});
  });

  it("says where each bill stands", () => {
    expect(billStatus(bill())).toBe("waiting");
    expect(billStatus(bill({ claim: { month: "2026-10", source: "gstr2b" } }))).toBe("claimed");
    expect(
      billStatus(
        bill({
          vendor: { id: "v", name: "x", kind: "unregistered", gstin: null, state: null },
          lines: [line({ rate: 0, cgst: 0, sgst: 0 })],
        }),
      ),
    ).toBe("noGst");
    expect(payBy(bill())).toBe("2027-04-18");
    expect(billStatus(bill({ date: "2026-10-16" }))).toBe("noGst");
  });
});
