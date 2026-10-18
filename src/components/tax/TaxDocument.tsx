import { getFormatter, getTranslations } from "next-intl/server";
import { formatPlace } from "@/lib/account/validation";
import { BUSINESS } from "@/lib/content/legal";
import type { OrderAddress } from "@/lib/orders/order";
import { taxTotals, type Buyer, type TaxRow } from "@/lib/tax/order-tax";
import { HOME_STATE, type GstState } from "@/lib/tax/states";
import { PrintButton } from "./PrintButton";

/** One goods row: what it was, how many, and its tax row. */
export type DocLine = { key: string; name: string; quantity: string | null; row: TaxRow };

export type SheetProps = {
  /** An invoice-cum-bill of supply, or the credit note that reverses one. */
  kind: "invoice" | "creditNote";
  number: string;
  /** ISO instant; shown as the IST date. */
  issuedAt: string;
  /** The order or subscription it is for, and how to label it. */
  reference: { label: "order" | "subscription"; id: string };
  /** A credit note names the invoice it reverses (Rule 53). */
  against: { number: string; issuedAt: string } | null;
  address: OrderAddress;
  buyer: Buyer | null;
  placeOfSupply: GstState | null;
  lines: DocLine[];
  /** Every row, delivery included — the totals and delivery lines come from
   *  here, so they cannot disagree with what was stored. */
  tax: TaxRow[];
  /** Adds "supplied for sowing" — the condition of the seeds exemption. */
  hasSeeds: boolean;
};

/**
 * Every delivery row as one line (the owner, 18 Oct 2026: "1 delivery cost +
 * gst", not one per rate). The rows stay split per HSN and rate in `order.tax`
 * — the charge follows the goods it carries (SPEC §26.2) and the returns
 * report it that way — and only the document sums them. The HSN and rate are
 * printed when they are one; a mix shows "Mixed", and a note says why.
 */
function deliveryLine(rows: TaxRow[]) {
  const parts = rows.filter((r) => r.source === "delivery");
  if (parts.length === 0) return null;
  const sum = (k: "gross" | "taxable" | "cgst" | "sgst" | "igst") => parts.reduce((n, r) => n + r[k], 0);
  const hsns = new Set(parts.map((r) => r.hsn));
  const rates = new Set(parts.map((r) => r.rate));
  return {
    hsn: hsns.size === 1 ? parts[0].hsn : null,
    rate: rates.size === 1 ? parts[0].rate : null,
    taxed: parts.some((r) => r.rate > 0),
    gross: sum("gross"),
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
  };
}

/** No GST on any row: exempt goods alone, which take a bill of supply
 *  (CGST Rule 49) — no tax charged, so no tax columns and no tax notes. */
function isBillOfSupply(tax: TaxRow[]): boolean {
  return !tax.some((r) => r.rate > 0);
}

/** What a saved PDF is called — the browser names it after the page title,
 *  and a file name cannot hold the number's slashes. */
export async function docFileName(p: Pick<SheetProps, "kind" | "number" | "tax">): Promise<string> {
  const t = await getTranslations("account.orders.invoice");
  const number = p.number.replaceAll("/", "-");
  if (p.kind === "creditNote") return t("fileCreditNote", { number });
  return isBillOfSupply(p.tax) ? t("fileBill", { number }) : t("fileInvoice", { number });
}

/**
 * A button that opens the print dialog on a tax document, and the document
 * itself, kept on the page out of sight — there is no page to view it on
 * (the owner, 18 Oct 2026: "can't we just show the print view on click",
 * for customers and admin alike). The order page, the subscriptions list and
 * the admin order and subscription screens all use it. The button and the
 * sheet meet on `id`; the browser's "Save as PDF" is the download.
 */
export async function PrintDoc({ id, label, ...p }: SheetProps & { id: string; label: string }) {
  return (
    <>
      <PrintButton label={label} target={id} fileName={await docFileName(p)} />
      <div className="print-doc">
        <TaxDocument {...p} id={id} />
      </div>
    </>
  );
}

/**
 * The printable tax document — SPEC §26.3. One component for the order
 * invoice, the subscription invoice and the credit note, so the three cannot
 * drift apart in what they state.
 *
 * Renders only what it is given: every figure comes from tax rows stored at
 * checkout, never recomputed, so a later rate change cannot rewrite a
 * document already issued. Marked `data-printing` while its button has the
 * print dialog open, which makes it the only thing that prints
 * (`globals.css`).
 */
