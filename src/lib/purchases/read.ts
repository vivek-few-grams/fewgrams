import { err, type FormState } from "@/lib/forms";
import {
  CREDIT_USES,
  PURCHASE_CATEGORIES,
  STOCK_KINDS,
  isIntraPurchase,
  lineTax,
  type CreditUse,
  type PurchaseCategory,
  type PurchaseLine,
  type StockKind,
} from "./bill";
import { isIsoDate } from "./dates";
import type { Vendor } from "./vendor";

/**
 * Read the purchase-bill form — SPEC §26.6. Errors are keys under
 * `admin.purchases.errors`, pointing at `field.<row>` for a line.
 *
 * Money is typed in rupees and kept in paise. Each line's tax is worked out
 * from its value and rate unless the bill's own figures are typed over it;
 * those must agree with the worked figure to within a rupee per head, which
 * allows the vendor's rounding and catches a slipped digit.
 */

/** Every GST rate in force for goods and services, in percent. */
export const PURCHASE_RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40] as const;

export const MAX_BILL_LINES = 40;
const TOLERANCE = 100;

export type BillInput = {
  vendorId: string;
  number: string;
  date: string;
  reverseCharge: boolean;
  paidOn: string | null;
  notes: string;
  lines: PurchaseLine[];
};

const toPaise = (raw: string): number | null => {
  if (raw === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function readBill(
  fd: FormData,
  ctx: {
    vendors: ReadonlyMap<string, Vendor>;
    /** `kind:key` of every catalogue row a stock line may add to. */
    stockItems: ReadonlySet<string>;
    /** Items already on the bill being edited — kept even if the vendor no
     *  longer supplies them, so an old bill can still be corrected. */
    onBill?: ReadonlySet<string>;
    /** `YYYY-MM-DD`, IST. */
    today: string;
  },
): { ok: true; value: BillInput } | { ok: false; state: FormState } {
  const fail = (code: string, field?: string, values?: Record<string, string>) => ({
    ok: false as const,
    state: err(code, field, values),
  });

  const vendor = ctx.vendors.get(String(fd.get("vendorId") ?? ""));
  if (!vendor) return fail("vendorRequired", "vendorId");

  const number = String(fd.get("number") ?? "").trim();
  if (!number) return fail("numberRequired", "number");
  if (number.length > 40) return fail("numberTooLong", "number");

  const date = String(fd.get("date") ?? "").trim();
  if (!isIsoDate(date)) return fail("dateInvalid", "date");
  if (date > ctx.today) return fail("dateFuture", "date");

  const paidRaw = String(fd.get("paidOn") ?? "").trim();
  if (paidRaw && !isIsoDate(paidRaw)) return fail("dateInvalid", "paidOn");
  if (paidRaw && paidRaw > ctx.today) return fail("dateFuture", "paidOn");
  /* Paid before the bill date is allowed: an online order is paid at checkout
     and invoiced on dispatch (the owner, 18 Oct 2026). */

  /* A foreign vendor charges no Indian GST, so it is always ours to pay. */
  const reverseCharge = vendor.kind === "foreign" || fd.get("reverseCharge") !== null;
  /* An unregistered vendor cannot charge GST, and outside reverse charge
     there is none to report. */
  const noGst = vendor.kind === "unregistered" && !reverseCharge;
  const intra = isIntraPurchase(vendor) || (vendor.kind === "unregistered" && reverseCharge);

  const col = (name: string) => fd.getAll(name).map((v) => String(v).trim());
  const cols = {
    category: col("category"),
    item: col("item"),
    description: col("description"),
    quantity: col("quantity"),
    taxable: col("taxable"),
    rate: col("rate"),
    igst: col("igst"),
    cgst: col("cgst"),
    sgst: col("sgst"),
    credit: col("credit"),
  };

  const lines: PurchaseLine[] = [];
  for (let i = 0; i < cols.category.length; i++) {
    const at = (k: keyof typeof cols) => cols[k][i] ?? "";
    if (!at("item") && !at("description") && !at("taxable") && !at("quantity")) continue;
    const row = { row: String(i + 1) };
    const lineFail = (code: string, field: string) => fail(code, `${field}.${i}`, row);

    const category = at("category") as PurchaseCategory;
    if (!PURCHASE_CATEGORIES.includes(category)) return lineFail("categoryRequired", "category");

    let item: PurchaseLine["item"] = null;
    let quantity: number | null = null;
    if (category === "stock") {
      const [kind, key] = at("item").split(":");
      if (!STOCK_KINDS.includes(kind as StockKind) || !key || !ctx.stockItems.has(at("item"))) {
        return lineFail("itemRequired", "item");
      }
      /* Only what the vendor is set to supply (the owner, 18 Oct 2026): a
         product they have not sold us before is added from the bill with
         "+ New product", or linked on its own screen first. */
      if (!vendor.supplies.includes(at("item")) && !ctx.onBill?.has(at("item"))) {
        return fail("itemNotSupplied", `item.${i}`, { ...row, vendor: vendor.name });
      }
      item = { kind: kind as StockKind, key };
      const q = Number(at("quantity"));
      /* Packs and blocks are whole; seed is counted in whole grams. */
      if (!at("quantity") || !Number.isInteger(q) || q < 1) return lineFail("quantityInvalid", "quantity");
      quantity = q;
    } else if (at("quantity")) {
      const q = Number(at("quantity"));
      if (!Number.isFinite(q) || q <= 0) return lineFail("quantityInvalid", "quantity");
      quantity = q;
    }

    const description = at("description").slice(0, 200) || (item ? item.key : "");
    if (!description) return lineFail("descriptionRequired", "description");

    const taxable = toPaise(at("taxable"));
    if (taxable === null || taxable <= 0) return lineFail("taxableInvalid", "taxable");

    const rate = noGst ? 0 : Number(at("rate") || "0");
    if (!(PURCHASE_RATES as readonly number[]).includes(rate)) return lineFail("rateInvalid", "rate");

    const worked = lineTax(taxable, rate, intra);
    const typed = { igst: toPaise(at("igst")), cgst: toPaise(at("cgst")), sgst: toPaise(at("sgst")) };
    const heads = { ...worked };
    for (const h of ["igst", "cgst", "sgst"] as const) {
      const v = typed[h];
      if (v === null) continue;
      if (v < 0 || Math.abs(v - worked[h]) > TOLERANCE) return lineFail("taxOff", h);
      heads[h] = v;
    }

    const credit = (at("credit") || "full") as CreditUse;
    if (!CREDIT_USES.includes(credit)) return lineFail("creditRequired", "credit");

    lines.push({ category, item, description, quantity, taxable, rate, ...heads, credit });
  }
  if (lines.length === 0) return fail("linesRequired");
  if (lines.length > MAX_BILL_LINES) return fail("tooManyLines");

  return {
    ok: true,
    value: {
      vendorId: vendor.id,
      number,
      date,
      reverseCharge,
      paidOn: paidRaw || null,
      notes: String(fd.get("notes") ?? "")
        .trim()
        .slice(0, 500),
      lines,
    },
  };
}
