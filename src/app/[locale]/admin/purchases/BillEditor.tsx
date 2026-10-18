"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type FormState } from "@/lib/forms";
import { keepFields } from "@/lib/keep-fields";
import {
  CREDIT_USES,
  DEFAULT_CREDIT,
  PURCHASE_CATEGORIES,
  freightCredit,
  lineTax,
  type CreditUse,
  type PurchaseBill,
  type PurchaseCategory,
  type StockKind,
} from "@/lib/purchases/bill";
import { billCosts } from "@/lib/purchases/cost";
import { PURCHASE_RATES } from "@/lib/purchases/read";
import { HOME_STATE } from "@/lib/tax/states";
import { NumberField, SelectField, TextField } from "../fields";
import { saveBill } from "./actions";
import { NewItemDialog } from "./NewItemDialog";

export type VendorOption = {
  id: string;
  name: string;
  kind: "registered" | "unregistered" | "foreign";
  stateCode: string | null;
  /** What they supply, as picked on the product screens (`supplies.ts`). */
  supplies: string[];
};
export type ItemOption = { value: string; label: string; kind: StockKind };

/** The item list's last option, which opens "+ New product" instead of
 *  picking. Not a valid `kind:key`, so it can never be posted as one. */
const NEW_ITEM = "+new";

type Row = {
  uid: number;
  category: PurchaseCategory;
  item: string;
  description: string;
  quantity: string;
  taxable: string;
  rate: string;
  igst: string;
  cgst: string;
  sgst: string;
  credit: CreditUse;
  /** Once the credit is picked by hand, a category change leaves it alone. */
  creditTouched: boolean;
};

let nextUid = 0;
const rupees = (paise: number) => (paise / 100).toFixed(2);
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const money = (paise: number) => inr.format(paise / 100);
const blankRow = (): Row => ({
  uid: nextUid++,
  category: "stock",
  item: "",
  description: "",
  quantity: "",
  taxable: "",
  rate: "18",
  igst: "",
  cgst: "",
  sgst: "",
  credit: DEFAULT_CREDIT.stock,
  creditTouched: false,
});

function rowsOf(bill?: PurchaseBill): Row[] {
  if (!bill) return [blankRow()];
  return bill.lines.map((l) => ({
    uid: nextUid++,
    category: l.category,
    item: l.item ? `${l.item.kind}:${l.item.key}` : "",
    description: l.description,
    quantity: l.quantity !== null ? String(l.quantity) : "",
    taxable: rupees(l.taxable),
    rate: String(l.rate),
    igst: l.igst ? rupees(l.igst) : "",
    cgst: l.cgst ? rupees(l.cgst) : "",
    sgst: l.sgst ? rupees(l.sgst) : "",
    credit: l.credit,
    creditTouched: true,
  }));
}

const paise = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) : null;
};

/**
 * The purchase-bill form — SPEC §26.6. A vendor, the bill's number and date
 * exactly as printed, and a line per thing bought.
 *
 * Each line's tax is worked out from its value and rate as the vendor's
 * state requires — CGST + SGST from a Karnataka vendor, IGST otherwise — and
 * shown as the placeholder; typing over it keeps the bill's own figure, to
 * the paisa. Every input is controlled, so a refused save keeps the rows.
 *
 * Each stock line shows the cost it will set on its product — tax and its
 * share of the shipping included (`billCosts`, 18 Oct 2026) — before the
 * bill is saved, so a slipped digit shows up as a strange price.
 */
