"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { BUSINESS } from "@/lib/content/legal";
import { istDateISO } from "@/lib/delivery-date";
import { err, type FormState } from "@/lib/forms";
import { claimAfterMatch, matchStatement, parseGstr2b } from "@/lib/gst/gstr2b";
import { GST_FIRST_MONTH, isMonthId, isQuarterId, monthOf } from "@/lib/gst/period";
import { isLockedMonth, quarterView } from "@/lib/gst/quarter";
import { isIsoDate } from "@/lib/purchases/dates";
import {
  deletePayment,
  getPayment,
  listFilings,
  loadBooks,
  putFiling,
  putGstr2b,
  putPayment,
} from "@/lib/repo/gst";
import { listBills, putBill } from "@/lib/repo/purchases";

/**
 * GST page mutations — `/admin/gst`, SPEC §26.5. Each asserts the admin role
 * itself. Nothing here talks to the GST portal: the owner files there, and
 * records here what was filed and paid, so the next figures start from the
 * right place.
 */

function refresh() {
  revalidatePath("/[locale]/admin/gst", "page");
  revalidatePath("/[locale]/admin/purchases", "layout");
}

const MAX_2B = 5 * 1024 * 1024;

/**
 * Upload a GSTR-2B JSON. Stored against its month (replacing an earlier
 * upload of it), then matched against every bill: a match is recorded on
 * the bill, and a bill the portal reports as billed — with credit available
 * — is claimed in that month unless it was claimed already.
 */
export async function uploadGstr2b(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return err("fileRequired", "file");
  if (file.size > MAX_2B) return err("fileTooBig", "file");

  const parsed = parseGstr2b(await file.text());
  if (!parsed.ok) return err(parsed.code, "file");
  const statement = parsed.statement;
  if (statement.gstin && statement.gstin !== BUSINESS.gstin) {
    return err("wrongGstin", "file", { gstin: statement.gstin });
  }
  const filings = await listFilings();
  if (isLockedMonth(filings, statement.month)) return err("locked", "file");

  await putGstr2b({ ...statement, fileName: file.name.slice(0, 120), uploadedAt: new Date().toISOString() });

  const { matched } = matchStatement(statement, await listBills());
  const now = new Date().toISOString();
  for (const found of matched) {
    const { bill, match } = found;
    /* A bill claimed in a filed quarter keeps the match it was filed on. */
    if (bill.claim && isLockedMonth(filings, bill.claim.month)) continue;
    await putBill({ ...bill, match, claim: claimAfterMatch(found), updatedAt: now });
  }
  refresh();
  return { status: "saved" };
}

const toPaise = (raw: FormDataEntryValue | null): number | null => {
  const s = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** Record a challan paid on the portal — PMT-06 for months 1 and 2, or the
 *  quarter's balance before GSTR-3B. */
export async function recordPayment(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const month = String(fd.get("month") ?? "");
  if (!isMonthId(month) || month < GST_FIRST_MONTH || month > monthOf(new Date()))
    return err("monthInvalid", "month");
  if (isLockedMonth(await listFilings(), month)) return err("locked", "month");

  const paidOn = String(fd.get("paidOn") ?? "").trim();
  if (!isIsoDate(paidOn) || paidOn > istDateISO(new Date())) return err("dateInvalid", "paidOn");
  const reference = String(fd.get("reference") ?? "")
    .trim()
    .slice(0, 30);
  if (!reference) return err("referenceRequired", "reference");

  const igst = toPaise(fd.get("igst"));
  const cgst = toPaise(fd.get("cgst"));
  const sgst = toPaise(fd.get("sgst"));
  if (igst === null || cgst === null || sgst === null) return err("amountInvalid");
  if (igst + cgst + sgst === 0) return err("amountRequired");

  await putPayment({
    id: crypto.randomUUID(),
    month,
    paidOn,
    reference,
    heads: { igst, cgst, sgst },
    createdAt: new Date().toISOString(),
  });
  refresh();
  return { status: "saved" };
}

export async function removePayment(fd: FormData): Promise<void> {
  await assertRole("admin");
  const p = await getPayment(String(fd.get("id") ?? ""));
  if (!p) return;
  if (isLockedMonth(await listFilings(), p.month)) throw new Error("This payment belongs to a filed quarter");
  await deletePayment(p.id);
  refresh();
}

/**
 * Record a return as filed, with the date and the portal's ARN. Marking
 * GSTR-3B filed freezes the ledgers it left — the next quarter opens from
 * them — and closes the quarter: its bills, claims and payments stop
 * changing.
 */
export async function markFiled(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const quarter = String(fd.get("quarter") ?? "");
  if (!isQuarterId(quarter)) return err("quarterInvalid");
  const which = String(fd.get("which") ?? "");
  if (which !== "gstr1" && which !== "gstr3b") return err("quarterInvalid");
  const filedOn = String(fd.get("filedOn") ?? "").trim();
  if (!isIsoDate(filedOn) || filedOn > istDateISO(new Date())) return err("dateInvalid", "filedOn");
  const arn = String(fd.get("arn") ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 30);
  if (!arn) return err("arnRequired", "arn");

  const view = quarterView(await loadBooks(), quarter);
  const current = view.filing ?? { quarter, gstr1: null, gstr3b: null, closing: null, updatedAt: "" };
  const filed = { filedOn, arn };
  await putFiling({
    ...current,
    ...(which === "gstr1" ? { gstr1: filed } : { gstr3b: filed }),
    ...(which === "gstr3b"
      ? { closing: { credit: view.settlement.closingCredit, cash: view.settlement.closingCash } }
      : {}),
    updatedAt: new Date().toISOString(),
  });
  refresh();
  return { status: "saved" };
}

/** Undo a "filed" mark made by mistake. Undoing GSTR-3B reopens the quarter. */
export async function unmarkFiled(fd: FormData): Promise<void> {
  await assertRole("admin");
  const quarter = String(fd.get("quarter") ?? "");
  const which = String(fd.get("which") ?? "");
  const current = (await listFilings()).find((f) => f.quarter === quarter);
  if (!current) return;
  await putFiling({
    ...current,
    ...(which === "gstr1" ? { gstr1: null } : {}),
    ...(which === "gstr3b" ? { gstr3b: null, closing: null } : {}),
    updatedAt: new Date().toISOString(),
  });
  refresh();
}
