import { describe, expect, it } from "vitest";
import { claimAfterMatch, claimFromMatch, matchStatement, parseGstr2b, type Gstr2b } from "@/lib/gst/gstr2b";
import { settle } from "@/lib/gst/gstr3b";
import { ZERO, sumHeads } from "@/lib/gst/ledger";
import { isLockedBill, periodFigures, quarterView, type GstBooks, type GstFiling } from "@/lib/gst/quarter";
import { HOME_STATE } from "@/lib/tax/states";
import {
  billStatus,
  docSign,
  documentStockChange,
  lineTax,
  owesPayBy,
  signedTotals,
  type PurchaseBill,
  type PurchaseLine,
} from "./bill";
import { latestCosts } from "./cost";
import { readBill } from "./read";
import type { Vendor } from "./vendor";

/**
 * A vendor's credit note (8 Nov 2026) — entered on the bill form, typed
 * positive, counted negative: stock off the shelf, never a cost, and its GST
 * off the credit in the month its GSTR-2B shows it. And a claim withdrawn by
 * hand, which no save or upload claims again.
 */

const TRAY_CO = { id: "v1", name: "Tray Co", kind: "registered" as const, gstin: "29AAPFU0939F1ZV" };

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

const doc = (over: Partial<PurchaseBill> = {}): PurchaseBill => ({
  id: "b1",
  vendor: { ...TRAY_CO, state: HOME_STATE },
  number: "INV/26-27/0012",
  date: "2026-10-20",
  reverseCharge: false,
  lines: [line()],
  paidOn: null,
  claim: null,
  match: null,
  file: null,
  notes: "",
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
  ...over,
});

/** Two packs of the ten sent back, on credit note CN-3. */
const returned = (over: Partial<PurchaseBill> = {}) =>
  doc({
    id: "n1",
    doc: "creditNote",
    number: "CN-3",
    date: "2026-11-05",
    lines: [line({ quantity: 2, taxable: 20000, ...lineTax(20000, 18, true) })],
    createdAt: "2026-11-05T00:00:00Z",
    ...over,
  });

describe("entering a credit note", () => {
  const vendor: Vendor = {
    ...TRAY_CO,
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
  };
  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields: Record<string, string> = {
      vendorId: "v1",
      number: "CN-3",
      date: "2026-11-05",
      category: "stock",
      item: "tray:tray-pair",
      description: "",
      quantity: "2",
      taxable: "200",
      rate: "18",
      igst: "",
      cgst: "",
      sgst: "",
      credit: "full",
      ...extra,
    };
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };
  const register = [
    doc({ id: "b1" }),
    doc({ id: "b2", vendor: { ...TRAY_CO, id: "v2", state: HOME_STATE } }),
    returned({ id: "n0" }),
  ];
  const ctx = {
    vendors: new Map([["v1", vendor]]),
    stockItems: new Set(["tray:tray-pair"]),
    bills: register,
  };
  const read = (extra: Record<string, string> = {}) => readBill(form(extra), { ...ctx, today: "2026-11-08" });

  it("is a bill unless the box is ticked, and takes its amounts positive as printed", () => {
    expect(read().ok && read()).toMatchObject({ value: { doc: "bill", against: null } });
    const r = read({ creditNote: "on" });
    expect(r.ok && r.value).toMatchObject({ doc: "creditNote", against: null });
    expect(r.ok && r.value.lines[0]).toMatchObject({ quantity: 2, taxable: 20000, cgst: 1800, sgst: 1800 });
    /* No minus in a line: the sign is the document's. */
    const minus = read({ creditNote: "on", taxable: "-200" });
    expect(!minus.ok && minus.state).toMatchObject({ code: "taxableInvalid" });
  });

  it("may name one of the same vendor's bills, and nothing else", () => {
    expect(read({ creditNote: "on", against: "b1" })).toMatchObject({ ok: true, value: { against: "b1" } });
    for (const against of ["b2", "n0", "nope"]) {
      expect(read({ creditNote: "on", against })).toMatchObject({
        ok: false,
        state: { code: "againstInvalid", field: "against" },
      });
    }
    /* A bill names no original, whatever is posted. */
    expect(read({ against: "b2" })).toMatchObject({ ok: true, value: { doc: "bill", against: null } });
  });
});

