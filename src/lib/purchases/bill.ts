import { addDaysISO } from "@/lib/purchases/dates";
import type { Heads } from "@/lib/gst/ledger";
import { GST_FROM_DATE, type MonthId } from "@/lib/gst/period";
import { HOME_STATE, type GstState } from "@/lib/tax/states";

/**
 * A purchase bill — SPEC §26.6. What we paid a vendor and the GST inside it,
 * line by line, so the credit can be claimed and the stock goes up.
 *
 * Every amount is in **paise**, like sales. Unlike sales, a bill's tax is
 * **added to** its taxable value, because that is how a vendor's invoice is
 * written: the form takes the value before tax and the rate, works the tax
 * out, and lets it be corrected to the paisa printed on the bill.
 */

/** What a line was bought for. Decides the default credit, and whether it
 *  adds to stock. */
export const PURCHASE_CATEGORIES = [
  /** Trays, mats, cocopeat or seeds put on the shelf to sell — adds stock. */
  "stock",
  /** Shipping charged on the bill — shared into the cost of its stock lines
   *  (`billCosts`, the owner, 18 Oct 2026). */
  "freight",
  /** A rack the vendor built and shipped straight to a customer. */
  "rack",
  /** Trays, seeds, media or equipment used to grow our own greens. */
  "growing",
  "packaging",
  "courier",
  "gateway",
  "software",
  "rent",
  "other",
] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

/**
 * How much of a line's GST can be claimed (CGST Act s.17, CGST Rules 42):
 * - `full` — used only to make taxable sales (trays to resell).
 * - `shared` — used for both taxable and exempt sales (courier, packaging,
 *   software): claimed, then cut back each period by the exempt share.
 * - `none` — used only for exempt sales (anything that grows the greens),
 *   or not for the business at all: reported and reversed in full.
 */
export const CREDIT_USES = ["full", "shared", "none"] as const;
export type CreditUse = (typeof CREDIT_USES)[number];

export const DEFAULT_CREDIT: Record<PurchaseCategory, CreditUse> = {
  stock: "full",
  /* Follows the goods it brought — `freightCredit` works it out per bill;
     this is the fallback for a bill with nothing else on it. */
  freight: "shared",
  rack: "full",
  growing: "none",
  packaging: "shared",
  courier: "shared",
  gateway: "shared",
  software: "shared",
  rent: "shared",
  other: "shared",
};

/**
 * The credit on a bill's shipping: the credit of the goods it brought. Seed
 * is exempt and goes only to exempt sales, so shipping on a seed bill is
 * `none`; on trays for resale it is `full`; on a mixed bill, `shared`.
 */
export function freightCredit(
  lines: ReadonlyArray<Pick<PurchaseLine, "category" | "rate" | "credit">>,
): CreditUse {
  const uses = new Set(
    lines.filter((l) => l.category !== "freight").map((l) => (l.rate === 0 ? "none" : l.credit)),
  );
  return uses.size === 1 ? [...uses][0]! : DEFAULT_CREDIT.freight;
}

/** The catalogue rows that hold a stock count. Racks are built to order and
 *  greens are grown, so neither is here. */
export const STOCK_KINDS = ["tray", "media", "seed"] as const;
export type StockKind = (typeof STOCK_KINDS)[number];
export type StockItem = { kind: StockKind; key: string };

export type PurchaseLine = {
  category: PurchaseCategory;
  /** Set only for `stock`: which catalogue row the quantity adds to. */
  item: StockItem | null;
  description: string;
  /** Packs (trays), blocks (cocopeat) or grams (seeds) for a stock line;
   *  free for the rest, and optional. */
  quantity: number | null;
  taxable: number;
  /** Percent. 0 for exempt goods (seeds) and for an unregistered vendor. */
  rate: number;
  igst: number;
  cgst: number;
  sgst: number;
  credit: CreditUse;
};

/**
 * Who sold it, copied onto the bill so editing the vendor later cannot
 * change a bill already claimed.
 * - `registered` — has a GSTIN; its state comes from the GSTIN.
 * - `unregistered` — charges no GST; nothing to claim.
 * - `foreign` — outside India (Cloudflare, an AI subscription): no GST on
 *   the bill, and we pay it ourselves under reverse charge.
 */
export type VendorKind = "registered" | "unregistered" | "foreign";
export type VendorSnapshot = {
  id: string;
  name: string;
  kind: VendorKind;
  gstin: string | null;
  state: GstState | null;
};

export type BillFile = { name: string; type: string; size: number; chunks: number };

/** Where a bill stands against the portal's GSTR-2B. */
export type BillMatch = {
  month: MonthId;
  status: "matched" | "mismatch";
  /** What the vendor reported, for a mismatch to be checked against. */
  portal: { taxable: number } & Heads;
};

