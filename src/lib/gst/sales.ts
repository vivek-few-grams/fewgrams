import { lineId } from "@/lib/cart/cart";
import { istDateISO } from "@/lib/delivery-date";
import type { Order } from "@/lib/orders/order";
import type { Subscription } from "@/lib/subscriptions/subscription";
import { ROTATION_WEEKS } from "@/lib/subscriptions/weeks";
import { hsnQuantity } from "@/lib/tax/classes";
import type { Buyer, TaxRow } from "@/lib/tax/order-tax";
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
  /** The invoice it reverses — in full, as every refund is today. */
  invoice: SaleDoc;
};

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

/** What the customer paid on the document, in paise. */
export const docValue = (d: Pick<SaleDoc, "rows">) => d.rows.reduce((a, r) => a + r.gross, 0);