describe("a credit note's stock", () => {
  const change = (before: PurchaseBill | null, after: PurchaseBill | null) =>
    Object.fromEntries(documentStockChange(before, after));

  it("takes its goods off the shelf when entered, and puts them back when deleted", () => {
    expect(change(null, returned())).toEqual({ "tray:tray-pair": -2 });
    expect(change(returned(), null)).toEqual({ "tray:tray-pair": 2 });
  });

  it("moves only the difference on an edit", () => {
    const three = returned({ lines: [line({ quantity: 3 })] });
    expect(change(returned(), three)).toEqual({ "tray:tray-pair": -1 });
    expect(change(three, returned())).toEqual({ "tray:tray-pair": 1 });
    expect(change(returned(), returned({ notes: "paid back" }))).toEqual({});
  });

  it("undoes the bill and does the note when a bill is corrected into one", () => {
    /* Ten packs had come on as a bill; as a credit note for two, ten come
       back off and two more go. */
    expect(change(doc(), doc({ doc: "creditNote", lines: [line({ quantity: 2 })] }))).toEqual({
      "tray:tray-pair": -12,
    });
    /* A bill is still a bill, read with or without `doc`. */
    expect(change(null, doc())).toEqual({ "tray:tray-pair": 10 });
    expect(change(null, doc({ doc: "bill" }))).toEqual({ "tray:tray-pair": 10 });
  });
});

describe("a credit note's cost", () => {
  it("never sets one — the latest bill's stands", () => {
    const costs = latestCosts([
      doc(),
      returned({ lines: [line({ quantity: 2, taxable: 1000, cgst: 0, sgst: 0 })] }),
    ]);
    expect(costs.get("tray:tray-pair")?.source.billId).toBe("b1");
    expect(costs.get("tray:tray-pair")?.cost).toBe(118);
    /* With only a note on file, the item has no cost from bills. */
    expect(latestCosts([returned()]).size).toBe(0);
  });
});

describe("how a credit note counts", () => {
  it("is negative wherever documents are summed", () => {
    expect(docSign(doc())).toBe(1);
    expect(docSign(returned())).toBe(-1);
    expect(signedTotals(returned())).toEqual({
      taxable: -20000,
      gross: -23600,
      igst: 0,
      cgst: -1800,
      sgst: -1800,
    });
    expect(signedTotals(doc()).gross).toBe(118000);
  });

  it("owes no pay-by date: the 180-day rule is about paying a vendor", () => {
    expect(owesPayBy(doc())).toBe(true);
    expect(owesPayBy(returned())).toBe(false);
  });

  it("waits for its GSTR-2B, then is taken off the credit", () => {
    expect(billStatus(returned())).toBe("waiting");
    expect(billStatus(returned({ claim: { month: "2026-11", source: "gstr2b" } }))).toBe("claimed");
  });
});

/** A statement holding Tray Co's invoice 12 and its credit note — numbered
 *  12 too, in its own series. */
const statement = (month: string, notes: Partial<Gstr2b["invoices"][number]>[] = [{}]): Gstr2b => ({
  month,
  gstin: "29HTUPS6000Q1ZI",
  invoices: [
    {
      gstin: TRAY_CO.gstin,
      name: "Tray Co",
      number: "12",
      date: "2026-10-20",
      value: 118000,
      taxable: 100000,
      igst: 0,
      cgst: 9000,
      sgst: 9000,
      itcAvailable: true,
      reverseCharge: false,
      note: false,
    },
    ...notes.map((over) => ({
      gstin: TRAY_CO.gstin,
      name: "Tray Co",
      number: "12",
      date: "2026-11-05",
      value: 23600,
      taxable: 20000,
      igst: 0,
      cgst: 1800,
      sgst: 1800,
      itcAvailable: true,
      reverseCharge: false,
      note: true,
      ...over,
    })),
  ],
});

