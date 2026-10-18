import { lineId, type CartKind } from "@/lib/cart/cart";
import { istDateISO } from "@/lib/delivery-date";
import { SUBSCRIPTION_TAX_CLASS, taxClassFor } from "./classes";
import { HOME_STATE, type GstState } from "./states";

/**
 * The tax inside an order's price — SPEC §26.2. Pure; `startCheckout` runs
 * it once and the order keeps the rows, so a later rate change cannot
 * rewrite an invoice already issued.
 *
 * **Every amount is in paise.** Prices are whole rupees and tax is backed out
 * of them (₹100 at 18% is ₹84.75 + ₹15.25), so rupees would mean fractions,
 * and fractions mean rows that no longer add up to what was paid. Each row's
 * taxable value plus its tax is exactly its gross, and the gross of all rows
 * is exactly the order total.
 */

export type TaxRow = {
  /** A line, or that line's share of its parcel's delivery charge. */
  source: "line" | "delivery";
  /** `kind:key` — the order line it belongs to. */
  line: string;
  hsn: string;
  /** Percent; 0 for an exempt supply. */
  rate: number;
  /** What the customer paid for it, tax included. */
  gross: number;
  taxable: number;
  /** CGST and SGST for a Karnataka delivery, IGST for any other. */
  cgst: number;
  sgst: number;
  igst: number;
};

export type TaxedLine = { kind: CartKind; key: string; lineTotal: number };
export type TaxedShipment = { lines: string[]; charge: number };

/** A business buyer's details, for the invoice and GSTR-1's B2B table. */
export type Buyer = { gstin: string; name: string };

/** Rupees to paise. */
export const paise = (rupees: number) => Math.round(rupees * 100);

/**
 * Split a tax-inclusive amount. The taxable value is rounded to the paisa
 * and the tax is whatever is left, so the two always add back to `gross`;
 * CGST and SGST take half each, the odd paisa going to CGST.
 */
export function splitInclusive(
  gross: number,
  rate: number,
  intraState: boolean,
): Pick<TaxRow, "taxable" | "cgst" | "sgst" | "igst"> {
  const taxable = Math.round((gross * 100) / (100 + rate));
  const tax = gross - taxable;
  if (!intraState) return { taxable, cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.ceil(tax / 2);
  return { taxable, cgst, sgst: tax - cgst, igst: 0 };
}

/**
 * Share `amount` paise across `weights` in proportion, as whole paise that
 * add up to exactly `amount` — largest remainder, ties to the earlier
 * weight. All-zero weights share evenly.
 */
export function shareByWeight(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const total = weights.reduce((a, b) => a + b, 0);
  const w = total > 0 ? weights : weights.map(() => 1);
  const sum = total > 0 ? total : weights.length;
  const exact = w.map((x) => (amount * x) / sum);
  const out = exact.map(Math.floor);
  let left = amount - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * The rows for one order. `placeOfSupply` null — a state we could not
 * place — is taxed as inter-state, which is what every non-Karnataka PIN is.
 *
 * A parcel's delivery charge follows the goods in it (composite supply,
 * CGST Act s.8(a)): it is shared across that parcel's lines by value and
 * taxed at each line's rate. The own run carries only greens, so its fee is
 * exempt; a courier parcel of trays carries 18%.
 */
export function orderTax(
  lines: TaxedLine[],
  shipments: TaxedShipment[],
  placeOfSupply: GstState | null,
): TaxRow[] {
  const intra = placeOfSupply?.code === HOME_STATE.code;
  const row = (source: TaxRow["source"], l: TaxedLine, gross: number): TaxRow => {
    const cls = taxClassFor(l.kind, l.key);
    return {
      source,
      line: lineId(l),
      hsn: cls.hsn,
      rate: cls.rate,
      gross,
      ...splitInclusive(gross, cls.rate, intra),
    };
  };

  const rows = lines.map((l) => row("line", l, paise(l.lineTotal)));
  for (const x of shipments) {
    const inParcel = lines.filter((l) => x.lines.includes(lineId(l)));
    const shares = shareByWeight(
      paise(x.charge),
      inParcel.map((l) => paise(l.lineTotal)),
    );
    inParcel.forEach((l, i) => {
      if (shares[i] > 0) rows.push(row("delivery", l, shares[i]));
    });
  }
  return rows;
}

/**
 * The rows for a subscription — SPEC §26.2. Every plan is a box of fresh
 * greens, so every row is exempt; they are kept all the same, because
 * GSTR-1 reports exempt supplies (table 8) and the HSN summary counts them.
 * Delivery is inside the plan's price, so there is no delivery row.
 */
export function subscriptionTax(
  lines: Array<{ planKey: string; lineTotal: number }>,
  placeOfSupply: GstState | null,
): TaxRow[] {
  const intra = placeOfSupply?.code === HOME_STATE.code;
  const { hsn, rate } = SUBSCRIPTION_TAX_CLASS;
  return lines.map((l) => {
    const gross = paise(l.lineTotal);
    return {
      source: "line",
      line: `plan:${l.planKey}`,
      hsn,
      rate,
      gross,
      ...splitInclusive(gross, rate, intra),
    };
  });
}

export type TaxTotals = { gross: number; taxable: number; cgst: number; sgst: number; igst: number };

export function taxTotals(rows: TaxRow[]): TaxTotals {
  const t: TaxTotals = { gross: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  for (const r of rows) {
    t.gross += r.gross;
    t.taxable += r.taxable;
    t.cgst += r.cgst;
    t.sgst += r.sgst;
    t.igst += r.igst;
  }
  return t;
}

/** The rows grouped by rate, highest first — the invoice's tax summary. */
export function totalsByRate(rows: TaxRow[]): Array<TaxTotals & { rate: number }> {
  const byRate = new Map<number, TaxRow[]>();
  for (const r of rows) byRate.set(r.rate, [...(byRate.get(r.rate) ?? []), r]);
  return [...byRate.entries()].sort(([a], [b]) => b - a).map(([rate, rs]) => ({ rate, ...taxTotals(rs) }));
}

/**
 * The financial year a moment falls in, as GST writes it: `2627` for
 * 1 Apr 2026 – 31 Mar 2027, by the IST date.
 */
export function financialYear(at: Date): string {
  const [y, m] = istDateISO(at).split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The counter an invoice series is drawn from — one per financial year. */
export const invoiceCounter = (fy: string) => `invoice-${fy}`;

/** `FG/2627/00001` — 13 characters, inside Rule 46's 16, unique within the
 *  financial year. */
export function formatInvoiceNo(fy: string, n: number): string {
  return `FG/${fy}/${String(n).padStart(5, "0")}`;
}

/** The credit-note series, one per financial year like invoices. */
export const creditNoteCounter = (fy: string) => `credit-note-${fy}`;

/** `CN/2627/00001` — its own series, so an invoice number is never reused
 *  for a refund (Rule 53). */
export function formatCreditNoteNo(fy: string, n: number): string {
  return `CN/${fy}/${String(n).padStart(5, "0")}`;
}
