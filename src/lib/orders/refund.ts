import { advanceOrderStatus, nextSequence, setCreditNote } from "@/lib/repo/orders";
import { creditNoteCounter, financialYear, formatCreditNoteNo } from "@/lib/tax/order-tax";
import { canMarkRefunded, type Order } from "./order";

/**
 * Record that a cancelled or failed order's money went back — the refund
 * itself is made in the gateway's dashboard (the owner, 27 Sep 2026) — and
 * issue the **credit note** that takes the sale back out of the GST returns
 * (SPEC §26.3, CGST Act s.34).
 *
 * The credit note is drawn only by the press that wins the status write, so
 * two presses at once issue one note and leave no gap in the series. It
 * reverses the whole invoice, so it carries no rows of its own. An order paid
 * before GST registration had no invoice and gets no credit note.
 *
 * False when the order had already moved and nothing was done.
 */
export async function markOrderRefunded(order: Order, now: Date = new Date()): Promise<boolean> {
  if (!canMarkRefunded(order.status)) return false;
  if (!(await advanceOrderStatus(order, order.status, "refunded"))) return false;
  await issueCreditNote(order, now);
  return true;
}

/** A refunded order owes a credit note when it had an invoice and has none —
 *  the status write landed and the note did not (31 Oct 2026: it could not
 *  be redone, since a refunded order cannot be marked refunded again). */
export function owesCreditNote(order: Pick<Order, "status" | "tax" | "invoiceNo" | "creditNote">): boolean {
  return order.status === "refunded" && Boolean(order.tax && order.invoiceNo) && !order.creditNote;
}

/** Draw and set the credit note, once. Called by the refund itself and, for
 *  an order left owing one, from its admin page. */
export async function issueCreditNote(order: Order, now: Date = new Date()): Promise<void> {
  if (!order.tax || !order.invoiceNo || order.creditNote) return;
  const fy = financialYear(now);
  await setCreditNote(order.id, {
    number: formatCreditNoteNo(fy, await nextSequence(creditNoteCounter(fy))),
    issuedAt: now.toISOString(),
  });
}
