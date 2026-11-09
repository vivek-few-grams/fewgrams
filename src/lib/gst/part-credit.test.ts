import { describe, expect, it } from "vitest";
import type { OrderAddress } from "@/lib/orders/order";
import type { Subscription } from "@/lib/subscriptions/subscription";
import { orderTax, subscriptionTax, type TaxRow } from "@/lib/tax/order-tax";
import { HOME_STATE, gstStateFor } from "@/lib/tax/states";
import { buildGstr1 } from "./gstr1";
import { buildGstr3b } from "./gstr3b";
import { quarterView, type GstBooks } from "./quarter";
import {
  creditFromSubscription,
  creditRows,
  credited,
  docValue,
  saleFromSubscription,
  type CreditDoc,
  type SaleDoc,
} from "./sales";

/**
 * A credit note for part of an invoice (8 Nov 2026) — a subscription
 * cancelled after some of its Saturdays, refunded for the rest. Its rows are
 * the invoice's scaled to the refund, and the returns take back that much,
 * not the whole bill.
 */

const sum = (rows: TaxRow[], k: keyof Pick<TaxRow, "gross" | "taxable" | "cgst" | "sgst" | "igst">) =>
  rows.reduce((a, r) => a + r[k], 0);

const row = (over: Partial<TaxRow>): TaxRow => ({
  source: "line",
  line: "tray:tray-pair",
  hsn: "3926",
  rate: 18,
  gross: 0,
  taxable: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  ...over,
});

describe("creditRows", () => {
  it("shares the amount across rows by value, in whole paise that add up exactly", () => {
    const rows = subscriptionTax(
      [
        { planKey: "essential", lineTotal: 1199 },
        { planKey: "exotic", lineTotal: 1799 },
      ],
      HOME_STATE,
    );
    const part = creditRows(rows, 100001);
    expect(sum(part, "gross")).toBe(100001);
    /* 100001 × 1199/2998 = 39993.73…, × 1799/2998 = 60007.27…: the odd
       paisa goes to the larger remainder. */
    expect(part.map((r) => r.gross)).toEqual([39994, 60007]);
    for (const r of part) expect(r.taxable + r.cgst + r.sgst + r.igst).toBe(r.gross);
    expect(part.map((r) => r.line)).toEqual(["plan:essential", "plan:exotic"]);
  });

  it("scales a taxed row's heads from the invoice's and keeps CGST and SGST equal", () => {
    const rows = orderTax([{ kind: "tray", key: "tray-pair", lineTotal: 339 }], [], HOME_STATE);
    const [r] = creditRows(rows, 10000);
    expect(r.cgst).toBe(r.sgst);
    expect(r).toMatchObject({ gross: 10000, cgst: Math.round((rows[0].cgst * 10000) / 33900) });
    expect(r.taxable).toBe(10000 - 2 * r.cgst);
  });

  it("follows a row split before 8 Nov 2026, the odd paisa on CGST, rather than resplitting it", () => {
    const old = row({ gross: 33900, taxable: 28729, cgst: 2586, sgst: 2585 });
    const [r] = creditRows([old], 16950);
    expect(r).toMatchObject({ gross: 16950, cgst: 1293, sgst: 1293, taxable: 14364 });
    const inter = row({ gross: 33900, taxable: 28729, igst: 5171 });
    expect(creditRows([inter], 16950)[0]).toMatchObject({ igst: 2586, cgst: 0, sgst: 0, taxable: 14364 });
  });

  it("gives back the invoice's own rows for the whole amount", () => {
    const rows = [
      ...orderTax(
        [
          { kind: "variety", key: "radish", lineTotal: 240 },
          { kind: "tray", key: "tray-pair", lineTotal: 339 },
        ],
        [{ lines: ["variety:radish", "tray:tray-pair"], charge: 79 }],
        HOME_STATE,
      ),
      row({ gross: 33900, taxable: 28729, cgst: 2586, sgst: 2585 }),
    ];
    expect(creditRows(rows, sum(rows, "gross"))).toEqual(rows);
  });

  it("refuses an amount that is not whole paise within the invoice", () => {
    const rows = subscriptionTax([{ planKey: "essential", lineTotal: 1199 }], HOME_STATE);
    expect(() => creditRows(rows, 119901)).toThrow();
    expect(() => creditRows(rows, -1)).toThrow();
    expect(() => creditRows(rows, 10.5)).toThrow();
    expect(sum(creditRows(rows, 0), "gross")).toBe(0);
  });
});

