import {
  claimable,
  isCreditNote,
  isIntraPurchase,
  signedBy,
  signedTotals,
  type PurchaseBill,
} from "@/lib/purchases/bill";
import type { TaxRow } from "@/lib/tax/order-tax";
import { buildGstr1, type Gstr1 } from "./gstr1";
import { buildGstr3b, settle, type ExemptInward, type Gstr3b, type ItcLine, type Settlement } from "./gstr3b";
import { ZERO, addHeads, sumHeads, type Heads } from "./ledger";
import {
  GST_FROM_DATE,
  monthOfDate,
  monthsOf,
  quarterOf,
  quartersSince,
  type MonthId,
  type QuarterId,
} from "./period";
import { credited, docValue, type CreditDoc, type SaleDoc } from "./sales";

/**
 * One quarter's GST, worked out from the books — SPEC §26.5. Pure: the
 * repositories load everything, this decides what belongs where.
 *
 * - A sale belongs to the month of its invoice date, a credit note to the
 *   month it was issued.
 * - Credit belongs to the month of the GSTR-2B it appeared in (`claim`),
 *   not to the bill date: a bill the vendor reports late is claimed late.
 * - Each quarter opens with what the last one left in the ledgers — credit
 *   not used, cash not spent. A filed quarter's figures are the ones it was
 *   filed with (`GstFiling.closing`); an unfiled one is worked out.
 */

export type GstPayment = {
  id: string;
  /** The month the deposit is for: PMT-06 for months 1 and 2, the
   *  quarter's balance against month 3. */
  month: MonthId;
  /** `YYYY-MM-DD`. */
  paidOn: string;
  /** The challan's CPIN or CIN. */
  reference: string;
  heads: Heads;
  createdAt: string;
};

export type FiledReturn = { filedOn: string; arn: string };

export type GstFiling = {
  quarter: QuarterId;
  gstr1: FiledReturn | null;
  gstr3b: FiledReturn | null;
  /** The ledgers as GSTR-3B left them, frozen when it was marked filed —
   *  and the Negative Liability Statement's balance, absent on quarters
   *  filed before 8 Nov 2026 and read as zero. */
  closing: { credit: Heads; cash: Heads; negative?: Heads } | null;
  updatedAt: string;
};

export type GstBooks = {
  sales: SaleDoc[];
  credits: CreditDoc[];
  bills: PurchaseBill[];
  payments: GstPayment[];
  filings: GstFiling[];
};

const inMonths = (months: readonly MonthId[], date: string) => months.includes(monthOfDate(date));

/** The claimed credit, line by line, in its claim month. A vendor's credit
 *  note claimed there is negative (`signedBy`): the portal shows a month's
 *  GSTR-2B net of the credit notes in it, in 4A. */
function itcLines(bills: PurchaseBill[], months: readonly MonthId[]): ItcLine[] {
  return bills
    .filter((b) => b.claim && months.includes(b.claim.month) && claimable(b))
    .flatMap((b) =>
      b.lines
        .filter((l) => l.igst + l.cgst + l.sgst > 0)
        .map((l) => ({
          taxable: signedBy(b, l.taxable),
          heads: { igst: signedBy(b, l.igst), cgst: signedBy(b, l.cgst), sgst: signedBy(b, l.sgst) },
          credit: l.credit,
          reverseCharge: b.reverseCharge,
          imported: b.vendor.kind === "foreign",
        })),
    );
}

/**
 * The lines of a bill that GSTR-3B table 5 reports — exempt purchases from a
 * registered vendor, dated on or after registration (`GST_FROM_DATE`, the
 * cut `claimable` makes for credit: a bill from before it is in no return) —
 * which it groups by the **bill date**, not by a claim. The one figure in a
 * return a bill reaches through its date, so the one `isLockedBill` has to
 * check the date for; both read this, so they cannot disagree.
 */
const exemptLines = (b: Pick<PurchaseBill, "vendor" | "lines" | "date">) =>
  b.vendor.kind === "registered" && b.date >= GST_FROM_DATE ? b.lines.filter((l) => l.rate === 0) : [];

/* Net of vendors' credit notes: exempt goods sent back come off the month of
   the note's date. */