export function BillEditor({
  vendors,
  items: initialItems,
  suggestions,
  bill,
  today,
}: {
  vendors: VendorOption[];
  items: ItemOption[];
  /** Content keys with no row yet, per kind, for "+ New product". */
  suggestions: Record<StockKind, string[]>;
  bill?: PurchaseBill;
  today: string;
}) {
  const t = useTranslations("admin.purchases");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(saveBill, IDLE);
  const [vendorId, setVendorId] = useState(bill?.vendor.id ?? "");
  const [number, setNumber] = useState(bill?.number ?? "");
  const [date, setDate] = useState(bill?.date ?? today);
  const [paidOn, setPaidOn] = useState(bill?.paidOn ?? "");
  const [reverseCharge, setReverseCharge] = useState(bill?.reverseCharge ?? false);
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() => rowsOf(bill));
  /* Products added from this form, and the vendor links that came with
     them, so they are offered at once without a reload. */
  const [items, setItems] = useState(initialItems);
  const [linked, setLinked] = useState<string[]>([]);
  /* The line whose "+ New product" is open, if any. */
  const [adding, setAdding] = useState<number | null>(null);

  /* A new bill goes back to the register once saved. Navigating is a side
     effect, so it runs after render, never during it. An edited bill stays,
     and its file is stored now: the form is not reset (`keepFields`), so the
     picker is emptied or the next save would upload it again. */
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.status !== "saved") return;
    if (!bill) router.push("/admin/purchases");
    else if (fileInput.current) fileInput.current.value = "";
  }, [state, bill, router]);

  const vendor = vendors.find((v) => v.id === vendorId);
  /* A stock line offers only what the chosen vendor supplies (the owner,
     18 Oct 2026): anything else is added with "+ New product", or linked on
     its own screen first. The line's current item stays, so an old bill can
     still be opened and corrected. */
  const offered = (current: string) =>
    items.filter(
      (x) => vendor?.supplies.includes(x.value) || linked.includes(x.value) || x.value === current,
    );
  const suppliesNothing =
    !!vendor && !items.some((x) => vendor.supplies.includes(x.value) || linked.includes(x.value));
  const rc = vendor?.kind === "foreign" || reverseCharge;
  const noGst = vendor?.kind === "unregistered" && !rc;
  const intra =
    (vendor?.kind === "registered" && vendor.stateCode === HOME_STATE.code) ||
    (vendor?.kind === "unregistered" && rc);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;
  const set = (uid: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  /* A new value or rate makes any GST typed for the old one wrong — and a
     saved bill opens with its GST filled in — so it is worked out again. */
  const retax = (uid: number, patch: Pick<Partial<Row>, "taxable" | "rate">) =>
    set(uid, { ...patch, igst: "", cgst: "", sgst: "" });

  const worked = (r: Row) => lineTax(paise(r.taxable) ?? 0, noGst ? 0 : Number(r.rate) || 0, !!intra);
  const head = (r: Row, h: "igst" | "cgst" | "sgst") => paise(r[h]) ?? worked(r)[h];
  const totals = rows.reduce(
    (a, r) => {
      const taxable = paise(r.taxable) ?? 0;
      const tax = intra ? head(r, "cgst") + head(r, "sgst") : head(r, "igst");
      return { taxable: a.taxable + taxable, tax: a.tax + (noGst ? 0 : tax) };
    },
    { taxable: 0, tax: 0 },
  );
  /* The rows as the lines they will save as — for the cost each stock line
     sets, and for the credit a shipping line takes. */
  const drafts = rows.map((r) => {
    const picked = items.find((x) => x.value === r.item);
    const zero = { igst: 0, cgst: 0, sgst: 0 };
    return {
      category: r.category,
      item: r.category === "stock" && picked ? { kind: picked.kind, key: r.item.split(":")[1]! } : null,
      quantity: Number(r.quantity) > 0 ? Number(r.quantity) : null,
      taxable: paise(r.taxable) ?? 0,
      rate: noGst ? 0 : Number(r.rate) || 0,
      credit: r.credit,
      ...(noGst
        ? zero
        : intra
          ? { ...zero, cgst: head(r, "cgst"), sgst: head(r, "sgst") }
          : { ...zero, igst: head(r, "igst") }),
    };
  });
  const costs = billCosts(drafts);
  const goodsCredit = freightCredit(drafts);

  const field = (error?: string) =>
    `w-full rounded-lg border bg-cream px-3 py-2 font-body text-sm text-forest outline-none focus:border-forest ${
      error ? "border-terracotta" : "border-forest/25"
    }`;
  const label = "font-body text-xs font-medium uppercase tracking-wider text-stone";

  const rowError = rows.map((_, i) =>
    ["category", "item", "description", "quantity", "taxable", "rate", "igst", "cgst", "sgst", "credit"]
      .map((f) => errorFor(`${f}.${i}`))
      .find(Boolean),
  );

  if (vendors.length === 0) return <p className="font-body text-sm text-terracotta">{t("noVendors")}</p>;

  return (
    <>
      <NewItemDialog
        open={adding !== null}
        vendorId={vendorId}
        suggestions={suggestions}
        onClose={() => setAdding(null)}
        onAdded={(item) => {
          setItems((xs) =>
            [...xs, item].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)),
          );
          setLinked((ls) => [...ls, item.value]);
          if (adding !== null) set(adding, { item: item.value, description: item.label });
          setAdding(null);
        }}
      />
      <form action={action} onSubmit={keepFields(action)} noValidate className="space-y-6">
        {bill && <input type="hidden" name="id" value={bill.id} />}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label={t("vendor")}
            name="vendorId"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            options={[
              { value: "", label: t("vendorPick") },
              ...vendors.map((v) => ({ value: v.id, label: v.name })),
            ]}
            hint={vendor ? t(`vendorKind.${vendor.kind}`) : undefined}
            error={errorFor("vendorId")}
          />
          <TextField
            label={t("number")}
            name="number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            maxLength={40}
            hint={t("numberHint")}
            error={errorFor("number")}
          />
          <label className="block">
            <span className={label}>{t("date")}</span>
            <input
              type="date"
              name="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`mt-1.5 ${field(errorFor("date"))}`}
            />
            {errorFor("date") && (
              <span className="mt-1 block font-body text-[11px] text-terracotta">{errorFor("date")}</span>
            )}
          </label>
          <label className="block">
            <span className={label}>{t("paidOn")}</span>
            <input
              type="date"
              name="paidOn"
              max={today}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className={`mt-1.5 ${field(errorFor("paidOn"))}`}
            />
            <span
              className={`mt-1 block font-body text-[11px] ${errorFor("paidOn") ? "text-terracotta" : "text-stone"}`}
            >
              {errorFor("paidOn") ?? t("paidOnHint")}
            </span>
          </label>
        </div>

        {vendor && vendor.kind !== "foreign" && (
          <label className="flex items-start gap-2 font-body text-sm text-forest">
            <input
              type="checkbox"
              name="reverseCharge"
              checked={reverseCharge}
              onChange={(e) => setReverseCharge(e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              {t("reverseCharge")}
              <span className="block text-xs text-stone">{t("reverseChargeHint")}</span>
            </span>
          </label>
        )}
        {vendor?.kind === "foreign" && <p className="font-body text-sm text-stone">{t("foreignNote")}</p>}
        {noGst && <p className="font-body text-sm text-stone">{t("unregisteredNote")}</p>}

        <fieldset className="space-y-3">
          <legend className="font-display text-base font-semibold text-forest">{t("lines")}</legend>
          {rows.some((r) => r.category === "stock") && (!vendor || suppliesNothing) && (
            <p className="font-body text-xs text-stone">
              {vendor ? t("suppliesNothing", { vendor: vendor.name }) : t("vendorFirst")}
            </p>
          )}
          {rows.map((row, i) => {
            const w = worked(row);
            const stock = row.category === "stock";
            const kind = items.find((x) => x.value === row.item)?.kind;
            /* Shipping takes the credit of the goods it brought, and keeps
               following them as lines change until one is picked by hand. */
            const credit = row.category === "freight" && !row.creditTouched ? goodsCredit : row.credit;
            const taxed = !noGst && Number(row.rate) > 0;
            return (
              <div key={row.uid} className="rounded-xl border border-forest/15 p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(12rem,1.4fr)_minmax(12rem,2fr)_2rem]">
                  <SelectField
                    compact
                    label={t("category")}
                    name="category"
                    value={row.category}
                    onChange={(e) => {
                      const category = e.target.value as PurchaseCategory;
                      set(row.uid, {
                        category,
                        ...(category !== "stock" ? { item: "" } : {}),
                        ...(row.creditTouched ? {} : { credit: DEFAULT_CREDIT[category] }),
                      });
                    }}
                    options={PURCHASE_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
                    error={errorFor(`category.${i}`)}
                  />
                  {stock ? (
                    <SelectField
                      compact
                      label={t("item")}
                      name="item"
                      value={row.item}
                      onChange={(e) => {
                        if (e.target.value === NEW_ITEM) {
                          setAdding(row.uid);
                          return;
                        }
                        const picked = items.find((x) => x.value === e.target.value);
                        set(row.uid, {
                          item: e.target.value,
                          ...(row.description === "" && picked ? { description: picked.label } : {}),
                        });
                      }}
                      options={[
                        { value: "", label: t("itemPick") },
                        ...offered(row.item).map((x) => ({
                          value: x.value,
                          label: `${t(`itemGroups.${x.kind}`)} · ${x.label}`,
                        })),
                        ...(vendor ? [{ value: NEW_ITEM, label: t("newItem.option") }] : []),
                      ]}
                      error={errorFor(`item.${i}`)}
                    />
                  ) : (
                    <input type="hidden" name="item" value="" />
                  )}
                  <div className={stock ? "" : "sm:col-span-2"}>
                    <TextField
                      compact
                      label={t("description")}
                      name="description"
                      placeholder={t("descriptionPlaceholder")}
                      value={row.description}
                      onChange={(e) => set(row.uid, { description: e.target.value })}
                      error={errorFor(`description.${i}`)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== row.uid) : [blankRow()]))
                    }
                    aria-label={t("removeLine", { row: i + 1 })}
                    title={t("removeLine", { row: i + 1 })}
                    className="flex size-8 items-center justify-center justify-self-end rounded-full text-stone transition-colors hover:bg-terracotta/10 hover:text-terracotta"
                  >
                    <X size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(6,minmax(0,1fr))]">
                  <label className="block">
                    <span className="font-body text-[11px] text-stone">
                      {t("quantity")} {stock && kind ? `(${t(`quantityUnit.${kind}`)})` : ""}
                    </span>
                    <NumberField
                      compact
                      label={t("quantity")}
                      name="quantity"
                      inputMode={stock ? "numeric" : "decimal"}
                      value={row.quantity}
                      onChange={(e) => set(row.uid, { quantity: e.target.value })}
                      error={errorFor(`quantity.${i}`)}
                    />
                  </label>
                  <label className="block">
                    <span className="font-body text-[11px] text-stone">{t("taxable")}</span>
                    <NumberField
                      compact
                      label={t("taxable")}
                      name="taxable"
                      value={row.taxable}
                      onChange={(e) => retax(row.uid, { taxable: e.target.value })}
                      error={errorFor(`taxable.${i}`)}
                    />
                  </label>
                  <label className="block">
                    <span className="font-body text-[11px] text-stone">{t("rate")}</span>
                    {noGst ? (
                      <>
                        <input type="hidden" name="rate" value="0" />
                        <span className="block py-2 font-body text-sm text-stone">{t("noGstRate")}</span>
                      </>
                    ) : (
                      <SelectField
                        compact
                        label={t("rate")}
                        name="rate"
                        value={row.rate}
                        onChange={(e) => retax(row.uid, { rate: e.target.value })}
                        options={PURCHASE_RATES.map((r) => ({
                          value: String(r),
                          label: r === 0 ? t("rateExempt") : `${r}%`,
                        }))}
                        error={errorFor(`rate.${i}`)}
                      />
                    )}
                  </label>
                  {/* A line with no GST has no tax to type and no credit to
                      use, so neither is offered. Its columns still post, empty,
                      because the form reads each column by line position. */}
                  {(intra ? (["cgst", "sgst"] as const) : (["igst"] as const)).map((h) =>
                    taxed ? (
                      <label key={h} className="block">
                        <span className="font-body text-[11px] text-stone">{t(h)}</span>
                        <NumberField
                          compact
                          label={t(h)}
                          name={h}
                          placeholder={rupees(w[h])}
                          value={row[h]}
                          onChange={(e) => set(row.uid, { [h]: e.target.value } as Partial<Row>)}
                          error={errorFor(`${h}.${i}`)}
                        />
                      </label>
                    ) : (
                      <input key={h} type="hidden" name={h} value="" />
                    ),
                  )}
                  {taxed ? (
                    <label className={`block ${intra ? "" : "sm:col-span-2"}`}>
                      <span className="font-body text-[11px] text-stone">{t("credit")}</span>
                      <SelectField
                        compact
                        label={t("credit")}
                        name="credit"
                        value={credit}
                        onChange={(e) =>
                          set(row.uid, { credit: e.target.value as CreditUse, creditTouched: true })
                        }
                        options={CREDIT_USES.map((c) => ({ value: c, label: t(`credits.${c}`) }))}
                        error={errorFor(`credit.${i}`)}
                      />
                    </label>
                  ) : (
                    <input type="hidden" name="credit" value="none" />
                  )}
                </div>
                {stock && kind && costs.has(row.item) && (
                  <p className="mt-2 font-body text-[11px] text-forest">
                    {t("costPreview", {
                      amount: costs.get(row.item)! / 100,
                      unit: t(`costUnit.${kind}`),
                    })}
                  </p>
                )}
                {row.category === "freight" && (
                  <p className="mt-2 font-body text-[11px] text-stone">{t("freightHint")}</p>
                )}
                {rowError[i] && <p className="mt-2 font-body text-[11px] text-terracotta">{rowError[i]}</p>}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, blankRow()])}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage/60"
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            {t("addLine")}
          </button>
          {!noGst && <p className="font-body text-[11px] text-stone">{t("taxHint")}</p>}
        </fieldset>

        <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 font-body text-sm text-forest">
          <dt className="text-stone">{t("totalTaxable")}</dt>
          <dd className="text-right tabular-nums">{money(totals.taxable)}</dd>
          {/* Under reverse charge the vendor's bill carries no GST: it totals
              the value, and the tax is ours to pay the government, apart. */}
          {rc ? (
            <>
              <dt className="border-t border-forest/20 pt-1 font-semibold">{t("total")}</dt>
              <dd className="border-t border-forest/20 pt-1 text-right font-semibold tabular-nums">
                {money(totals.taxable)}
              </dd>
              <dt className="text-stone">{t("totalTaxRc")}</dt>
              <dd className="text-right tabular-nums text-stone">{money(totals.tax)}</dd>
            </>
          ) : (
            <>
              <dt className="text-stone">{t("totalTax")}</dt>
              <dd className="text-right tabular-nums">{money(totals.tax)}</dd>
              <dt className="border-t border-forest/20 pt-1 font-semibold">{t("total")}</dt>
              <dd className="border-t border-forest/20 pt-1 text-right font-semibold tabular-nums">
                {money(totals.taxable + totals.tax)}
              </dd>
            </>
          )}
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>{t("file")}</span>
            <input
              ref={fileInput}
              type="file"
              name="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-1.5 block w-full font-body text-sm text-forest file:mr-3 file:rounded-full file:border-0 file:bg-forest file:px-4 file:py-2 file:font-body file:text-sm file:font-semibold file:text-cream"
            />
            <span
              className={`mt-1 block font-body text-[11px] ${errorFor("file") ? "text-terracotta" : "text-stone"}`}
            >
              {errorFor("file") ?? t("fileHint")}
            </span>
            {bill?.file && (
              <span className="mt-2 flex flex-wrap items-center gap-3 font-body text-sm">
                <a
                  href={`/api/admin/bills/${bill.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-forest underline underline-offset-4 hover:text-stone"
                >
                  {t("fileCurrent", { name: bill.file.name })}
                </a>
                <label className="flex items-center gap-1.5 text-stone">
                  <input type="checkbox" name="removeFile" className="size-4" />
                  {t("removeFile")}
                </label>
              </span>
            )}
          </label>
          <TextField
            label={t("notes")}
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
          >
            {bill ? tc("save") : t("saveNew")}
          </button>
          {bill && state.status === "saved" && !pending && (
            <p role="status" className="font-body text-sm text-forest">
              {t("saved")}
            </p>
          )}
          {state.status === "error" && !state.field && (
            <p role="alert" className="font-body text-sm text-terracotta">
              {t(`errors.${state.code}`, state.values ?? {})}
            </p>
          )}
        </div>
      </form>
    </>
  );
}
