import { describe, expect, it } from "vitest";
import { orderTax } from "@/lib/tax/order-tax";
import { HOME_STATE, gstStateFor, type GstState } from "@/lib/tax/states";
import { buildGstr3b, reportedOutward, settle } from "./gstr3b";
import { ZERO, addHeads, scaleHeads, setOff } from "./ledger";
import { openingFor, quarterView, type GstBooks, type GstFiling } from "./quarter";
import type { CreditDoc, SaleDoc } from "./sales";

/**
 * The Negative Liability Statement (8 Nov 2026): a quarter whose credit
 * notes exceed its sales in a head reports that head as 0 in 3.1 and carries
 * the excess into the quarters after, set off against the same head before
 * any credit or cash. It used to be floored away.
 */

const KERALA = gstStateFor("Kerala")!;

let n = 0;
/** A tray sale of `rupees`, invoiced on `date`. */
function tray(rupees: number, date: string, pos: GstState = HOME_STATE): SaleDoc {
  n += 1;
  return {
    number: `FG/2627/${String(n).padStart(5, "0")}`,
    date,
    source: "order",
    id: `FG${n}`,
    buyer: null,
    pos,
    rows: orderTax([{ kind: "tray", key: "tray-pair", lineTotal: rupees }], [], pos),
    quantities: { "tray:tray-pair": 1 },
  };
}
const refund = (invoice: SaleDoc, date: string): CreditDoc => ({
  number: `CN-${invoice.number}`,
  date,
  invoice,
});

const books = (over: Partial<GstBooks>): GstBooks => ({
  sales: [],
  credits: [],
  bills: [],
  payments: [],
  filings: [],
  ...over,
});

/* ₹100 of trays at 18% within Karnataka: ₹84.74 + ₹7.63 + ₹7.63. */
const OCT_TRAY = tray(100, "2026-12-10");
const JAN_REFUND = refund(OCT_TRAY, "2027-01-05");

describe("setOff with a negative liability", () => {
  it("sets the statement off head by head before any credit", () => {
    const r = setOff(
      { igst: 0, cgst: 1000, sgst: 1000 },
      { igst: 500, cgst: 500, sgst: 500 },
      {
        igst: 0,
        cgst: 763,
        sgst: 0,
      },
    );
    expect(r.negativeUsed).toEqual({ igst: 0, cgst: 763, sgst: 0 });
    /* CGST owes 237 after the statement; its own credit pays it. SGST owes
       1000: IGST credit first, as s.49(5) orders, then SGST credit. */
    expect(r.cash).toEqual(ZERO);
    expect(r.leftover).toEqual({ igst: 0, cgst: 263, sgst: 0 });
    expect(r.negative).toEqual(ZERO);
  });

  it("carries what this period's own credit notes take below zero", () => {
    const r = setOff({ igst: -500, cgst: 200, sgst: -50 }, ZERO, { igst: 100, cgst: 300, sgst: 0 });
    expect(r.negativeUsed).toEqual({ igst: 0, cgst: 200, sgst: 0 });
    expect(r.negativeArising).toEqual({ igst: 500, cgst: 0, sgst: 50 });
    expect(r.negative).toEqual({ igst: 600, cgst: 100, sgst: 50 });
    expect(r.cash).toEqual(ZERO);
  });

  it("is the old set-off when nothing is brought in", () => {
    const r = setOff({ igst: 0, cgst: 500, sgst: 500 }, ZERO);
    expect(r.cash).toEqual({ igst: 0, cgst: 500, sgst: 500 });
    expect(r.negative).toEqual(ZERO);
  });
});

describe("a quarter with only a ₹100 tray credit note", () => {
  const b = books({ sales: [OCT_TRAY], credits: [JAN_REFUND] });
  const q4 = quarterView(b, "2627-Q4");

  it("keeps the signed figure in the books but reports 0 in 3.1", () => {
    expect(q4.figures.gstr3b.outward).toEqual({ taxable: -8474, igst: 0, cgst: -763, sgst: -763 });
    expect(reportedOutward(q4.figures.gstr3b.outward)).toEqual({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });
  });

  it("records the excess in the statement and pays nothing", () => {
    expect(q4.settlement.negative.arising).toEqual({ igst: 0, cgst: 763, sgst: 763 });
    expect(q4.settlement.negative.closing).toEqual({ igst: 0, cgst: 763, sgst: 763 });
    expect(q4.settlement.toPay).toEqual(ZERO);
    expect(q4.settlement.setOff.cash).toEqual(ZERO);
  });

  it("carries it into the next quarter's opening", () => {
    expect(openingFor(b, "2728-Q1").negative).toEqual({ igst: 0, cgst: 763, sgst: 763 });
  });
});

