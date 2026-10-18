import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { GstFilingEntity, GstPaymentEntity, Gstr2bEntity } from "@/lib/db/entities";
import type { Gstr2b } from "@/lib/gst/gstr2b";
import type { MonthId } from "@/lib/gst/period";
import type { GstBooks, GstFiling, GstPayment } from "@/lib/gst/quarter";
import {
  creditFromOrder,
  saleFromOrder,
  saleFromSubscription,
  type CreditDoc,
  type SaleDoc,
} from "@/lib/gst/sales";
import type { SubscriptionStatus } from "@/lib/subscriptions/subscription";
import type { OrderStatus } from "@/lib/types";
import { listOrdersByStatus } from "./orders";
import { listBills } from "./purchases";
import { listSubscriptionsByStatus } from "./subscriptions";

/**
 * The GST books — SPEC §26.5: what was sold and refunded (read off orders
 * and subscriptions, never stored twice), the GSTR-2B statements uploaded,
 * the tax deposited and what has been filed.
 */

/** Every status a paid order can be in. An unpaid checkout has no invoice. */
const PAID_ORDER: readonly OrderStatus[] = [
  "paid",
  "picked",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
  "refunded",
];
const PAID_SUBSCRIPTION: readonly SubscriptionStatus[] = ["active", "paused", "cancelled"];

/**
 * Every invoice and credit note since registration. Reads each paid status
 * partition whole — fine at this volume; when it is not, the place to
 * change is here, with an index on the invoice date.
 */
export async function listSalesDocs(): Promise<{ sales: SaleDoc[]; credits: CreditDoc[] }> {
  const [orders, subs] = await Promise.all([
    Promise.all(PAID_ORDER.map(listOrdersByStatus)).then((xs) => xs.flat()),
    Promise.all(PAID_SUBSCRIPTION.map(listSubscriptionsByStatus)).then((xs) => xs.flat()),
  ]);
  const sales = [...orders.map(saleFromOrder), ...subs.map(saleFromSubscription)].filter(
    (d): d is SaleDoc => d !== null,
  );
  const credits = orders.map(creditFromOrder).filter((c): c is CreditDoc => c !== null);
  return { sales, credits };
}

export async function loadBooks(): Promise<GstBooks> {
  const [{ sales, credits }, bills, payments, filings] = await Promise.all([
    listSalesDocs(),
    listBills(),
    listPayments(),
    listFilings(),
  ]);
  return { sales, credits, bills, payments, filings };
}

/* ────────────────────────────── GSTR-2B ────────────────────────────── */

export type StoredGstr2b = Gstr2b & { fileName: string; uploadedAt: string };

export async function getGstr2b(month: MonthId): Promise<StoredGstr2b | null> {
  const { data } = await Gstr2bEntity.get({ month }).go(READ_OPTS);
  return data
    ? {
        month: data.month,
        gstin: data.gstin,
        fileName: data.fileName,
        uploadedAt: data.uploadedAt,
        invoices: data.invoices,
      }
    : null;
}

export async function putGstr2b(s: StoredGstr2b): Promise<void> {
  await Gstr2bEntity.put(s).go();
}

/* ───────────────────────────── payments ────────────────────────────── */

type PaymentRow = EntityItem<typeof GstPaymentEntity>;
const fromPayment = (r: PaymentRow): GstPayment => ({
  id: r.id,
  month: r.month,
  paidOn: r.paidOn,
  reference: r.reference,
  heads: r.heads,
  createdAt: r.createdAt,
});

export async function listPayments(): Promise<GstPayment[]> {
  const { data } = await GstPaymentEntity.query.all({}).go(LIST_OPTS);
  return data.map(fromPayment);
}

export async function getPayment(id: string): Promise<GstPayment | null> {
  const { data } = await GstPaymentEntity.get({ id }).go(READ_OPTS);
  return data ? fromPayment(data) : null;
}

export async function putPayment(p: GstPayment): Promise<void> {
  await GstPaymentEntity.put(p).go();
}

export async function deletePayment(id: string): Promise<void> {
  await GstPaymentEntity.delete({ id }).go();
}

/* ────────────────────────────── filings ────────────────────────────── */

type FilingRow = EntityItem<typeof GstFilingEntity>;
const fromFiling = (r: FilingRow): GstFiling => ({
  quarter: r.quarter,
  gstr1: r.gstr1 ?? null,
  gstr3b: r.gstr3b ?? null,
  closing: r.closing ?? null,
  updatedAt: r.updatedAt,
});

export async function listFilings(): Promise<GstFiling[]> {
  const { data } = await GstFilingEntity.query.all({}).go(LIST_OPTS);
  return data.map(fromFiling);
}

export async function putFiling(f: GstFiling): Promise<void> {
  await GstFilingEntity.put({
    quarter: f.quarter,
    ...(f.gstr1 ? { gstr1: f.gstr1 } : {}),
    ...(f.gstr3b ? { gstr3b: f.gstr3b } : {}),
    ...(f.closing ? { closing: f.closing } : {}),
    updatedAt: f.updatedAt,
  }).go();
}