/** A cancelled subscription: one Everyday Essentials bundle, two of its four
 *  Saturdays delivered, billed 10 Nov and refunded half on 2 Dec. */
function cancelled(over: Partial<Subscription> = {}): Subscription {
  const lines = [
    {
      planId: "p1",
      planKey: "essential",
      name: "Everyday Essentials",
      boxes: 1,
      monthlyPrice: 1199,
      lineTotal: 1199,
      gramsPerBox: 100,
    },
  ];
  const tax = subscriptionTax(lines, HOME_STATE);
  return {
    id: "FSAAAAAAAAAA",
    userId: "u1",
    email: null,
    status: "cancelled",
    lines,
    total: 1199,
    deliveries: [
      { date: "2026-11-14", week: 1 },
      { date: "2026-11-21", week: 2 },
    ],
    skipped: [],
    held: 0,
    address: {
      label: "Home",
      recipient: "A",
      phone: "9999999999",
      line1: "1",
      pincode: "560001",
    } as OrderAddress,
    locale: "en",
    provider: "razorpay",
    providerOrderId: null,
    receiptNo: null,
    invoiceNo: "FG/2627/00007",
    tax,
    placeOfSupply: HOME_STATE,
    paidAt: "2026-11-10T05:00:00.000Z",
    finishingAt: "2026-11-10T05:00:00.000Z",
    finishedAt: "2026-11-10T05:00:01.000Z",
    refund: { amount: 59950, rows: creditRows(tax, 59950), recordedAt: "2026-12-01T20:00:00.000Z" },
    creditNote: { number: "CN/2627/00002", issuedAt: "2026-12-01T20:00:00.000Z" },
    creditNoteClaimedAt: "2026-12-01T20:00:00.000Z",
    createdAt: "2026-11-10T04:59:00.000Z",
    updatedAt: "2026-12-01T20:00:00.000Z",
    expiresAt: "2026-11-10T05:20:00.000Z",
    ...over,
  };
}

describe("creditFromSubscription", () => {
  it("is the refund's credit note, dated by its IST issue day", () => {
    const c = creditFromSubscription(cancelled())!;
    expect(c.number).toBe("CN/2627/00002");
    /* 20:00 UTC on 1 Dec is 01:30 on 2 Dec in India. */
    expect(c.date).toBe("2026-12-02");
    expect(c.invoice.number).toBe("FG/2627/00007");
    expect(docValue(credited(c))).toBe(59950);
    /* Half the term refunded: two of the four boxes. */
    expect(credited(c).quantities).toEqual({ "plan:essential": 2 });
  });

  it("is none until the refund has its number, and none for a subscription never refunded", () => {
    expect(creditFromSubscription(cancelled({ creditNote: undefined }))).toBeNull();
    expect(creditFromSubscription(cancelled({ refund: undefined, creditNote: undefined }))).toBeNull();
    expect(creditFromSubscription(cancelled({ invoiceNo: null }))).toBeNull();
  });
});

