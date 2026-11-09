import { fromIstDateISO } from "@/lib/delivery-date";
import type { BillClaim, BillMatch, PurchaseBill } from "@/lib/purchases/bill";
import { billTotals, isCreditNote } from "@/lib/purchases/bill";
import { isIsoDate } from "@/lib/purchases/dates";
import { financialYear } from "@/lib/tax/order-tax";
import { monthFromReturnPeriod, type MonthId } from "./period";

/**
 * GSTR-2B — SPEC §26.5. The portal's statement of the credit our vendors
 * have reported against our GSTIN, downloaded as JSON from Returns →
 * GSTR-2B and uploaded on `/admin/gst`. Only a bill in it may be claimed
 * (CGST Act s.16(2)(aa)), so matching the purchase register against it is
 * what turns "a bill we hold" into "credit we can claim this month".
 *
 * The file's shape is read defensively: the portal has moved fields between
 * versions, and a field it drops should cost one invoice, never the upload.
 * Amounts in the file are rupees; everything here is paise.
 */

export type PortalInvoice = {
  gstin: string;
  name: string;
  number: string;
  /** `YYYY-MM-DD`. */
  date: string;
  value: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  /** "N" in the file: the portal says this credit is not available. */
  itcAvailable: boolean;
  reverseCharge: boolean;
  /** A vendor's credit note: it reduces our credit, and is matched to a
   *  credit note in the register, never to a bill. Its amounts are kept
   *  positive, as the note prints them and as the register types them. */
  note: boolean;
};

export type Gstr2b = { month: MonthId; gstin: string; invoices: PortalInvoice[] };

const paise = (x: unknown) => Math.round(Number(x ?? 0) * 100) || 0;
const str = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");

/** `dd-mm-yyyy` → `YYYY-MM-DD`. */
function isoDate(dmy: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : dmy;
}

type Item = { txval?: unknown; igst?: unknown; cgst?: unknown; sgst?: unknown };

function sumItems(items: unknown) {
  const list = Array.isArray(items) ? (items as Item[]) : [];
  return list.reduce<{ taxable: number; igst: number; cgst: number; sgst: number }>(
    (a, i) => ({
      taxable: a.taxable + paise(i.txval),
      igst: a.igst + paise(i.igst),
      cgst: a.cgst + paise(i.cgst),
      sgst: a.sgst + paise(i.sgst),
    }),
    { taxable: 0, igst: 0, cgst: 0, sgst: 0 },
  );
}

/** Parse the downloaded file, or explain why it is not one. */
export function parseGstr2b(raw: string): { ok: true; statement: Gstr2b } | { ok: false; code: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "notJson" };
  }
  const root = (json as { data?: unknown })?.data ?? json;
  const r = root as { rtnprd?: unknown; gstin?: unknown; docdata?: Record<string, unknown> };
  const month = monthFromReturnPeriod(str(r.rtnprd));
  if (!month || !r.docdata) return { ok: false, code: "notGstr2b" };

  const invoices: PortalInvoice[] = [];
  const read = (section: unknown, docsKey: "inv" | "nt", notes: boolean) => {
    if (!Array.isArray(section)) return;
    for (const supplier of section as Record<string, unknown>[]) {
      const gstin = str(supplier.ctin).toUpperCase();
      const name = str(supplier.trdnm);
      const docs = supplier[docsKey];
      if (!Array.isArray(docs)) continue;
      for (const d of docs as Record<string, unknown>[]) {
        const sums = sumItems(d.items);
        /* The notes section holds debit notes as well ("D"): a debit note
           adds to the credit as an invoice does, and is entered as a bill.
           Anything else there is a credit note. Its amounts are read as
           magnitudes, whichever sign a version of the file gives them. */
        const debit = notes && str(d.typ ?? d.ntty).toUpperCase() === "D";
        const abs = (n: number) => (notes ? Math.abs(n) : n);
        invoices.push({
          gstin,
          name,
          number: str(d.inum ?? d.ntnum),
          date: isoDate(str(d.dt)),
          value: abs(paise(d.val)),
          taxable: abs(sums.taxable),
          igst: abs(sums.igst),
          cgst: abs(sums.cgst),
          sgst: abs(sums.sgst),
          itcAvailable: str(d.itcavl).toUpperCase() !== "N",
          reverseCharge: str(d.rev).toUpperCase() === "Y",
          note: notes && !debit,
        });
      }
    }
  };
  read(r.docdata.b2b, "inv", false);
  read(r.docdata.b2ba, "inv", false);
  read(r.docdata.cdnr, "nt", true);
  /* Amended notes, as `b2ba` is read for amended invoices: the corrected
     note under its current number, which is how it is entered (8 Nov 2026). */
  read(r.docdata.cdnra, "nt", true);
  return { ok: true, statement: { month, gstin: str(r.gstin).toUpperCase(), invoices } };
}

/** Invoice numbers are compared ignoring case, spaces and punctuation:
 *  "INV/23-24/0012" on the bill and "INV/23-24/0012 " on the portal are one
 *  invoice. */