function exemptInward(bills: PurchaseBill[], months: readonly MonthId[]): ExemptInward[] {
  return bills
    .filter((b) => inMonths(months, b.date))
    .flatMap((b) =>
      exemptLines(b).map((l) => ({ value: signedBy(b, l.taxable), intra: isIntraPurchase(b.vendor) })),
    );
}

export type PeriodFigures = {
  sales: SaleDoc[];
  credits: CreditDoc[];
  gstr1: Gstr1;
  gstr3b: Gstr3b;
};

export function periodFigures(books: GstBooks, months: readonly MonthId[]): PeriodFigures {
  const sales = books.sales.filter((d) => inMonths(months, d.date));
  const credits = books.credits.filter((c) => inMonths(months, c.date));
  return {
    sales,
    credits,
    gstr1: buildGstr1(sales, credits),
    gstr3b: buildGstr3b(sales, credits, itcLines(books.bills, months), exemptInward(books.bills, months)),
  };
}

const deposits = (books: GstBooks, months: readonly MonthId[]): Heads =>
  addHeads(ZERO, ...books.payments.filter((p) => months.includes(p.month)).map((p) => p.heads));

/** The ledgers at the start of a quarter, and the negative liability
 *  brought in (`setOff`). */
export type Opening = { credit: Heads; cash: Heads; negative: Heads };

/** The ledgers at the start of `quarter`. */
export function openingFor(books: GstBooks, quarter: QuarterId): Opening {
  let opening: Opening = { credit: ZERO, cash: ZERO, negative: ZERO };
  for (const q of quartersSince(monthsOf(quarter)[0] + "-01")) {
    if (q === quarter) break;
    const filed = books.filings.find((f) => f.quarter === q)?.closing;
    if (filed) {
      opening = { credit: filed.credit, cash: filed.cash, negative: filed.negative ?? ZERO };
      continue;
    }
    const months = monthsOf(q);
    const s = settle(periodFigures(books, months).gstr3b, opening, deposits(books, months));
    /* Worked out as if the balance had been paid: what was owed and not
       deposited is still owed, not carried as a negative. */
    opening = { credit: s.closingCredit, cash: s.closingCash, negative: s.negative.closing };
  }
  return opening;
}

export type MonthPayment = {
  month: MonthId;
  /** The quarter so far, months 1..this one together, as self-assessment
   *  works it out (CBIC Circular 143/13/2020). */
  figures: PeriodFigures;
  settlement: Settlement;
  /** Deposited for this month already. */
  paid: Heads;
};

export type MonthSummary = {
  month: MonthId;
  invoices: number;
  creditNotes: number;
  /** What customers paid, net of credit notes. */
  sales: number;
  /** By what was sold: a cart kind, `plan`, or `delivery`. */
  byCategory: Record<string, number>;
  taxable: number;
  exempt: number;
  tax: Heads;
  /** Bills dated in the month — not vendors' credit notes. */
  bills: number;
  /** Purchases dated in the month, before tax, and their GST — net of
   *  vendors' credit notes dated in it. */
  purchases: number;
  purchaseTax: number;
  /** Credit claimed in the month (its GSTR-2B). */
  credit: Heads;
};

export type QuarterView = {
  quarter: QuarterId;
  months: [MonthId, MonthId, MonthId];
  opening: Opening;
  figures: PeriodFigures;
  settlement: Settlement;
  monthly: [MonthPayment, MonthPayment];
  summaries: MonthSummary[];
  filing: GstFiling | null;
  /** GSTR-3B is marked filed: the quarter's bills, claims and payments can
   *  no longer change. */
  locked: boolean;
};

export function categoryOf(r: TaxRow): string {
  return r.source === "delivery" ? "delivery" : r.line.split(":")[0];
}