async function TaxDocument({ id, ...p }: SheetProps & { id: string }) {
  const t = await getTranslations("account.orders.invoice");
  const format = await getFormatter();
  const money = (paise: number) =>
    format.number(paise / 100, { style: "currency", currency: "INR", minimumFractionDigits: 2 });
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  const rate = (r: number) => (r === 0 ? t("exempt") : t("rate", { rate: r }));
  const credit = p.kind === "creditNote";

  const intra = p.placeOfSupply?.code === HOME_STATE.code;
  const delivery = deliveryLine(p.tax);
  const totals = taxTotals(p.tax);
  const hasExempt = p.tax.some((r) => r.rate === 0);
  /* What the document is depends on what it covers (CGST Rules 46, 46A,
     49): exempt goods alone take a bill of supply, taxable goods alone a tax
     invoice, and the two together one invoice-cum-bill of supply. A bill of
     supply charges no tax, so it says so by leaving tax out — no rate or
     tax columns, no tax totals, no "includes GST" (the owner, 18 Oct 2026:
     a greens order printed CGST ₹0.00 on every row). A credit note against
     one follows it. */
  const bill = isBillOfSupply(p.tax);
  const title = credit ? t("creditHeading") : bill ? t("billOfSupply") : t("heading");
  const subtitle = credit ? t("creditKind") : !bill && hasExempt ? t("kind") : null;
  const a = p.address;
  const street = [a.line1, a.line2, a.landmark].filter(Boolean).join(", ");

  /* Figures never wrap — "100 ಗ್ರಾಂ" broke over two lines in Kannada. Headings may. */
  const cell = "whitespace-nowrap px-2 py-2 text-right tabular-nums";
  const head = "px-2 py-2 text-right font-semibold";
  const taxCells = (r: Pick<TaxRow, "cgst" | "sgst" | "igst">) =>
    intra ? (
      <>
        <td className={cell}>{money(r.cgst)}</td>
        <td className={cell}>{money(r.sgst)}</td>
      </>
    ) : (
      <td className={cell}>{money(r.igst)}</td>
    );

  return (
    <article
      id={id}
      className="invoice-sheet rounded-2xl border border-forest/15 bg-white p-5 font-body text-sm text-ink md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-forest/15 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs uppercase tracking-wider text-stone">{subtitle}</p>}
        </div>
        <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right">
          <dt className="text-stone">{credit ? t("creditNumber") : bill ? t("billNumber") : t("number")}</dt>
          <dd className="font-semibold tabular-nums">{p.number}</dd>
          <dt className="text-stone">{credit ? t("creditDate") : bill ? t("billDate") : t("date")}</dt>
          <dd className="tabular-nums">{date(p.issuedAt)}</dd>
          {p.against && (
            <>
              <dt className="text-stone">{t("against")}</dt>
              <dd className="tabular-nums">
                {t("againstValue", { number: p.against.number, date: date(p.against.issuedAt) })}
              </dd>
            </>
          )}
          <dt className="text-stone">{t(p.reference.label)}</dt>
          <dd className="tabular-nums">{p.reference.id}</dd>
        </dl>
      </header>

      <div className="grid gap-6 border-b border-forest/15 py-5 sm:grid-cols-2">
        <section>
          <h2 className="text-xs uppercase tracking-wider text-stone">{t("soldBy")}</h2>
          <p className="mt-1 font-semibold">{BUSINESS.tradingName}</p>
          <p>{t("proprietor", { name: BUSINESS.proprietor })}</p>
          <p>{BUSINESS.address}</p>
          <p className="mt-1 font-semibold">{t("gstin", { gstin: BUSINESS.gstin })}</p>
        </section>
        <section>
          <h2 className="text-xs uppercase tracking-wider text-stone">{t("billTo")}</h2>
          <p className="mt-1 font-semibold">{a.recipient}</p>
          {p.buyer && (
            <>
              <p>{t("business", { name: p.buyer.name })}</p>
              <p className="font-semibold">{t("gstin", { gstin: p.buyer.gstin })}</p>
            </>
          )}
          <p>{street}</p>
          <p>{formatPlace(a)}</p>
          <p className="mt-1">
            <span className="text-stone">{t("placeOfSupply")}: </span>
            {p.placeOfSupply
              ? t("place", { state: p.placeOfSupply.name, code: p.placeOfSupply.code })
              : a.state}
          </p>
        </section>
      </div>

      <div className="-mx-2 overflow-x-auto py-5">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-forest/25 text-xs text-stone">
              <th className="px-2 py-2 text-left font-semibold">{t("colItem")}</th>
              <th className="px-2 py-2 text-left font-semibold">{t("colHsn")}</th>
              <th className={head}>{t("colQty")}</th>
              {!bill && (
                <>
                  <th className={head}>{t("colTaxable")}</th>
                  <th className={head}>{t("colRate")}</th>
                  {intra ? (
                    <>
                      <th className={head}>{t("colCgst")}</th>
                      <th className={head}>{t("colSgst")}</th>
                    </>
                  ) : (
                    <th className={head}>{t("colIgst")}</th>
                  )}
                </>
              )}
              <th className={head}>{t("colAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map(({ key, name, quantity, row }) => (
              <tr key={key} className="border-b border-forest/10 align-top">
                <td className="px-2 py-2">{name}</td>
                <td className="px-2 py-2 tabular-nums">{row.hsn}</td>
                <td className={cell}>{quantity}</td>
                {!bill && (
                  <>
                    <td className={cell}>{money(row.taxable)}</td>
                    <td className={cell}>{rate(row.rate)}</td>
                    {taxCells(row)}
                  </>
                )}
                <td className={cell}>{money(row.gross)}</td>
              </tr>
            ))}
            {delivery && (
              <tr className="border-b border-forest/10 align-top">
                <td className="px-2 py-2">{t("delivery")}</td>
                <td className="px-2 py-2 tabular-nums">{delivery.hsn}</td>
                <td className={cell} />
                {!bill && (
                  <>
                    <td className={cell}>{money(delivery.taxable)}</td>
                    <td className={cell}>{delivery.rate === null ? t("rateMixed") : rate(delivery.rate)}</td>
                    {taxCells(delivery)}
                  </>
                )}
                <td className={cell}>{money(delivery.gross)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        {!bill && (
          <>
            <dt className="text-stone">{t("totalTaxable")}</dt>
            <dd className="text-right tabular-nums">{money(totals.taxable)}</dd>
            {intra ? (
              <>
                <dt className="text-stone">{t("totalCgst")}</dt>
                <dd className="text-right tabular-nums">{money(totals.cgst)}</dd>
                <dt className="text-stone">{t("totalSgst")}</dt>
                <dd className="text-right tabular-nums">{money(totals.sgst)}</dd>
              </>
            ) : (
              <>
                <dt className="text-stone">{t("totalIgst")}</dt>
                <dd className="text-right tabular-nums">{money(totals.igst)}</dd>
              </>
            )}
          </>
        )}
        <dt className="mt-1 border-t border-forest/25 pt-1 font-semibold">
          {credit ? t("creditTotal") : t("total")}
        </dt>
        <dd className="mt-1 border-t border-forest/25 pt-1 text-right font-display text-lg font-bold tabular-nums text-forest">
          {money(totals.gross)}
        </dd>
      </dl>

      <footer className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-forest/15 pt-5 text-xs text-stone">
        <section>
          <h2 className="font-semibold text-ink">{t("notesHeading")}</h2>
          <ul className="mt-1 space-y-0.5">
            {credit && <li>{t("creditReason")}</li>}
            {!bill && <li>{t("inclusive")}</li>}
            {hasExempt && <li>{t("exemptNote")}</li>}
            {delivery?.taxed && (
              <li>{delivery.rate === null ? t("deliveryNoteMixed") : t("deliveryNote")}</li>
            )}
            {p.hasSeeds && <li>{t("seedsForSowing")}</li>}
            {!bill && <li>{t("reverseCharge")}</li>}
            <li>{t("computer")}</li>
          </ul>
        </section>
        <p className="text-right">
          <span className="block font-semibold text-ink">{t("signFor", { name: BUSINESS.tradingName })}</span>
          <span className="mt-6 block">{t("signatory")}</span>
        </p>
      </footer>
    </article>
  );
}