describe("matching credit notes to GSTR-2B", () => {
  const bill12 = doc({ number: "12" });
  const note12 = returned({ number: "12" });

  it("matches a portal note to the credit note, and the invoice to the bill, though they share a number", () => {
    const m = matchStatement(statement("2026-11"), [bill12, note12]);
    expect(m.matched.map((x) => [x.bill.id, x.invoice.note, x.match.status])).toEqual([
      ["b1", false, "matched"],
      ["n1", true, "matched"],
    ]);
    expect(m.unknown).toEqual([]);
  });

  it("never matches a portal note to a bill, or an invoice to a credit note", () => {
    const notesOnly = matchStatement(statement("2026-11"), [note12]);
    expect(notesOnly.matched.map((x) => x.bill.id)).toEqual(["n1"]);
    expect(notesOnly.unknown.map((u) => u.note)).toEqual([false]);
    const billsOnly = matchStatement(statement("2026-11"), [bill12]);
    expect(billsOnly.matched.map((x) => x.bill.id)).toEqual(["b1"]);
    expect(billsOnly.unknown.map((u) => u.note)).toEqual([true]);
  });

  it("judges a note's amounts head by head, within a rupee, as a bill's", () => {
    const status = (over: Partial<Gstr2b["invoices"][number]>) =>
      matchStatement(statement("2026-11", [over]), [note12]).matched[0].match.status;
    expect(status({})).toBe("matched");
    expect(status({ taxable: 20100, cgst: 1850, sgst: 1750 })).toBe("matched");
    expect(status({ taxable: 20101 })).toBe("mismatch");
    expect(status({ igst: 3600, cgst: 0, sgst: 0 })).toBe("mismatch");
  });

  it("leaves a note two credit notes answer to unmatched, and says so", () => {
    const twin = returned({ id: "n2", number: "12 ", date: "2027-01-10" });
    const m = matchStatement(statement("2026-11"), [note12, twin]);
    expect(m.matched).toEqual([]);
    expect(m.ambiguous.map((a) => a.bills.map((b) => b.id))).toEqual([["n1", "n2"]]);
  });

  it("takes the note off the credit in the statement's month, on the same terms as a bill's claim", () => {
    const found = matchStatement(statement("2026-11"), [note12]).matched[0];
    expect(claimFromMatch(found)).toEqual({ month: "2026-11", source: "gstr2b" });
    expect(claimFromMatch({ ...found, invoice: { ...found.invoice, itcAvailable: false } })).toBeNull();
  });

  it("reads the notes section's credit notes as notes, its debit notes as invoices, amounts as magnitudes", () => {
    const file = JSON.stringify({
      data: {
        gstin: "29HTUPS6000Q1ZI",
        rtnprd: "112026",
        docdata: {
          cdnr: [
            {
              ctin: TRAY_CO.gstin,
              trdnm: "Tray Co",
              nt: [
                {
                  ntnum: "CN-3",
                  typ: "C",
                  dt: "05-11-2026",
                  val: -236,
                  itcavl: "Y",
                  rev: "N",
                  items: [{ rt: 18, txval: -200, cgst: -18, sgst: -18 }],
                },
                {
                  ntnum: "DN-1",
                  typ: "D",
                  dt: "06-11-2026",
                  val: 59,
                  itcavl: "Y",
                  rev: "N",
                  items: [{ rt: 18, txval: 50, cgst: 4.5, sgst: 4.5 }],
                },
              ],
            },
          ],
        },
      },
    });
    const r = parseGstr2b(file);
    if (!r.ok) throw new Error(r.code);
    expect(r.statement.invoices.map((i) => [i.number, i.note, i.taxable, i.cgst, i.value])).toEqual([
      ["CN-3", true, 20000, 1800, 23600],
      ["DN-1", false, 5000, 450, 5900],
    ]);
    const m = matchStatement(r.statement, [returned()]);
    expect(m.matched.map((x) => [x.bill.id, x.match.status])).toEqual([["n1", "matched"]]);
  });

  it("reads an amended credit note (cdnra) as a note under its current number", () => {
    const file = JSON.stringify({
      data: {
        gstin: "29HTUPS6000Q1ZI",
        rtnprd: "112026",
        docdata: {
          cdnra: [
            {
              ctin: TRAY_CO.gstin,
              trdnm: "Tray Co",
              nt: [
                {
                  ontnum: "CN-3",
                  ntnum: "CN-3A",
                  typ: "C",
                  dt: "05-11-2026",
                  val: -236,
                  itcavl: "Y",
                  rev: "N",
                  items: [{ rt: 18, txval: -200, cgst: -18, sgst: -18 }],
                },
              ],
            },
          ],
        },
      },
    });
    const r = parseGstr2b(file);
    if (!r.ok) throw new Error(r.code);
    expect(r.statement.invoices.map((i) => [i.number, i.note, i.taxable])).toEqual([["CN-3A", true, 20000]]);
  });
});