describe("a part credit note in the returns", () => {
  const sub = cancelled();
  const bill = saleFromSubscription(sub)!;
  const note = creditFromSubscription(sub)!;
  const books = (over: Partial<GstBooks> = {}): GstBooks => ({
    sales: [bill],
    credits: [note],
    bills: [],
    payments: [],
    filings: [],
    ...over,
  });

  it("takes the refund, not the whole bill, out of table 8, table 12 and 3.1(c)", () => {
    const v = quarterView(books(), "2627-Q3");
    expect(v.figures.gstr1.nil).toEqual([{ intra: true, registered: false, exempt: 119900 - 59950 }]);
    expect(v.figures.gstr1.hsn).toEqual([
      expect.objectContaining({ hsn: "0709", qty: 2, value: 59950, taxable: 59950 }),
    ]);
    expect(v.figures.gstr3b.exempt).toBe(59950);
  });

  it("is in its issue month: the bill in November, the credit in December", () => {
    const [oct, nov, dec] = quarterView(books(), "2627-Q3").summaries;
    expect(oct.sales).toBe(0);
    expect(nov).toMatchObject({ invoices: 1, creditNotes: 0, sales: 119900, exempt: 119900 });
    expect(dec).toMatchObject({ invoices: 0, creditNotes: 1, sales: -59950, exempt: -59950 });
    expect(dec.byCategory).toEqual({ plan: -59950 });
  });

  it("shrinks Rule 42's exempt share by the refund", () => {
    const tray: SaleDoc = {
      ...bill,
      number: "FG/2627/00008",
      source: "order",
      rows: orderTax([{ kind: "tray", key: "tray-pair", lineTotal: 339 }], [], HOME_STATE),
      quantities: { "tray:tray-pair": 1 },
    };
    const shared = [
      {
        taxable: 10000,
        heads: { igst: 1800, cgst: 0, sgst: 0 },
        credit: "shared" as const,
        reverseCharge: false,
        imported: false,
      },
    ];
    const before = buildGstr3b([bill, tray], [], shared, []).rule42;
    const after = buildGstr3b([bill, tray], [note], shared, []).rule42;
    expect(before.exemptTurnover).toBe(119900);
    expect(after.exemptTurnover).toBe(59950);
    expect(after.share).toBeCloseTo(59950 / (59950 + tray.rows[0].taxable), 9);
    expect(after.commonReversed.igst).toBeLessThan(before.commonReversed.igst);
  });

  it("puts a part credit note against a B2B invoice in table 9B at the amount credited", () => {
    const b2b: SaleDoc = {
      ...bill,
      buyer: { gstin: "29HTUPS6000Q1ZI", name: "Leaf Co" },
      rows: orderTax([{ kind: "tray", key: "tray-pair", lineTotal: 339 }], [], HOME_STATE),
      quantities: { "tray:tray-pair": 1 },
    };
    const part: CreditDoc = {
      number: "CN/2627/00003",
      date: "2026-12-02",
      invoice: b2b,
      part: { rows: creditRows(b2b.rows, 10000), quantities: { "tray:tray-pair": 0 } },
    };
    const g = buildGstr1([], [part]);
    expect(g.cdnr).toHaveLength(1);
    expect(g.cdnr[0]).toMatchObject({ value: 10000, invoice: { number: b2b.number } });
    expect(g.cdnr[0].items[0].taxable).toBe(part.part!.rows[0].taxable);
    expect(g.b2cs).toEqual([]);
  });

  it("files a part credit note against a large out-of-state invoice by the invoice, not the note", () => {
    const kerala = gstStateFor("Kerala")!;
    const big: SaleDoc = {
      ...bill,
      pos: kerala,
      rows: orderTax([{ kind: "tray", key: "tray-pair", lineTotal: 1_50_000 }], [], kerala),
      quantities: { "tray:tray-pair": 1 },
    };
    const part: CreditDoc = {
      number: "CN/2627/00004",
      date: "2026-12-02",
      invoice: big,
      part: { rows: creditRows(big.rows, 10_000_00), quantities: { "tray:tray-pair": 0 } },
    };
    const g = buildGstr1([], [part]);
    expect(g.cdnur).toHaveLength(1);
    expect(g.cdnur[0].value).toBe(10_000_00);
    expect(g.b2cs).toEqual([]);
  });
});
