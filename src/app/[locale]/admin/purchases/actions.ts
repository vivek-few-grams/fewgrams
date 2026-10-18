"use server";

import { revalidatePath } from "next/cache";
import { hasLocale } from "next-intl";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { assertRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { err, type FormState } from "@/lib/forms";
import { claimFromMatch, MATCH_TOLERANCE, matchStatement } from "@/lib/gst/gstr2b";
import { isMonthId, monthOf, monthOfDate, nextMonth, type MonthId } from "@/lib/gst/period";
import { isLockedMonth, type GstFiling } from "@/lib/gst/quarter";
import {
  STOCK_KINDS,
  billTotals,
  claimable,
  stockChange,
  type BillMatch,
  type PurchaseBill,
  type PurchaseLine,
  type StockKind,
} from "@/lib/purchases/bill";
import { billItems } from "@/lib/purchases/cost";
import { readBill } from "@/lib/purchases/read";
import { costFromBills } from "@/lib/purchases/reprice";
import { applyStockChange } from "@/lib/purchases/stock";
import { vendorSnapshot } from "@/lib/purchases/vendor";
import { isValidContentKey } from "@/lib/content/content-key";
import { growMediumNameMap } from "@/lib/content/grow-media";
import { seedNameMap } from "@/lib/content/seeds";
import { trayNameMap } from "@/lib/content/trays";
import { getGstr2b, listFilings } from "@/lib/repo/gst";
import { getGrowMediumByKey, listGrowMedia, putGrowMedium } from "@/lib/repo/grow-media";
import {
  BILL_FILE_MAX,
  BILL_FILE_TYPES,
  deleteBill,
  deleteBillFile,
  getBill,
  putBill,
  putBillFile,
} from "@/lib/repo/purchases";
import { getSeedByKey, listSeeds, putSeed } from "@/lib/repo/seeds";
import { getTrayByKey, listTrays, putTray } from "@/lib/repo/trays";
import { getVendor, listVendors, putVendor } from "@/lib/repo/vendors";

/**
 * Purchase-bill mutations — `/admin/purchases`, SPEC §26.6. Each asserts the
 * admin role itself.
 *
 * **A filed quarter is closed.** Once its GSTR-3B is marked filed, a bill
 * claimed in it can be neither edited nor deleted, and no credit can be
 * claimed into it: the return already says what it says. A correction goes
 * in the next open month, as the law has it.
 */

function refresh(id?: string) {
  revalidatePath("/[locale]/admin/purchases", "page");
  if (id) revalidatePath(`/[locale]/admin/purchases/${id}`, "page");
  revalidatePath("/[locale]/admin/gst", "page");
  revalidatePath("/[locale]/admin/vendors", "page");
}

/** A bill moves stock and sets costs, so the product screens and every shop
 *  page that prints a price change with it. */
function refreshCatalogue() {
  revalidatePath("/[locale]", "layout");
}

/** The first month from `month` on whose quarter is still open. */
function firstOpen(month: MonthId, filings: GstFiling[]): MonthId {
  let m = month;
  for (let i = 0; i < 240 && isLockedMonth(filings, m); i++) m = nextMonth(m);
  return m;
}

/** A stored GSTR-2B match, re-judged against edited lines. */
function rematch(match: BillMatch | null, lines: PurchaseLine[]): BillMatch | null {
  if (!match) return null;
  const t = billTotals(lines);
  const p = match.portal;
  const ok =
    Math.abs(t.taxable - p.taxable) <= MATCH_TOLERANCE &&
    Math.abs(t.igst + t.cgst + t.sgst - (p.igst + p.cgst + p.sgst)) <= MATCH_TOLERANCE;
  return { ...match, status: ok ? "matched" : "mismatch" };
}

async function stockItems(): Promise<Set<string>> {
  const [trays, media, seeds] = await Promise.all([listTrays(), listGrowMedia(), listSeeds()]);
  return new Set([
    ...trays.map((x) => `tray:${x.contentKey}`),
    ...media.map((x) => `media:${x.contentKey}`),
    ...seeds.map((x) => `seed:${x.contentKey}`),
  ]);
}

/** Add a bill, or save one (`id` set): its lines, its file, and the stock
 *  it moves. */
export async function saveBill(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const [vendors, items, filings] = await Promise.all([listVendors(), stockItems(), listFilings()]);
  const today = istDateISO(new Date());
  const id = String(fd.get("id") ?? "");
  const current = id ? await getBill(id) : null;
  if (id && !current) return err("notFound");

  const read = readBill(fd, {
    vendors: new Map(vendors.map((v) => [v.id, v])),
    stockItems: items,
    onBill: new Set(billItems(current?.lines ?? [])),
    today,
  });
  if (!read.ok) return read.state;
  const input = read.value;
  if (current?.claim && isLockedMonth(filings, current.claim.month)) return err("locked");

  const upload = fd.get("file");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  if (file && !(BILL_FILE_TYPES as readonly string[]).includes(file.type)) return err("fileType", "file");
  if (file && file.size > BILL_FILE_MAX) return err("fileTooBig", "file");

  const vendor = vendors.find((v) => v.id === input.vendorId)!;
  const now = new Date().toISOString();
  const draft: PurchaseBill = {
    id: current?.id ?? crypto.randomUUID(),
    /* Re-copied on every save: correcting a vendor's GSTIN and re-saving
       an unfiled bill is how a wrong one is put right. */
    vendor: vendorSnapshot(vendor),
    number: input.number,
    date: input.date,
    reverseCharge: input.reverseCharge,
    lines: input.lines,
    paidOn: input.paidOn,
    claim: null,
    match: rematch(current?.match ?? null, input.lines),
    file: current?.file ?? null,
    notes: input.notes,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  /* Reverse-charge credit needs no vendor's return: it is claimed in the
     month of the bill, or the first open month after it. Any other claim
     comes from GSTR-2B (or by hand) and survives an edit. */
  if (claimable(draft)) {
    if (draft.reverseCharge)
      draft.claim = { month: firstOpen(monthOfDate(draft.date), filings), source: "reverseCharge" };
    else if (current?.claim && current.claim.source !== "reverseCharge") draft.claim = current.claim;
  }
  /* An unclaimed bill that a GSTR-2B already on file shows — entered after
     the upload, or corrected to agree with it — is matched and claimed as
     that upload would have, rather than left waiting for the next one. */
  if (claimable(draft) && !draft.reverseCharge && !draft.claim && draft.vendor.gstin) {
    for (let m = monthOfDate(draft.date); m <= monthOfDate(today); m = nextMonth(m)) {
      const statement = await getGstr2b(m);
      const found = statement && matchStatement(statement, [draft]).matched[0];
      if (!found) continue;
      draft.match = found.match;
      if (!isLockedMonth(filings, m)) draft.claim = claimFromMatch(found);
      break;
    }
  }
  /* An edit that leaves the bill disagreeing with the vendor's return takes
     back the claim that return gave it (`claimAfterMatch`). */
  if (draft.claim?.source === "gstr2b" && draft.match?.status === "mismatch") draft.claim = null;

  if (file) {
    draft.file = await putBillFile(draft.id, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } else if (fd.get("removeFile") !== null && draft.file) {
    await deleteBillFile(draft.id);
    draft.file = null;
  }

  await putBill(draft);
  const short = await applyStockChange(stockChange(current?.lines ?? [], draft.lines));
  for (const s of short) {
    console.warn(
      `[stock] bill ${draft.id}: ${s.kind}:${s.key} was ${s.short} short when taken back — count it on the stock screen`,
    );
  }
  await costFromBills([...billItems(current?.lines ?? []), ...billItems(draft.lines)]);
  refresh(draft.id);
  refreshCatalogue();
  return { status: "saved" };
}

/** Delete a bill, taking its stock back off the shelf. */
export async function removeBill(fd: FormData): Promise<void> {
  await assertRole("admin");
  const bill = await getBill(String(fd.get("id") ?? ""));
  if (!bill) throw new Error("No such bill");
  if (bill.claim && isLockedMonth(await listFilings(), bill.claim.month)) {
    throw new Error("This bill is claimed in a filed quarter");
  }
  await applyStockChange(stockChange(bill.lines, []));
  if (bill.file) await deleteBillFile(bill.id);
  await deleteBill(bill.id);
  /* After the delete, so the cost falls back to the bill before it. */
  await costFromBills(billItems(bill.lines));
  refresh();
  refreshCatalogue();
  const raw = String(fd.get("locale") ?? "");
  redirect({
    href: "/admin/purchases",
    locale: hasLocale(routing.locales, raw) ? raw : routing.defaultLocale,
  });
}

/**
 * Claim a bill's credit in a month by hand — for one the GSTR-2B upload
 * could not match (a vendor who typed the number differently) but which is
 * in the portal's statement — or, with an empty month, withdraw a claim.
 */
export async function setClaim(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const bill = await getBill(String(fd.get("id") ?? ""));
  if (!bill) return err("notFound");
  const filings = await listFilings();
  if (bill.claim && isLockedMonth(filings, bill.claim.month)) return err("locked");
  if (bill.reverseCharge) return err("reverseChargeClaim");

  const month = String(fd.get("month") ?? "");
  if (month === "") {
    await putBill({ ...bill, claim: null, updatedAt: new Date().toISOString() });
  } else {
    if (!isMonthId(month)) return err("monthInvalid", "month");
    if (!claimable(bill)) return err("notClaimable");
    if (month < monthOfDate(bill.date) || month > monthOf(new Date())) return err("monthInvalid", "month");
    if (isLockedMonth(filings, month)) return err("locked", "month");
    await putBill({ ...bill, claim: { month, source: "manual" }, updatedAt: new Date().toISOString() });
  }
  refresh(bill.id);
  return { status: "saved" };
}

export type NewItemResult =
  | { ok: true; item: { value: string; label: string; kind: StockKind } }
  | { ok: false; code: "vendorRequired" | "kindInvalid" | "keyRequired" | "keyInvalid" | "keyTaken" };

/**
 * Add a seed, tray or cocopeat row from the bill form — "+ New product" (the
 * owner, 18 Oct 2026: products are added where they are bought). The row is
 * **hidden and unpriced** — no cost, price 0 — until a saved bill costs it;
 * its screen will not switch it on before then. It is ticked as supplied by
 * the bill's vendor, which is required: a bill offers only what its vendor
 * supplies.
 *
 * The content file is still not a precondition, exactly as on the add forms
 * this replaces: until it exists the row is flagged and stays off the site.
 */
export async function addStockItem(kind: string, rawKey: string, vendorId: string): Promise<NewItemResult> {
  await assertRole("admin");
  const vendor = vendorId ? await getVendor(vendorId) : null;
  if (!vendor) return { ok: false, code: "vendorRequired" };
  if (!(STOCK_KINDS as readonly string[]).includes(kind)) return { ok: false, code: "kindInvalid" };
  const k = kind as StockKind;
  const key = rawKey.trim().toLowerCase();
  if (!key) return { ok: false, code: "keyRequired" };
  if (!isValidContentKey(key)) return { ok: false, code: "keyInvalid" };

  const locale = routing.defaultLocale;
  /* A `Record`, so a fourth stock kind is a type error until it can be added. */
  const KINDS: Record<
    StockKind,
    {
      exists: () => Promise<unknown>;
      create: (id: string) => Promise<void>;
      names: () => Promise<Record<string, string>>;
    }
  > = {
    seed: {
      exists: () => getSeedByKey(key),
      create: (id) => putSeed({ id, contentKey: key, pricePer100g: 0, stockGrams: 0, active: false }),
      names: () => seedNameMap(locale),
    },
    tray: {
      exists: () => getTrayByKey(key),
      create: (id) => putTray({ id, contentKey: key, price: 0, stockPacks: 0, active: false }),
      names: () => trayNameMap(locale),
    },
    media: {
      exists: () => getGrowMediumByKey(key),
      create: (id) => putGrowMedium({ id, contentKey: key, price: 0, stockPacks: 0, active: false }),
      names: () => growMediumNameMap(locale),
    },
  };
  /* One row per key within its kind — `radish` the seed and `radish` the
     tray are different products (SPEC §22.4). */
  if (await KINDS[k].exists()) return { ok: false, code: "keyTaken" };
  await KINDS[k].create(crypto.randomUUID());

  const value = `${k}:${key}`;
  if (!vendor.supplies.includes(value)) {
    await putVendor({
      ...vendor,
      supplies: [...vendor.supplies, value],
      updatedAt: new Date().toISOString(),
    });
  }
  refreshCatalogue();
  const names = await KINDS[k].names();
  return { ok: true, item: { value, label: names[key] ?? key, kind: k } };
}