export const invoiceKey = (gstin: string, number: string) =>
  `${gstin.toUpperCase()}|${number.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

/** Rounding differences between a bill and the vendor's return. */
export const MATCH_TOLERANCE = 100;

/**
 * The financial year a `YYYY-MM-DD` date falls in (`2627`), or null for one
 * that is not a date — a portal field read defensively can come back empty.
 */
const yearOf = (date: string): string | null =>
  isIsoDate(date) ? financialYear(fromIstDateISO(date)) : null;

/** Invoices answer only to bills, and credit notes only to credit notes: a
 *  vendor numbers the two in separate series, so "12" may be both. */
const docKey = (note: boolean) => (note ? "note" : "invoice");

export type MatchResult = {
  /** Bills — and credit notes — found in the statement, with how they compare. */
  matched: { bill: PurchaseBill; match: BillMatch; invoice: PortalInvoice }[];
  /** Portal invoices with no bill in the register — including every one in
   *  `ambiguous`, so `matched` and `unknown` still account for each invoice
   *  in the statement once. */
  unknown: PortalInvoice[];
  /** Portal invoices that more than one bill answers to — same GSTIN, same
   *  kind, same number, same financial year. Neither bill is matched:
   *  guessing could withdraw the right bill's claim or claim one invoice
   *  twice. */
  ambiguous: { invoice: PortalInvoice; bills: PurchaseBill[] }[];
};

/**
 * Match a statement against the register. A bill is the portal invoice with
 * its vendor's GSTIN and number **in the same financial year**: a vendor's
 * series restarts each April, so "12" from November and "12" from May are
 * two invoices. A vendor's credit note on the portal is matched the same way
 * to a credit note in the register (8 Nov 2026), and only to one — and a bill
 * only to an invoice.
 *
 * It is `matched` when its taxable value, its IGST and its CGST + SGST each
 * agree within a rupee, `mismatch` otherwise — the vendor reported it, but
 * not as billed. Heads are compared, not the total: IGST reported against a
 * bill charged CGST + SGST is a different credit, in a different ledger. A
 * credit note is compared the same way, amount for amount: both sides hold
 * it positive, and its sign is applied where documents are summed.
 */
export function matchStatement(statement: Gstr2b, bills: PurchaseBill[]): MatchResult {
  const byKey = new Map<string, PurchaseBill[]>();
  for (const b of bills) {
    const year = yearOf(b.date);
    if (!b.vendor.gstin || !year) continue;
    const k = `${invoiceKey(b.vendor.gstin, b.number)}|${year}|${docKey(isCreditNote(b))}`;
    byKey.set(k, [...(byKey.get(k) ?? []), b]);
  }

  const matched: MatchResult["matched"] = [];
  const unknown: PortalInvoice[] = [];
  const ambiguous: MatchResult["ambiguous"] = [];
  for (const inv of statement.invoices) {
    const year = yearOf(inv.date);
    const found = !year
      ? []
      : (byKey.get(`${invoiceKey(inv.gstin, inv.number)}|${year}|${docKey(inv.note)}`) ?? []);
    if (found.length !== 1) {
      unknown.push(inv);
      if (found.length > 1) ambiguous.push({ invoice: inv, bills: found });
      continue;
    }
    const bill = found[0];
    const t = billTotals(bill.lines);
    const ok =
      Math.abs(t.taxable - inv.taxable) <= MATCH_TOLERANCE &&
      Math.abs(t.igst - inv.igst) <= MATCH_TOLERANCE &&
      Math.abs(t.cgst + t.sgst - (inv.cgst + inv.sgst)) <= MATCH_TOLERANCE;
    matched.push({
      bill,
      invoice: inv,
      match: {
        month: statement.month,
        status: ok ? "matched" : "mismatch",
        portal: { taxable: inv.taxable, igst: inv.igst, cgst: inv.cgst, sgst: inv.sgst },
      },
    });
  }
  return { matched, unknown, ambiguous };
}

/**
 * The claim a bill keeps once a statement has judged it. A claim made by
 * hand, or for reverse charge, is the owner's or the law's and stays. One
 * the statement gave holds only while the amounts agree: a bill the vendor
 * reported differently is not claimed for more than the portal shows — it
 * waits under "Reported differently" until they agree or it is claimed by
 * hand (found 18 Oct 2026: an edited bill kept its claim at ₹288 against
 * the portal's ₹270). One whose claim was withdrawn by hand stays withdrawn
 * however often the statement is uploaded (`claimFromMatch`).
 */
export function claimAfterMatch(found: MatchResult["matched"][number]): BillClaim | null {
  const held = found.bill.claim;
  if (held && held.source !== "gstr2b") return held;
  if (found.match.status === "mismatch") return null;
  return held ?? claimFromMatch(found);
}

/**
 * The claim a statement gives a bill it found: the statement's month, when
 * the amounts agree, the portal shows the credit as available and the bill
 * is not reverse charge (that claims itself). Null otherwise — claimed by
 * hand once the vendor amends. Shared by the upload and by a bill saved
 * after its month's statement was already uploaded.
 *
 * For a credit note the "claim" is the month its GST comes off the credit —
 * the month the portal nets it out of 4A — given on the same terms.
 *
 * Never for a bill whose claim was withdrawn by hand (`withdrawnAt`): that
 * was the owner's call, and the next save or re-upload of the same statement
 * claimed it straight back until 8 Nov 2026. A claim by hand clears it.
 */
export function claimFromMatch(found: MatchResult["matched"][number]): BillClaim | null {
  return found.match.status === "matched" &&
    found.invoice.itcAvailable &&
    !found.bill.reverseCharge &&
    !found.bill.withdrawnAt
    ? { month: found.match.month, source: "gstr2b" }
    : null;
}