describe("a claim withdrawn by hand", () => {
  const withdrawn = doc({ number: "12", withdrawnAt: "2026-11-06T09:00:00.000Z" });

  it("is not claimed again by a save or a re-upload of the statement that shows it", () => {
    const found = matchStatement(statement("2026-11", []), [withdrawn]).matched[0];
    /* The match is still found and recorded… */
    expect(found.match.status).toBe("matched");
    /* …but neither the save's look through the statements on file
       (`claimFromMatch`) nor an upload (`claimAfterMatch`) claims it. */
    expect(claimFromMatch(found)).toBeNull();
    expect(claimAfterMatch(found)).toBeNull();
  });

  it("is claimed as before once claimed by hand, and a hand claim stands", () => {
    const byHand = {
      ...withdrawn,
      withdrawnAt: null,
      claim: { month: "2026-12", source: "manual" as const },
    };
    const found = matchStatement(statement("2026-11", []), [byHand]).matched[0];
    expect(claimAfterMatch(found)).toEqual({ month: "2026-12", source: "manual" });
    const cleared = matchStatement(statement("2026-11", []), [{ ...withdrawn, withdrawnAt: null }])
      .matched[0];
    expect(claimAfterMatch(cleared)).toEqual({ month: "2026-11", source: "gstr2b" });
  });

  it("stands as withdrawn, not waiting — nothing to chase", () => {
    expect(billStatus(withdrawn)).toBe("withdrawn");
    expect(billStatus(doc({ withdrawnAt: null }))).toBe("waiting");
    /* A row from before withdrawals were recorded has no field at all. */
    expect(billStatus(doc())).toBe("waiting");
    /* A claim made by hand afterwards is a claim. */
    expect(billStatus({ ...withdrawn, claim: { month: "2026-11", source: "manual" } })).toBe("claimed");
    expect(billStatus(returned({ withdrawnAt: "2026-11-06T09:00:00.000Z" }))).toBe("withdrawn");
  });
});

