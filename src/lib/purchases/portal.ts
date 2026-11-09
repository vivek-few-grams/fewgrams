import { invoiceKey, MATCH_TOLERANCE } from "@/lib/gst/gstr2b";
import { financialYear } from "@/lib/tax/order-tax";
import {
  billTotals,
  docOf,
  type BillClaim,
  type BillMatch,
  type PurchaseBill,
  type PurchaseDoc,
  type PurchaseLine,
} from "./bill";

/**
 * A bill as the vendor's own records know it — SPEC §26.6. Pure, so a save's
 * decisions about who issued a bill, and whether the portal still backs it,
 * are pinned by tests without a database.
 *
 * Invoice numbers are compared the way the GSTR-2B upload compares them
 * (`invoiceKey`: case, spaces and punctuation ignored), so "INV/26-27/0012"
 * and "inv 26-27 0012" are one bill here exactly as they are one invoice
 * there.
 */

const numberKey = (number: string) => invoiceKey("", number);

/** The financial year a bill date is in — vendors restart their numbering
 *  each April. */
const fyOf = (date: string) => financialYear(new Date(`${date}T00:00:00+05:30`));

type Numbered = Pick<PurchaseBill, "id" | "vendor" | "number" | "date"> & { doc?: PurchaseDoc };

/**
 * Another document already entered for the same vendor's invoice: same
 * vendor, same kind, same number, dated in the same financial year — or null.
 * Entering one bill twice adds its stock twice and, once that month's GSTR-2B
 * is on file, claims its credit twice. The same number in another year is a
 * different invoice: a vendor's series starts again on 1 April. And a bill
 * and a credit note may share a number — they are two series, and GSTR-2B
 * keeps them apart too (`matchStatement`).
 */
export function duplicateBill<B extends Numbered>(bill: Numbered, others: readonly B[]): B | null {
  const key = numberKey(bill.number);
  const fy = fyOf(bill.date);
  return (
    others.find(
      (o) =>
        o.id !== bill.id &&
        o.vendor.id === bill.vendor.id &&
        docOf(o) === docOf(bill) &&
        numberKey(o.number) === key &&
        fyOf(o.date) === fy,
    ) ?? null
  );
}

/**
 * Whether two versions of a bill name the same invoice on the portal: the
 * vendor's GSTIN and the number, as GSTR-2B matches them.
 */
export function sameInvoice(
  a: { gstin: string | null; number: string },
  b: { gstin: string | null; number: string },
): boolean {
  return invoiceKey(a.gstin ?? "", a.number) === invoiceKey(b.gstin ?? "", b.number);
}

export type Standing = {
  claim: BillClaim | null;
  match: BillMatch | null;
  /** A claim withdrawn by hand (`PurchaseBill.withdrawnAt`). */
  withdrawnAt: string | null;
};

/**
 * What of a stored bill's GSTR-2B standing an edit carries over. A match and
 * a claim from GSTR-2B describe the invoice the portal showed under the
 * stored GSTIN and number; an edit to either names a different invoice, and
 * keeping them would claim credit the portal never backed for it. So both go
 * (the save's auto-match then looks for the new one in any statement already
 * uploaded). A claim made by hand stays — it is the owner's — and a
 * reverse-charge claim is worked out afresh by the save either way.
 *
 * A withdrawal stays with the invoice it was made on: carried while the
 * GSTIN and number are unchanged, so adding the paid-on date does not bring
 * a withdrawn claim back, and dropped with the match when they change.
 *
 * A bill corrected into a credit note, or back, is another document on the
 * portal (`matchStatement` keeps invoices and notes apart), so nothing of
 * its standing carries over — not even a claim by hand, which was made for a
 * credit going the other way.
 */
export function carriedStanding(
  current:
    | (Pick<PurchaseBill, "vendor" | "number" | "claim" | "match"> & {
        doc?: PurchaseDoc;
        withdrawnAt?: string | null;
      })
    | null,
  next: { gstin: string | null; number: string; doc?: PurchaseDoc },
): Standing {
  if (!current) return { claim: null, match: null, withdrawnAt: null };
  if (docOf(current) !== docOf(next)) {
    return { claim: null, match: null, withdrawnAt: null };
  }
  if (sameInvoice({ gstin: current.vendor.gstin, number: current.number }, next)) {
    return { claim: current.claim, match: current.match, withdrawnAt: current.withdrawnAt ?? null };
  }
  return { claim: current.claim?.source === "gstr2b" ? null : current.claim, match: null, withdrawnAt: null };
}

/**
 * Whether a bill's lines agree with what the vendor reported: taxable value,
 * IGST, and CGST + SGST, each within `MATCH_TOLERANCE`. Head by head, not the
 * total tax: IGST reported where the bill has CGST + SGST is a different
 * supply (inter-state, not intra), and the credit goes to a different head in
 * the return. The same rule as `matchStatement`'s.
 */
export function agreesWithPortal(lines: PurchaseLine[], portal: BillMatch["portal"]): boolean {
  const t = billTotals(lines);
  return (
    Math.abs(t.taxable - portal.taxable) <= MATCH_TOLERANCE &&
    Math.abs(t.igst - portal.igst) <= MATCH_TOLERANCE &&
    Math.abs(t.cgst + t.sgst - (portal.cgst + portal.sgst)) <= MATCH_TOLERANCE
  );
}

/** A stored GSTR-2B match, re-judged against edited lines. */
export function rematch(match: BillMatch | null, lines: PurchaseLine[]): BillMatch | null {
  if (!match) return null;
  return { ...match, status: agreesWithPortal(lines, match.portal) ? "matched" : "mismatch" };
}