describe("carrying the statement forward", () => {
  it("sets it off against the next quarter's sales before cash", () => {
    /* ₹339 of trays in April: ₹25.86 each of CGST and SGST. */
    const apr = tray(339, "2027-04-12");
    const q1 = quarterView(books({ sales: [OCT_TRAY, apr], credits: [JAN_REFUND] }), "2728-Q1");
    expect(q1.opening.negative).toEqual({ igst: 0, cgst: 763, sgst: 763 });
    expect(q1.settlement.negative.used).toEqual({ igst: 0, cgst: 763, sgst: 763 });
    expect(q1.settlement.toPay).toEqual({ igst: 0, cgst: 2586 - 763, sgst: 2586 - 763 });
    expect(q1.settlement.negative.closing).toEqual(ZERO);
    /* PMT-06 for April is worked out from the same set-off. */
    expect(q1.monthly[0].settlement.toPay).toEqual({ igst: 0, cgst: 1823, sgst: 1823 });
  });

  it("uses only what the next quarter's tax needs and carries the rest", () => {
    /* ₹50 of trays: ₹3.81 each. */
    const apr = tray(50, "2027-04-12");
    const b = books({ sales: [OCT_TRAY, apr], credits: [JAN_REFUND] });
    const q1 = quarterView(b, "2728-Q1");
    expect(q1.settlement.negative.used).toEqual({ igst: 0, cgst: 381, sgst: 381 });
    expect(q1.settlement.toPay).toEqual(ZERO);
    expect(q1.settlement.negative.closing).toEqual({ igst: 0, cgst: 382, sgst: 382 });
    expect(openingFor(b, "2728-Q2").negative).toEqual({ igst: 0, cgst: 382, sgst: 382 });
  });

  it("adds up: brought in, plus arising, less set off, is carried forward", () => {
    const apr = tray(50, "2027-04-12");
    const kerala = refund(tray(100, "2027-04-01", KERALA), "2027-05-02");
    const b = books({ sales: [OCT_TRAY, apr, kerala.invoice], credits: [JAN_REFUND, kerala] });
    for (const q of ["2627-Q3", "2627-Q4", "2728-Q1"]) {
      const neg = quarterView(b, q).settlement.negative;
      expect(addHeads(neg.opening, neg.arising, scaleHeads(neg.used, -1))).toEqual(neg.closing);
    }
  });

  it("keeps each head to itself", () => {
    /* An inter-state refund leaves negative IGST; April's sale is local and
       owes CGST and SGST, which the IGST statement cannot touch. */
    const kerala = tray(100, "2026-12-10", KERALA);
    const apr = tray(339, "2027-04-12");
    const b = books({ sales: [kerala, apr], credits: [refund(kerala, "2027-01-05")] });
    expect(quarterView(b, "2627-Q4").settlement.negative.closing).toEqual({ igst: 1525, cgst: 0, sgst: 0 });
    const q1 = quarterView(b, "2728-Q1");
    expect(q1.settlement.negative.used).toEqual(ZERO);
    expect(q1.settlement.toPay).toEqual({ igst: 0, cgst: 2586, sgst: 2586 });
    expect(q1.settlement.negative.closing).toEqual({ igst: 1525, cgst: 0, sgst: 0 });
  });

  it("spends no credit where the statement covers the tax", () => {
    const sales = buildGstr3b([tray(100, "2027-04-12")], [], [], []);
    const credit = { igst: 0, cgst: 1000, sgst: 1000 };
    const s = settle(sales, { credit, cash: ZERO, negative: { igst: 0, cgst: 763, sgst: 763 } }, ZERO);
    expect(s.closingCredit).toEqual(credit);
    expect(s.toPay).toEqual(ZERO);
  });
});

describe("negative credit and negative sales tax in the same head", () => {
  it("charges the negative credit now and carries the sales excess, rather than netting them", () => {
    // Credit notes took CGST/SGST sales tax 763 below zero, and a vendor's
    // credit note took CGST/SGST credit 500 below zero, in one quarter.
    const r = {
      outward: { taxable: -8474, igst: 0, cgst: -763, sgst: -763 },
      reverseCharge: ZERO,
      itc: { net: { igst: 0, cgst: -500, sgst: -500 } },
    } as unknown as Parameters<typeof settle>[0];
    const s = settle(r, { credit: ZERO, cash: ZERO }, ZERO);
    expect(s.toPay).toEqual({ igst: 0, cgst: 500, sgst: 500 });
    expect(s.negative.arising).toEqual({ igst: 0, cgst: 763, sgst: 763 });
    expect(s.negative.closing).toEqual({ igst: 0, cgst: 763, sgst: 763 });
  });
});

describe("a filed quarter's statement", () => {
  const filed = (closing: GstFiling["closing"]): GstFiling[] => [
    {
      quarter: "2627-Q4",
      gstr1: { filedOn: "2027-04-10", arn: "AA" },
      gstr3b: { filedOn: "2027-04-20", arn: "BB" },
      closing,
      updatedAt: "",
    },
  ];

  it("opens the next quarter from the balance frozen with it", () => {
    const b = books({
      filings: filed({ credit: ZERO, cash: ZERO, negative: { igst: 0, cgst: 5, sgst: 6 } }),
    });
    expect(openingFor(b, "2728-Q1").negative).toEqual({ igst: 0, cgst: 5, sgst: 6 });
  });

  it("reads a quarter filed before the statement existed as none", () => {
    const b = books({
      sales: [OCT_TRAY],
      credits: [JAN_REFUND],
      filings: filed({ credit: ZERO, cash: ZERO }),
    });
    expect(openingFor(b, "2728-Q1").negative).toEqual(ZERO);
  });
});