describe("a credit note in the return", () => {
  const books = (bills: PurchaseBill[], filings: GstFiling[] = []): GstBooks => ({
    sales: [],
    credits: [],
    bills,
    payments: [],
    filings,
  });
  const claimedBill = doc({ claim: { month: "2026-10", source: "gstr2b" } });
  const claimedNote = returned({ claim: { month: "2026-11", source: "gstr2b" } });

  it("comes off the credit in its claim month, as the portal nets it out of 4A(5)", () => {
    const b = books([claimedBill, claimedNote]);
    expect(periodFigures(b, ["2026-10"]).gstr3b.itc.other).toEqual({ igst: 0, cgst: 9000, sgst: 9000 });
    expect(periodFigures(b, ["2026-11"]).gstr3b.itc.other).toEqual({ igst: 0, cgst: -1800, sgst: -1800 });
    expect(periodFigures(b, ["2026-10", "2026-11"]).gstr3b.itc.other).toEqual({
      igst: 0,
      cgst: 7200,
      sgst: 7200,
    });
    /* Not before: a note no GSTR-2B shows yet takes nothing off. */
    expect(periodFigures(books([claimedBill, returned()]), ["2026-11"]).gstr3b.itc.other).toEqual(ZERO);
  });

  it("nets a month's credit down, below zero if it is all there is, and the quarter with it", () => {
    const v = quarterView(books([claimedBill, claimedNote]), "2627-Q3");
    expect(v.summaries.map((m) => sumHeads(m.credit))).toEqual([18000, -3600, 0]);
    /* The quarter's credit, after Rule 42 (with no sales, all of it). */
    expect(v.figures.gstr3b.rule42.common).toEqual(ZERO);
    expect(v.figures.gstr3b.itc.net).toEqual({ igst: 0, cgst: 7200, sgst: 7200 });
  });

  it("is a negative purchase in the month of its date", () => {
    const v = quarterView(books([claimedBill, claimedNote]), "2627-Q3");
    expect(v.summaries.map((m) => [m.bills, m.purchases, m.purchaseTax])).toEqual([
      [1, 100000, 18000],
      [0, -20000, -3600],
      [0, 0, 0],
    ]);
  });

  it("takes exempt goods sent back off table 5, in the month of its date", () => {
    const seed = (quantity: number, taxable: number) =>
      line({
        item: { kind: "seed", key: "radish" },
        quantity,
        taxable,
        rate: 0,
        cgst: 0,
        sgst: 0,
        credit: "none",
      });
    const seedBill = doc({ lines: [seed(1000, 50000)] });
    const seedNote = returned({ date: "2026-10-25", lines: [seed(200, 10000)] });
    const t5 = (bills: PurchaseBill[]) => periodFigures(books(bills), ["2026-10"]).gstr3b.exemptInward;
    expect(t5([seedBill])).toEqual({ intra: 50000, inter: 0 });
    expect(t5([seedBill, seedNote])).toEqual({ intra: 40000, inter: 0 });
  });

  it("reduces carried-in credit, and what credit cannot cover is paid", () => {
    /* Next quarter's opening holds what October left; a note claimed in
       January would take its GST from that. */
    const jan = returned({ date: "2027-01-05", claim: { month: "2027-01", source: "gstr2b" } });
    const q4 = quarterView(books([claimedBill, jan]), "2627-Q4");
    expect(q4.opening.credit).toEqual({ igst: 0, cgst: 9000, sgst: 9000 });
    expect(q4.settlement.closingCredit).toEqual({ igst: 0, cgst: 7200, sgst: 7200 });
    expect(q4.settlement.toPay).toEqual(ZERO);
    /* With no credit at all to take it from, the GST is owed back, in cash. */
    const alone = settle(periodFigures(books([jan]), ["2027-01"]).gstr3b, { credit: ZERO, cash: ZERO }, ZERO);
    expect(alone.toPay).toEqual({ igst: 0, cgst: 1800, sgst: 1800 });
    expect(alone.closingCredit).toEqual(ZERO);
    /* IGST credit pays CGST and SGST owed back before any cash. */
    const igst = settle(
      periodFigures(books([jan]), ["2027-01"]).gstr3b,
      { credit: { igst: 10000, cgst: 0, sgst: 0 }, cash: ZERO },
      ZERO,
    );
    expect(igst.toPay).toEqual(ZERO);
    expect(igst.closingCredit).toEqual({ igst: 6400, cgst: 0, sgst: 0 });
  });

  describe("and a filed GSTR-3B", () => {
    const filedQ3: GstFiling[] = [
      {
        quarter: "2627-Q3",
        gstr1: { filedOn: "2027-01-10", arn: "AA" },
        gstr3b: { filedOn: "2027-01-20", arn: "BB" },
        closing: { credit: ZERO, cash: ZERO },
        updatedAt: "",
      },
    ];

    it("locks a note taken off the credit in a filed quarter", () => {
      expect(isLockedBill(filedQ3, claimedNote)).toBe(true);
      expect(isLockedBill(filedQ3, returned())).toBe(false);
      expect(isLockedBill(filedQ3, returned({ claim: { month: "2027-01", source: "manual" } }))).toBe(false);
    });

    it("locks a note of exempt goods dated in a filed quarter, as table 5 reports it", () => {
      const seedNote = returned({
        lines: [line({ item: { kind: "seed", key: "radish" }, rate: 0, cgst: 0, sgst: 0, credit: "none" })],
      });
      expect(isLockedBill(filedQ3, seedNote)).toBe(true);
      expect(isLockedBill(filedQ3, { ...seedNote, date: "2027-01-05" })).toBe(false);
    });
  });
});
