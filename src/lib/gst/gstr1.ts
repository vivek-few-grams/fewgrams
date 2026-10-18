import { HSN_INFO } from "@/lib/tax/classes";
import type { TaxRow } from "@/lib/tax/order-tax";
import { HOME_STATE, type GstState } from "@/lib/tax/states";
import { docValue, type CreditDoc, type SaleDoc } from "./sales";

/**
 * GSTR-1 for a period — SPEC §26.5. Every table the portal asks a seller of
 * our size for, built from the invoices dated in the period and the credit
 * notes issued in it. Amounts in paise.
 *
 * Where a sale goes:
 * - **Table 4 (B2B)** — a buyer who gave a GSTIN. One entry per invoice, its
 *   taxable rows by rate.
 * - **Table 5 (B2CL)** — no GSTIN, delivered to another state, invoice over
 *   ₹1 lakh (the threshold from August 2024). One entry per invoice.
 * - **Table 7 (B2CS)** — every other consumer sale, summed by place of supply
 *   and rate.
 * - **Table 8** — the exempt rows of all of them (greens, seeds), by
 *   inter/intra-state and registered/unregistered buyer.
 * - **Table 9B** — credit notes against a B2B invoice (CDNR) or a B2CL one
 *   (CDNUR). A credit note against a B2CS sale is netted in table 7 of the
 *   period it is issued, and the exempt part of any credit note is netted
 *   in table 8; neither has a credit-note table of its own.
 * - **Table 12** — the HSN summary, split B2B and B2C, net of credit notes.
 * - **Table 13** — the invoice and credit-note numbers issued.
 */

/** Table 5's line: an inter-state consumer invoice above this is "large". */
export const B2CL_ABOVE = 1_00_000 * 100;

export type RateAmounts = { rate: number; taxable: number; igst: number; cgst: number; sgst: number };

export type B2bEntry = {
  gstin: string;
  name: string;
  number: string;
  date: string;
  value: number;
  pos: GstState | null;
  items: RateAmounts[];
};
export type B2clEntry = Omit<B2bEntry, "gstin" | "name">;
export type B2csRow = RateAmounts & { pos: GstState | null; intra: boolean };
export type NilRow = { intra: boolean; registered: boolean; exempt: number };
export type NoteEntry = {
  number: string;
  date: string;
  value: number;
  pos: GstState | null;
  invoice: { number: string; date: string };
  items: RateAmounts[];
};
export type CdnrEntry = NoteEntry & { gstin: string; name: string };
export type HsnRow = RateAmounts & {
  hsn: string;
  description: string;
  uqc: string;
  qty: number;
  value: number;
  b2b: boolean;
};
export type DocRange = { from: string; to: string; count: number } | null;

export type Gstr1 = {
  b2b: B2bEntry[];
  b2cl: B2clEntry[];
  b2cs: B2csRow[];
  nil: NilRow[];
  cdnr: CdnrEntry[];
  cdnur: NoteEntry[];
  hsn: HsnRow[];
  docs: { invoices: DocRange; creditNotes: DocRange };
  /** Sales whose state could not be placed: the portal needs a place of
   *  supply for every one, so these must be corrected before filing. */
  unplaced: SaleDoc[];
};

const isIntra = (pos: GstState | null) => pos?.code === HOME_STATE.code;

function byRate(rows: TaxRow[]): RateAmounts[] {
  const m = new Map<number, RateAmounts>();
  for (const r of rows) {
    if (r.rate === 0) continue;
    const a = m.get(r.rate) ?? { rate: r.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    a.taxable += r.taxable;
    a.igst += r.igst;
    a.cgst += r.cgst;
    a.sgst += r.sgst;
    m.set(r.rate, a);
  }
  return [...m.values()].sort((a, b) => b.rate - a.rate);
}

const exemptOf = (rows: TaxRow[]) => rows.filter((r) => r.rate === 0).reduce((a, r) => a + r.taxable, 0);

/** Which table a sale belongs to. */
export function saleKind(d: SaleDoc): "b2b" | "b2cl" | "b2cs" {
  if (d.buyer) return "b2b";
  if (!isIntra(d.pos) && docValue(d) > B2CL_ABOVE) return "b2cl";
  return "b2cs";
}

function range(numbers: string[]): DocRange {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1], count: sorted.length };
}