export type BillClaim = {
  /** The month whose return the credit is claimed in. */
  month: MonthId;
  source: "gstr2b" | "manual" | "reverseCharge";
};

export type PurchaseBill = {
  id: string;
  vendor: VendorSnapshot;
  /** The vendor's invoice number, exactly as printed — it is how the bill is
   *  matched to GSTR-2B. */
  number: string;
  /** `YYYY-MM-DD`, the invoice date. */
  date: string;
  /** We pay the tax, not the vendor — always for a foreign vendor. */
  reverseCharge: boolean;
  lines: PurchaseLine[];
  /** `YYYY-MM-DD`; the credit must be reversed if unpaid 180 days after the
   *  invoice date (CGST Act s.16(2), second proviso). */
  paidOn: string | null;
  claim: BillClaim | null;
  match: BillMatch | null;
  file: BillFile | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** Whether the vendor's GST is CGST + SGST (same state as us) or IGST. A
 *  foreign vendor's reverse-charge tax is IGST. */
export function isIntraPurchase(vendor: Pick<VendorSnapshot, "kind" | "state">): boolean {
  return vendor.kind === "registered" && vendor.state?.code === HOME_STATE.code;
}

/** Tax on a value before tax, head by head, rounded to the paisa as a
 *  vendor's invoice rounds each head. */
export function lineTax(taxable: number, rate: number, intra: boolean): Heads {
  if (rate === 0) return { igst: 0, cgst: 0, sgst: 0 };
  if (!intra) return { igst: Math.round((taxable * rate) / 100), cgst: 0, sgst: 0 };
  const half = Math.round((taxable * rate) / 200);
  return { igst: 0, cgst: half, sgst: half };
}

/**
 * True when the bill carries GST we can put in the return at all. Not a bill
 * from before registration: GST paid then was a cost, not a credit, and the
 * stock-in-hand claim (ITC-01) needs bills in the business's own name.
 */
export function claimable(bill: Pick<PurchaseBill, "vendor" | "reverseCharge" | "lines" | "date">): boolean {
  if (bill.date < GST_FROM_DATE) return false;
  if (bill.vendor.kind === "unregistered" && !bill.reverseCharge) return false;
  return bill.lines.some((l) => l.igst + l.cgst + l.sgst > 0);
}

export type BillTotals = { taxable: number; gross: number } & Heads;

export function billTotals(lines: PurchaseLine[]): BillTotals {
  const t: BillTotals = { taxable: 0, gross: 0, igst: 0, cgst: 0, sgst: 0 };
  for (const l of lines) {
    t.taxable += l.taxable;
    t.igst += l.igst;
    t.cgst += l.cgst;
    t.sgst += l.sgst;
  }
  t.gross = t.taxable + t.igst + t.cgst + t.sgst;
  return t;
}

/**
 * What saving a bill does to stock: the change per catalogue row between the
 * lines before and after (`kind:key` → packs, blocks or grams). A new bill is
 * `stockChange([], lines)`; a deleted one `stockChange(lines, [])`.
 */
export function stockChange(before: PurchaseLine[], after: PurchaseLine[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (lines: PurchaseLine[], sign: 1 | -1) => {
    for (const l of lines) {
      if (l.category !== "stock" || !l.item || !l.quantity) continue;
      const k = `${l.item.kind}:${l.item.key}`;
      m.set(k, (m.get(k) ?? 0) + sign * l.quantity);
    }
  };
  add(before, -1);
  add(after, 1);
  for (const [k, v] of m) if (v === 0) m.delete(k);
  return m;
}

/** The last day the vendor can be paid without the credit being reversed. */
export const payBy = (bill: Pick<PurchaseBill, "date">) => addDaysISO(bill.date, 180);
/** Whether the 180-day rule applies: credit claimed on a bill paid to the
 *  vendor. Reverse charge is outside it (s. 16(2), second proviso) — the tax
 *  is ours, paid to the government, not to them. */
export const owesPayBy = (bill: Pick<PurchaseBill, "vendor" | "reverseCharge" | "lines" | "date">) =>
  claimable(bill) && !bill.reverseCharge;

export type BillStatus =
  /** Nothing to claim: an unregistered vendor, or only exempt goods. */
  | "noGst"
  /** Foreign or other reverse charge — claimed in its own month. */
  | "reverseCharge"
  | "claimed"
  | "mismatch"
  | "waiting";

export function billStatus(bill: PurchaseBill): BillStatus {
  if (!claimable(bill)) return "noGst";
  if (bill.reverseCharge) return "reverseCharge";
  if (bill.match?.status === "mismatch" && !bill.claim) return "mismatch";
  if (bill.claim) return "claimed";
  return "waiting";
}
