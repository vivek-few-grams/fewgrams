import type { CreditUse } from "@/lib/purchases/bill";
import { HOME_STATE, type GstState } from "@/lib/tax/states";
import { ZERO, addHeads, floorHeads, scaleHeads, setOff, subHeads, type Heads, type SetOff } from "./ledger";
import { saleKind } from "./gstr1";
import type { CreditDoc, SaleDoc } from "./sales";

/**
 * GSTR-3B for a period — SPEC §26.5. Paise, by head.
 *
 * - **3.1(a)** taxable sales and their tax, net of credit notes issued in the
 *   period; **3.1(c)** exempt sales; **3.1(d)** purchases we pay the tax on
 *   ourselves (reverse charge).
 * - **3.2** the inter-state part of 3.1(a) sold to unregistered buyers, by
 *   state.
 * - **4A(2)** credit on services imported from a foreign vendor, **4A(3)**
 *   on other reverse-charge purchases (an Indian lawyer, a transporter),
 *   **4A(5)** every other credit in the period's GSTR-2B. **4B(1)** what must be reversed (CGST
 *   Rules 42): all of the credit on things used only for exempt sales, and
 *   the exempt share of the credit on things used for both.
 * - **5** exempt purchases (seeds) from registered vendors.
 *
 * The figures for the portal are these; `settle` then works out how the tax
 * is paid — from credit first, the rest in cash.
 */

export type ItcLine = {
  taxable: number;
  heads: Heads;
  credit: CreditUse;
  reverseCharge: boolean;
  /** From a vendor outside India — an import of services, 4A(2) rather
   *  than 4A(3). */
  imported: boolean;
};

export type ExemptInward = { value: number; intra: boolean };

export type Amounts = { taxable: number } & Heads;

export type Gstr3b = {
  outward: Amounts;
  exempt: number;
  reverseCharge: Amounts;
  interStateB2c: { pos: GstState | null; taxable: number; igst: number }[];
  itc: { importServices: Heads; reverseCharge: Heads; other: Heads; reversed: Heads; net: Heads };
  /** The working behind 4B(1), shown on the page. */
  rule42: {
    exemptTurnover: number;
    totalTurnover: number;
    /** Exempt ÷ total; 1 when nothing was sold, so nothing is over-claimed. */
    share: number;
    common: Heads;
    commonReversed: Heads;
    exclusive: Heads;
  };
  exemptInward: { intra: number; inter: number };
};

const amounts = (): Amounts => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 });

export function buildGstr3b(
  sales: SaleDoc[],
  credits: CreditDoc[],
  itcLines: ItcLine[],
  exemptInward: ExemptInward[],
): Gstr3b {
  const outward = amounts();
  let exempt = 0;
  const b2c = new Map<string, { pos: GstState | null; taxable: number; igst: number }>();

  const add = (d: SaleDoc, sign: 1 | -1) => {
    const unregisteredInter = d.buyer === null && d.pos?.code !== HOME_STATE.code && saleKind(d) !== "b2b";
    for (const r of d.rows) {
      if (r.rate === 0) {
        exempt += sign * r.taxable;
        continue;
      }
      outward.taxable += sign * r.taxable;
      outward.igst += sign * r.igst;
      outward.cgst += sign * r.cgst;
      outward.sgst += sign * r.sgst;
      if (unregisteredInter) {
        const k = d.pos?.code ?? "??";
        const row = b2c.get(k) ?? { pos: d.pos, taxable: 0, igst: 0 };
        row.taxable += sign * r.taxable;
        row.igst += sign * r.igst;
        b2c.set(k, row);
      }
    }
  };
  for (const d of sales) add(d, 1);
  for (const c of credits) add(c.invoice, -1);

  const reverseCharge = amounts();
  let importItc: Heads = ZERO;
  let rcItc: Heads = ZERO;
  let otherItc: Heads = ZERO;
  let common: Heads = ZERO;
  let exclusive: Heads = ZERO;
  for (const l of itcLines) {
    if (l.reverseCharge) {
      reverseCharge.taxable += l.taxable;
      reverseCharge.igst += l.heads.igst;
      reverseCharge.cgst += l.heads.cgst;
      reverseCharge.sgst += l.heads.sgst;
      if (l.imported) importItc = addHeads(importItc, l.heads);
      else rcItc = addHeads(rcItc, l.heads);
    } else {
      otherItc = addHeads(otherItc, l.heads);
    }
    if (l.credit === "shared") common = addHeads(common, l.heads);
    if (l.credit === "none") exclusive = addHeads(exclusive, l.heads);
  }

  const exemptTurnover = Math.max(0, exempt);
  const totalTurnover = Math.max(0, exempt + outward.taxable);
  /* Rule 42 divides by the period's turnover; with none, reverse it all
     rather than claim credit no sale has earned yet. It comes back through
     the annual recalculation if it was not owed. */
  const share = totalTurnover > 0 ? exemptTurnover / totalTurnover : 1;
  const commonReversed = scaleHeads(common, share);
  const reversed = addHeads(exclusive, commonReversed);

  return {
    outward,
    exempt,
    reverseCharge,
    interStateB2c: [...b2c.values()]
      .filter((r) => r.taxable !== 0)
      .sort((a, b) => (a.pos?.code ?? "99").localeCompare(b.pos?.code ?? "99")),
    itc: {
      importServices: importItc,
      reverseCharge: rcItc,
      other: otherItc,
      reversed,
      net: floorHeads(subHeads(addHeads(importItc, rcItc, otherItc), reversed)),
    },
    rule42: { exemptTurnover, totalTurnover, share, common, commonReversed, exclusive },
    exemptInward: {
      intra: exemptInward.filter((x) => x.intra).reduce((a, x) => a + x.value, 0),
      inter: exemptInward.filter((x) => !x.intra).reduce((a, x) => a + x.value, 0),
    },
  };
}

export type Settlement = {
  /** Credit available: carried in plus this period's net credit. */
  credit: Heads;
  setOff: SetOff;
  /** Cash the period's tax needs: what credit could not pay, plus every
   *  rupee of reverse-charge tax, which the law requires in cash. */
  cashNeeded: Heads;
  /** Cash already in the ledger: carried in plus deposits made. */
  cashHeld: Heads;
  /** Still to deposit, head by head — cash in one head cannot pay another. */
  toPay: Heads;
  closingCredit: Heads;
  closingCash: Heads;
};

export function settle(
  r: Pick<Gstr3b, "outward" | "reverseCharge" | "itc">,
  opening: { credit: Heads; cash: Heads },
  deposits: Heads,
): Settlement {
  const credit = addHeads(opening.credit, r.itc.net);
  const off = setOff(r.outward, credit);
  const cashNeeded = addHeads(off.cash, r.reverseCharge);
  const cashHeld = addHeads(opening.cash, deposits);
  return {
    credit,
    setOff: off,
    cashNeeded: { igst: cashNeeded.igst, cgst: cashNeeded.cgst, sgst: cashNeeded.sgst },
    cashHeld,
    toPay: floorHeads(subHeads(cashNeeded, cashHeld)),
    closingCredit: off.leftover,
    closingCash: floorHeads(subHeads(cashHeld, cashNeeded)),
  };
}