export function buildGstr1(sales: SaleDoc[], credits: CreditDoc[]): Gstr1 {
  const b2b: B2bEntry[] = [];
  const b2cl: B2clEntry[] = [];
  const b2cs = new Map<string, B2csRow>();
  const nil = new Map<string, NilRow>();
  const hsn = new Map<string, HsnRow>();
  const cdnr: CdnrEntry[] = [];
  const cdnur: NoteEntry[] = [];

  const addB2cs = (d: SaleDoc, sign: 1 | -1) => {
    for (const a of byRate(d.rows)) {
      const k = `${d.pos?.code ?? "??"}|${a.rate}`;
      const row = b2cs.get(k) ?? {
        pos: d.pos,
        intra: isIntra(d.pos),
        rate: a.rate,
        taxable: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
      };
      row.taxable += sign * a.taxable;
      row.igst += sign * a.igst;
      row.cgst += sign * a.cgst;
      row.sgst += sign * a.sgst;
      b2cs.set(k, row);
    }
  };
  const addNil = (d: SaleDoc, sign: 1 | -1) => {
    const exempt = exemptOf(d.rows);
    if (exempt === 0) return;
    const intra = isIntra(d.pos);
    const registered = d.buyer !== null;
    const k = `${intra}|${registered}`;
    const row = nil.get(k) ?? { intra, registered, exempt: 0 };
    row.exempt += sign * exempt;
    nil.set(k, row);
  };
  const addHsn = (d: SaleDoc, sign: 1 | -1) => {
    for (const r of d.rows) {
      const info = HSN_INFO[r.hsn] ?? { uqc: "OTH", description: "" };
      const b2bRow = d.buyer !== null;
      const k = `${b2bRow}|${r.hsn}|${r.rate}`;
      const row = hsn.get(k) ?? {
        hsn: r.hsn,
        description: info.description,
        uqc: info.uqc,
        rate: r.rate,
        b2b: b2bRow,
        qty: 0,
        value: 0,
        taxable: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
      };
      /* Delivery rows add value to their goods' code but no quantity. */
      if (r.source === "line") row.qty += sign * (d.quantities[r.line] ?? 0);
      row.value += sign * r.gross;
      row.taxable += sign * r.taxable;
      row.igst += sign * r.igst;
      row.cgst += sign * r.cgst;
      row.sgst += sign * r.sgst;
      hsn.set(k, row);
    }
  };

  for (const d of sales) {
    const kind = saleKind(d);
    const items = byRate(d.rows);
    if (kind === "b2b" && items.length > 0) {
      b2b.push({
        gstin: d.buyer!.gstin,
        name: d.buyer!.name,
        number: d.number,
        date: d.date,
        value: docValue(d),
        pos: d.pos,
        items,
      });
    } else if (kind === "b2cl" && items.length > 0) {
      b2cl.push({ number: d.number, date: d.date, value: docValue(d), pos: d.pos, items });
    } else if (kind === "b2cs") {
      addB2cs(d, 1);
    }
    addNil(d, 1);
    addHsn(d, 1);
  }

  for (const c of credits) {
    const d = c.invoice;
    const kind = saleKind(d);
    const items = byRate(d.rows);
    const note: NoteEntry = {
      number: c.number,
      date: c.date,
      value: docValue(d),
      pos: d.pos,
      invoice: { number: d.number, date: d.date },
      items,
    };
    if (kind === "b2b" && items.length > 0)
      cdnr.push({ ...note, gstin: d.buyer!.gstin, name: d.buyer!.name });
    else if (kind === "b2cl" && items.length > 0) cdnur.push(note);
    else if (kind === "b2cs") addB2cs(d, -1);
    addNil(d, -1);
    addHsn(d, -1);
  }

  const byNumber = <T extends { number: string }>(xs: T[]) =>
    xs.sort((a, b) => a.number.localeCompare(b.number));
  return {
    b2b: byNumber(b2b),
    b2cl: byNumber(b2cl),
    b2cs: [...b2cs.values()]
      .filter((r) => r.taxable !== 0 || r.igst !== 0 || r.cgst !== 0 || r.sgst !== 0)
      .sort((a, b) => (a.pos?.code ?? "99").localeCompare(b.pos?.code ?? "99") || b.rate - a.rate),
    nil: [...nil.values()].filter((r) => r.exempt !== 0),
    cdnr: byNumber(cdnr),
    cdnur: byNumber(cdnur),
    hsn: [...hsn.values()]
      .filter((r) => r.value !== 0 || r.qty !== 0)
      .sort((a, b) => Number(a.b2b) - Number(b.b2b) || a.hsn.localeCompare(b.hsn) || b.rate - a.rate),
    docs: { invoices: range(sales.map((d) => d.number)), creditNotes: range(credits.map((c) => c.number)) },
    unplaced: sales.filter((d) => d.pos === null),
  };
}
