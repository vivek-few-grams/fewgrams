import { lineId } from "@/lib/cart/cart";
import { istDateISO } from "@/lib/delivery-date";
import type { Order } from "@/lib/orders/order";
import type { Subscription } from "@/lib/subscriptions/subscription";
import { ROTATION_WEEKS } from "@/lib/subscriptions/weeks";
import { hsnQuantity } from "@/lib/tax/classes";
import { shareByWeight, type Buyer, type TaxRow } from "@/lib/tax/order-tax";
import type { GstState } from "@/lib/tax/states";

/**
 * Sales as the returns see them — SPEC §26.5. An invoice (order or
 * subscription) and a credit note, reduced to what GSTR-1 and GSTR-3B read:
 * a number, a date, who bought, where it went, and the stored tax rows.
 * Nothing is recomputed from prices.
 */

export type SaleDoc = {
  number: string;
  /** `YYYY-MM-DD`, IST — the invoice date. */
  date: string;
  source: "order" | "subscription";
  /** The order or subscription id, to link back. */
  id: string;
  buyer: Buyer | null;
  /** Null when the delivery state could not be placed — taxed as
   *  inter-state, and listed on the GST page to be corrected. */
  pos: GstState | null;
  rows: TaxRow[];
  /** Table 12's quantity per order line, in its code's unit. */
  quantities: Record<string, number>;
};

export type CreditDoc = {
  number: string;
  date: string;
  /** The invoice it is against. Its buyer, place of supply and value decide
   *  which GSTR-1 table the note goes in, whatever share it credits. */
  invoice: SaleDoc;
  /** What the note credits when it is not simply the whole invoice: a
   *  subscription refunded after a cancel (8 Nov 2026), whose rows are the
   *  invoice's scaled to the refund (`creditRows`) and stored with it.
   *  Absent: the whole invoice, as every order's refund is. Read it through
   *  `credited`, never `invoice.rows`. */
  part?: Pick<SaleDoc, "rows" | "quantities">;
};

/** The credit note as a document of its own: the invoice's number, buyer and
 *  place of supply, with the rows and quantities the note credits. */
export const credited = (c: CreditDoc): SaleDoc => (c.part ? { ...c.invoice, ...c.part } : c.invoice);

/** A paid order's invoice, or null for one from before registration. */
export function saleFromOrder(o: Order): SaleDoc | null {
  if (!o.tax || !o.invoiceNo || !o.paidAt) return null;
  return {
    number: o.invoiceNo,
    date: istDateISO(new Date(o.paidAt)),
    source: "order",
    id: o.id,
    buyer: o.buyer,
    pos: o.placeOfSupply,
    rows: o.tax,
    quantities: Object.fromEntries(o.lines.map((l) => [lineId(l), hsnQuantity(l)])),
  };
}

export function creditFromOrder(o: Order): CreditDoc | null {
  const invoice = saleFromOrder(o);
  if (!invoice || !o.creditNote) return null;
  return {
    number: o.creditNote.number,
    date: istDateISO(new Date(o.creditNote.issuedAt)),
    invoice,
  };
}

/** A paid subscription's bill of supply. Its quantity is the boxes paid
 *  for: each bundle is a box every Saturday of the term. Skips and pauses
 *  move boxes, never remove them, so the term is the count. */
export function saleFromSubscription(s: Subscription): SaleDoc | null {
  if (!s.tax || !s.invoiceNo || !s.paidAt) return null;
  const weeks = ROTATION_WEEKS.length;
  return {
    number: s.invoiceNo,
    date: istDateISO(new Date(s.paidAt)),
    source: "subscription",
    id: s.id,
    buyer: null,
    pos: s.placeOfSupply,
    rows: s.tax,
    quantities: Object.fromEntries(s.lines.map((l) => [`plan:${l.planKey}`, l.boxes * weeks])),
  };
}

/**
 * A cancelled subscription's credit note, for the refund recorded against
 * it (`recordSubscriptionRefund`), or null while it has none. It credits the
 * rows stored with the refund; each line's table 12 quantity is reduced in
 * the same proportion as its rows' value — a refund for two of four
 * Saturdays takes back two boxes per bundle — to three decimals, as the HSN
 * table is written.
 */
export function creditFromSubscription(s: Subscription): CreditDoc | null {
  const invoice = saleFromSubscription(s);
  if (!invoice || !s.refund || !s.creditNote) return null;
  const gross = (rows: TaxRow[], line: string) =>
    rows.filter((r) => r.line === line).reduce((a, r) => a + r.gross, 0);
  const rows = s.refund.rows;
  const quantities = Object.fromEntries(
    Object.entries(invoice.quantities).map(([line, qty]) => {
      const paid = gross(invoice.rows, line);
      return [line, paid > 0 ? Math.round((qty * gross(rows, line) * 1000) / paid) / 1000 : 0];
    }),
  );
  return {
    number: s.creditNote.number,
    date: istDateISO(new Date(s.creditNote.issuedAt)),
    invoice,
    part: { rows, quantities },
  };
}

/**
 * An invoice's rows scaled down to `amount` paise of it — what a credit note
 * for part of the invoice credits. Whole paise throughout:
 *
 * - each row's gross is its share of `amount` by the rows' gross, largest
 *   remainder (`shareByWeight`), so the rows add up to `amount` exactly;
 * - within a row, each tax head is scaled from the invoice's own figure and
 *   rounded, and the taxable value is what is left, so the row adds up to
 *   its gross. Equal CGST and SGST stay equal; nothing is worked out afresh
 *   from a rate, so a credit note follows its invoice even where the
 *   invoice was split before 8 Nov 2026 (`splitInclusive`).
 *
 * The whole amount gives back the invoice's rows unchanged. `amount` must be
 * a whole number of paise from 0 to the rows' total.
 */
export function creditRows(rows: TaxRow[], amount: number): TaxRow[] {
  const total = rows.reduce((a, r) => a + r.gross, 0);
  if (!Number.isInteger(amount) || amount < 0 || amount > total) {
    throw new Error(`Cannot credit ${amount} paise of rows totalling ${total}`);
  }
  const shares = shareByWeight(
    amount,
    rows.map((r) => r.gross),
  );
  return rows.map((r, i) => {
    const gross = shares[i];
    const scale = (x: number) => (r.gross > 0 ? Math.round((x * gross) / r.gross) : 0);
    const cgst = scale(r.cgst);
    const sgst = r.sgst === r.cgst ? cgst : scale(r.sgst);
    const igst = scale(r.igst);
    return { ...r, gross, taxable: gross - cgst - sgst - igst, cgst, sgst, igst };
  });
}

/**
 * One copy of each order or subscription, the one written last. The books
 * read every paid status partition separately and at once, so one that moves
 * between two of those reads (paid → picked) comes back from both — and
 * counted twice, its sale is in the return twice and `markFiled` freezes a
 * quarter's closing from it. Keeps the later `updatedAt`, in the order each
 * id was first seen.
 */
export function latestById<T extends { id: string; updatedAt: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of rows) {
    const held = byId.get(r.id);
    if (!held || r.updatedAt > held.updatedAt) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** What the customer paid on the document, in paise. */
export const docValue = (d: Pick<SaleDoc, "rows">) => d.rows.reduce((a, r) => a + r.gross, 0);
