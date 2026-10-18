import type { EntityItem } from "electrodb";
import { LIST_OPTS, READ_OPTS } from "@/lib/db/client";
import { BillFileChunkEntity, PurchaseBillEntity } from "@/lib/db/entities";
import type { BillFile, PurchaseBill, PurchaseLine } from "@/lib/purchases/bill";
import { billsPerItem } from "@/lib/purchases/cost";

/**
 * Purchase bills and their files — `/admin/purchases`, SPEC §26.6. Key
 * layout in entities.ts; the bill's rules in src/lib/purchases/bill.ts.
 */

type Row = EntityItem<typeof PurchaseBillEntity>;

function fromRow(r: Row): PurchaseBill {
  return {
    id: r.id,
    vendor: {
      id: r.vendor.id,
      name: r.vendor.name,
      kind: r.vendor.kind,
      gstin: r.vendor.gstin ?? null,
      state:
        r.vendor.stateCode && r.vendor.stateName
          ? { code: r.vendor.stateCode, name: r.vendor.stateName }
          : null,
    },
    number: r.number,
    date: r.date,
    reverseCharge: r.reverseCharge,
    lines: r.lines.map((l): PurchaseLine => ({
      category: l.category,
      item: l.itemKind && l.itemKey ? { kind: l.itemKind, key: l.itemKey } : null,
      description: l.description,
      quantity: l.quantity ?? null,
      taxable: l.taxable,
      rate: l.rate,
      igst: l.igst,
      cgst: l.cgst,
      sgst: l.sgst,
      credit: l.credit,
    })),
    paidOn: r.paidOn ?? null,
    claim: r.claim ?? null,
    match: r.match
      ? {
          month: r.match.month,
          status: r.match.status,
          portal: { taxable: r.match.taxable, igst: r.match.igst, cgst: r.match.cgst, sgst: r.match.sgst },
        }
      : null,
    file: r.file ?? null,
    notes: r.notes ?? "",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toRow(b: PurchaseBill) {
  return {
    id: b.id,
    vendor: {
      id: b.vendor.id,
      name: b.vendor.name,
      kind: b.vendor.kind,
      ...(b.vendor.gstin ? { gstin: b.vendor.gstin } : {}),
      ...(b.vendor.state ? { stateCode: b.vendor.state.code, stateName: b.vendor.state.name } : {}),
    },
    number: b.number,
    date: b.date,
    reverseCharge: b.reverseCharge,
    lines: b.lines.map((l) => ({
      category: l.category,
      ...(l.item ? { itemKind: l.item.kind, itemKey: l.item.key } : {}),
      description: l.description,
      ...(l.quantity !== null ? { quantity: l.quantity } : {}),
      taxable: l.taxable,
      rate: l.rate,
      igst: l.igst,
      cgst: l.cgst,
      sgst: l.sgst,
      credit: l.credit,
    })),
    ...(b.paidOn ? { paidOn: b.paidOn } : {}),
    ...(b.claim ? { claim: b.claim } : {}),
    ...(b.match ? { match: { month: b.match.month, status: b.match.status, ...b.match.portal } } : {}),
    ...(b.file ? { file: b.file } : {}),
    ...(b.notes ? { notes: b.notes } : {}),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** Every bill, newest bill date first. */
export async function listBills(): Promise<PurchaseBill[]> {
  const { data } = await PurchaseBillEntity.query.byDate({}).go({ ...LIST_OPTS, order: "desc" });
  return data.map(fromRow);
}

/** Whether any bill names `kind:key`. */
export async function isOnABill(item: string): Promise<boolean> {
  return billsPerItem(await listBills()).has(item);
}

export async function getBill(id: string): Promise<PurchaseBill | null> {
  const { data } = await PurchaseBillEntity.get({ id }).go(READ_OPTS);
  return data ? fromRow(data) : null;
}

/** Write the whole bill. A changed bill date moves its GSI1 key with it. */
export async function putBill(b: PurchaseBill): Promise<void> {
  await PurchaseBillEntity.put(toRow(b)).go();
}

export async function deleteBill(id: string): Promise<void> {
  await PurchaseBillEntity.delete({ id }).go();
}

/* ──────────────────────────── bill files ───────────────────────────── */

/** A bill's file may be up to this many bytes. */
export const BILL_FILE_MAX = 3 * 1024 * 1024;
export const BILL_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
/** Base64 characters per item — well inside DynamoDB's 400 KB. */
const CHUNK = 300_000;

/** Store a file for a bill, replacing any earlier one, and say how it was
 *  stored. */
export async function putBillFile(
  billId: string,
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<BillFile> {
  await deleteBillFile(billId);
  const b64 = Buffer.from(file.bytes).toString("base64");
  const chunks = Math.max(1, Math.ceil(b64.length / CHUNK));
  for (let n = 0; n < chunks; n++) {
    await BillFileChunkEntity.put({ billId, n, data: b64.slice(n * CHUNK, (n + 1) * CHUNK) }).go();
  }
  return { name: file.name.slice(0, 120), type: file.type, size: file.bytes.byteLength, chunks };
}

export async function getBillFile(billId: string): Promise<Buffer | null> {
  const { data } = await BillFileChunkEntity.query.byBill({ billId }).go(LIST_OPTS);
  if (data.length === 0) return null;
  return Buffer.from(
    data
      .sort((a, b) => a.n - b.n)
      .map((c) => c.data)
      .join(""),
    "base64",
  );
}

export async function deleteBillFile(billId: string): Promise<void> {
  const { data } = await BillFileChunkEntity.query.byBill({ billId }).go(LIST_OPTS);
  for (const c of data) await BillFileChunkEntity.delete({ billId, n: c.n }).go();
}
