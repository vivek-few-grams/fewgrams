import { creditRows, docValue } from "@/lib/gst/sales";
import { monthOf } from "@/lib/gst/period";
import { isSalesLockedMonth, type GstFiling } from "@/lib/gst/quarter";
import { nextSequence } from "@/lib/repo/orders";
import {
  claimSubscriptionRefund,
  retakeSubscriptionCreditNote,
  setSubscriptionCreditNote,
} from "@/lib/repo/subscriptions";
import { creditNoteCounter, financialYear, formatCreditNoteNo } from "@/lib/tax/order-tax";
import { ROTATION_WEEKS } from "./weeks";
import type { Subscription } from "./subscription";

/**
 * A cancelled subscription's refund and its credit note — 8 Nov 2026, SPEC
 * §26.3. The refund itself is made in the gateway's dashboard, as an order's
 * is; this records how much went back and issues the **credit note** that
 * takes it out of the GST returns (CGST Act s.34). Until then a cancelled
 * subscription stayed in exempt turnover at its full price, which overstated
 * GSTR-1 table 8, the HSN summary and 3.1(c), and with them the exempt share
 * of shared credit Rule 42 reverses.
 *
 * The note credits the refunded amount, not the whole bill: the boxes
 * already delivered stay sold. Its rows are the bill's rows scaled to the
 * amount (`creditRows`), worked out once and stored with the refund. It is
 * numbered from the same yearly `CN/` series as orders' credit notes, in the
 * financial year it is issued.
 *
 * **The number is drawn only by the press whose record landed.** Recording
 * the refund is a conditional write that also takes a lease on the draw
 * (`claimSubscriptionRefund`); only its winner draws, so a double press or a
 * second tab cannot burn a number (the order path drew first and lost the
 * write after — 8 Nov 2026). A run that dies between the record and the draw
 * leaves the refund owing its note; the admin page finishes it once the
 * lease is stale (`finishSubscriptionCreditNote`), under the same rule.
 */

/** A draw is a counter increment and one write: well past this, it died. */
export const CREDIT_NOTE_LEASE_MS = 2 * 60 * 1000;

/** What was paid for the term, in paise — the bill's rows, as invoiced. */
export const paidPaise = (sub: Pick<Subscription, "tax">): number =>
  sub.tax ? docValue({ rows: sub.tax }) : 0;

/** A refund can be recorded: cancelled, billed after registration, and
 *  nothing recorded yet. */
export function canRecordRefund(
  sub: Pick<Subscription, "status" | "tax" | "invoiceNo" | "paidAt" | "refund" | "creditNote">,
): boolean {
  return (
    sub.status === "cancelled" &&
    Boolean(sub.tax && sub.invoiceNo && sub.paidAt) &&
    paidPaise(sub) > 0 &&
    !sub.refund &&
    !sub.creditNote
  );
}

/** The refund is recorded and its credit note never landed. */
export function owesSubscriptionCreditNote(sub: Pick<Subscription, "refund" | "creditNote">): boolean {
  return Boolean(sub.refund) && !sub.creditNote;
}

/**
 * What the boxes not delivered come to, in paise — a suggestion for the
 * refund, never applied by itself. Every bundle is a box on each Saturday of
 * the term; a cancel leaves on the calendar only the Saturdays delivered
 * (`cancelDeliveries`), so the rest of the term is what was not.
 */
export function undeliveredValue(sub: Pick<Subscription, "tax" | "deliveries">): number {
  const weeks = ROTATION_WEEKS.length;
  const left = Math.max(0, Math.min(weeks, weeks - sub.deliveries.length));
  return Math.round((paidPaise(sub) * left) / weeks);
}

export type RefundOutcome =
  /** Recorded, and its credit note issued. */
  | "issued"
  /** Another press recorded it first, or finished the draw: nothing done. */
  | "taken"
  /** Another press holds a fresh lease on the draw. */
  | "running"
  /** The month the note would be issued in is in a filed return. */
  | "locked"
  /** Not cancelled, not billed, or already recorded. */
  | "refused"
  /** The amount is not more than 0 and at most what was paid. */
  | "badAmount";

/**
 * Record `amount` paise refunded in the gateway for a cancelled subscription,
 * and issue its credit note dated `now`. Refused while the month the note
 * would be issued in sits in a quarter whose GSTR-1 or GSTR-3B is filed
 * (`isSalesLockedMonth`): a note there would change a return already filed.
 */
export async function recordSubscriptionRefund(
  sub: Subscription,
  amount: number,
  filings: GstFiling[],
  now: Date = new Date(),
): Promise<RefundOutcome> {
  if (!canRecordRefund(sub)) return "refused";
  if (!Number.isInteger(amount) || amount <= 0 || amount > paidPaise(sub)) return "badAmount";
  if (isSalesLockedMonth(filings, monthOf(now))) return "locked";
  const recordedAt = now.toISOString();
  const won = await claimSubscriptionRefund(sub, { amount, rows: creditRows(sub.tax!, amount), recordedAt });
  if (!won) return "taken";
  return (await drawCreditNote(sub.id, recordedAt, now)) ? "issued" : "taken";
}

/**
 * Issue the credit note a recorded refund still owes — the run that recorded
 * it died before the draw. Only once its lease is stale, and only by the
 * press that takes the lease over.
 */
export async function finishSubscriptionCreditNote(
  sub: Subscription,
  filings: GstFiling[],
  now: Date = new Date(),
): Promise<RefundOutcome> {
  if (!owesSubscriptionCreditNote(sub)) return "refused";
  if (isSalesLockedMonth(filings, monthOf(now))) return "locked";
  const claimed = sub.creditNoteClaimedAt ? Date.parse(sub.creditNoteClaimedAt) : 0;
  if (now.getTime() - claimed < CREDIT_NOTE_LEASE_MS) return "running";
  const lease = now.toISOString();
  if (!(await retakeSubscriptionCreditNote(sub, lease))) return "taken";
  return (await drawCreditNote(sub.id, lease, now)) ? "issued" : "taken";
}

/** Draw the next `CN/` number for the financial year of `now` and set it,
 *  as the holder of the lease `claimedAt`. */
async function drawCreditNote(id: string, claimedAt: string, now: Date): Promise<boolean> {
  const fy = financialYear(now);
  const number = formatCreditNoteNo(fy, await nextSequence(creditNoteCounter(fy)));
  return setSubscriptionCreditNote(id, { number, issuedAt: now.toISOString() }, claimedAt);
}
