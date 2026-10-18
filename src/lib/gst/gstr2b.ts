import type { BillClaim, BillMatch, PurchaseBill } from "@/lib/purchases/bill";
import { billTotals } from "@/lib/purchases/bill";
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
  /** A vendor's credit note reduces our credit. */
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
  const read = (section: unknown, docsKey: "inv" | "nt", note: boolean) => {
    if (!Array.isArray(section)) return;
    for (const supplier of section as Record<string, unknown>[]) {
      const gstin = str(supplier.ctin).toUpperCase();
      const name = str(supplier.trdnm);
      const docs = supplier[docsKey];
      if (!Array.isArray(docs)) continue;
      for (const d of docs as Record<string, unknown>[]) {
        const sums = sumItems(d.items);
        invoices.push({
          gstin,
          name,
          number: str(d.inum ?? d.ntnum),
          date: isoDate(str(d.dt)),
          value: paise(d.val),
          ...sums,
          itcAvailable: str(d.itcavl).toUpperCase() !== "N",
          reverseCharge: str(d.rev).toUpperCase() === "Y",
          note,
        });
      }
    }
  };
  read(r.docdata.b2b, "inv", false);
  read(r.docdata.b2ba, "inv", false);
  read(r.docdata.cdnr, "nt", true);
  return { ok: true, statement: { month, gstin: str(r.gstin).toUpperCase(), invoices } };
}

/** Invoice numbers are compared ignoring case, spaces and punctuation:
 *  "INV/23-24/0012" on the bill and "INV/23-24/0012 " on the portal are one
 *  invoice. */
export const invoiceKey = (gstin: string, number: string) =>
  `${gstin.toUpperCase()}|${number.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

/** Rounding differences between a bill and the vendor's return. */
export const MATCH_TOLERANCE = 100;

export type MatchResult = {
  /** Bills found in the statement, with how they compare. */
  matched: { bill: PurchaseBill; match: BillMatch; invoice: PortalInvoice }[];
  /** Portal invoices with no bill in the register. */
  unknown: PortalInvoice[];
};

/**
 * Match a statement against the register. A bill is `matched` when its
 * taxable value and its total tax each agree within a rupee, `mismatch`
 * otherwise — the vendor reported it, but not as billed.
 */
export function matchStatement(statement: Gstr2b, bills: PurchaseBill[]): MatchResult {
  const byKey = new Map<string, PurchaseBill>();
  for (const b of bills) if (b.vendor.gstin) byKey.set(invoiceKey(b.vendor.gstin, b.number), b);

  const matched: MatchResult["matched"] = [];
  const unknown: PortalInvoice[] = [];
  for (const inv of statement.invoices) {
    const bill = inv.note ? undefined : byKey.get(invoiceKey(inv.gstin, inv.number));
    if (!bill) {
      unknown.push(inv);
      continue;
    }
    const t = billTotals(bill.lines);
    const ok =
      Math.abs(t.taxable - inv.taxable) <= MATCH_TOLERANCE &&
      Math.abs(t.igst + t.cgst + t.sgst - (inv.igst + inv.cgst + inv.sgst)) <= MATCH_TOLERANCE;
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
  return { matched, unknown };
}

/**
 * The claim a bill keeps once a statement has judged it. A claim made by
 * hand, or for reverse charge, is the owner's or the law's and stays. One
 * the statement gave holds only while the amounts agree: a bill the vendor
 * reported differently is not claimed for more than the portal shows — it
 * waits under "Reported differently" until they agree or it is claimed by
 * hand (found 18 Oct 2026: an edited bill kept its claim at ₹288 against
 * the portal's ₹270).
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
 */
export function claimFromMatch(found: MatchResult["matched"][number]): BillClaim | null {
  return found.match.status === "matched" && found.invoice.itcAvailable && !found.bill.reverseCharge
    ? { month: found.match.month, source: "gstr2b" }
    : null;
}