function summarise(books: GstBooks, month: MonthId): MonthSummary {
  const f = periodFigures(books, [month]);
  const byCategory: Record<string, number> = {};
  const count = (rows: TaxRow[], sign: 1 | -1) => {
    for (const r of rows) byCategory[categoryOf(r)] = (byCategory[categoryOf(r)] ?? 0) + sign * r.gross;
  };
  for (const d of f.sales) count(d.rows, 1);
  for (const c of f.credits) count(credited(c).rows, -1);
  const bills = books.bills.filter((b) => monthOfDate(b.date) === month);
  const claimed = itcLines(books.bills, [month]);
  return {
    month,
    invoices: f.sales.length,
    creditNotes: f.credits.length,
    sales:
      f.sales.reduce((a, d) => a + docValue(d), 0) - f.credits.reduce((a, c) => a + docValue(credited(c)), 0),
    byCategory,
    taxable: f.gstr3b.outward.taxable,
    exempt: f.gstr3b.exempt,
    tax: { igst: f.gstr3b.outward.igst, cgst: f.gstr3b.outward.cgst, sgst: f.gstr3b.outward.sgst },
    /* Bills only; a vendor's credit note is in the figures below, net. */
    bills: bills.filter((b) => !isCreditNote(b)).length,
    purchases: bills.reduce((a, b) => a + signedTotals(b).taxable, 0),
    purchaseTax: bills.reduce((a, b) => a + sumHeads(signedTotals(b)), 0),
    credit: addHeads(ZERO, ...claimed.map((l) => l.heads)),
  };
}

/**
 * The categories, of `categories` and in its order, that any month has a
 * figure for. Not the quarter's total: a tray sold in October and refunded
 * in November nets to nothing, but each month still has a figure, and
 * without its row the months' columns stop adding up to their sales.
 */
export function categoriesWithSales<C extends string>(
  summaries: Pick<MonthSummary, "byCategory">[],
  categories: readonly C[],
): C[] {
  return categories.filter((c) => summaries.some((m) => (m.byCategory[c] ?? 0) !== 0));
}

export function quarterView(books: GstBooks, quarter: QuarterId): QuarterView {
  const months = monthsOf(quarter);
  const opening = openingFor(books, quarter);
  const figures = periodFigures(books, months);
  const settlement = settle(figures.gstr3b, opening, deposits(books, months));

  const monthly = ([1, 2] as const).map((k): MonthPayment => {
    const upTo = months.slice(0, k);
    const f = periodFigures(books, upTo);
    /* Earlier months' deposits count against this month's figure; this
       month's own deposits are shown as paid, not subtracted twice. */
    const before = deposits(books, upTo.slice(0, -1));
    return {
      month: months[k - 1],
      figures: f,
      settlement: settle(f.gstr3b, opening, before),
      paid: deposits(books, [months[k - 1]]),
    };
  }) as [MonthPayment, MonthPayment];

  const filing = books.filings.find((x) => x.quarter === quarter) ?? null;
  return {
    quarter,
    months,
    opening,
    figures,
    settlement,
    monthly,
    summaries: months.map((m) => summarise(books, m)),
    filing,
    locked: !!filing?.gstr3b,
  };
}

/** True when `month` sits in a quarter whose GSTR-3B is marked filed. */
export function isLockedMonth(filings: GstFiling[], month: MonthId): boolean {
  return !!filings.find((f) => f.quarter === quarterOf(month))?.gstr3b;
}

/**
 * True when a bill is in a filed GSTR-3B and so can no longer change: its
 * credit is claimed in a filed quarter, or it has a line table 5 reports by
 * bill date (`exemptLines` — a 0% line from a registered vendor) and that
 * date is in one. A seed bill is never claimed, so the claim alone left it
 * free to be added, edited or deleted under a filed return.
 *
 * Check a bill as it was **and** as it would be saved: moving one into a
 * filed quarter changes that return as surely as moving one out.
 */
export function isLockedBill(
  filings: GstFiling[],
  bill: Pick<PurchaseBill, "claim" | "date" | "vendor" | "lines">,
): boolean {
  if (bill.claim && isLockedMonth(filings, bill.claim.month)) return true;
  return exemptLines(bill).length > 0 && isLockedMonth(filings, monthOfDate(bill.date));
}

/**
 * True when a sale in `month` is already reported: its quarter's GSTR-1
 * (every invoice, by place of supply) or GSTR-3B (table 3.2, inter-state
 * supplies by state) is marked filed. What a sale's reporting — its place of
 * supply — must not change after.
 */
export function isSalesLockedMonth(filings: GstFiling[], month: MonthId): boolean {
  return !!filings.find((f) => f.quarter === quarterOf(month))?.gstr1 || isLockedMonth(filings, month);
}
