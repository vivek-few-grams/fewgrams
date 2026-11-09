import { getFormatter, getTranslations } from "next-intl/server";
import { FileText, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { isMonthId, monthOfDate } from "@/lib/gst/period";
import {
  billStatus,
  isCreditNote,
  owesPayBy,
  payBy,
  signedTotals,
  type BillStatus,
} from "@/lib/purchases/bill";
import { daysBetween } from "@/lib/purchases/dates";
import { decodeShortfall } from "@/lib/purchases/shortfall";
import { listBills } from "@/lib/repo/purchases";
import { stockItemNames } from "./load";
import { ShortfallNotice } from "./ShortfallNotice";

export const dynamic = "force-dynamic";

const STATUSES: BillStatus[] = ["waiting", "mismatch", "claimed", "withdrawn", "reverseCharge", "noGst"];

const CHIP: Record<BillStatus, string> = {
  waiting: "bg-sand text-forest",
  mismatch: "bg-terracotta/15 text-terracotta",
  claimed: "bg-forest text-cream",
  withdrawn: "bg-stone/15 text-stone",
  reverseCharge: "bg-forest/80 text-cream",
  noGst: "bg-sand text-stone",
};

/**
 * `/admin/purchases` — the purchase register, SPEC §26.6. Every vendor bill,
 * newest first, with where its credit stands: waiting for the vendor to
 * file, claimed in a month's GSTR-2B, reported differently by the vendor, or
 * carrying no GST at all. Filter by bill month or by that standing.
 *
 * Two warnings ride on the list: a bill the vendor has still not filed, and
 * one not yet paid as its 180 days run out (CGST Act s.16(2)). After a
 * delete, a third: stock the bill could not take back off the shelf, carried
 * here as `?short=` because the bill's own page is gone — or, with `saved`,
 * stock a new credit note could not take off.
 *
 * A vendor's credit note is listed among the bills, said to be one, its
 * amounts with a minus and counted against the totals. One the portal does
 * not show yet is its own note: nothing to chase, but its GST has not come
 * off the credit yet. A claim withdrawn by hand is neither.
 */
export default async function PurchasesAdmin({ searchParams }: PageProps<"/[locale]/admin/purchases">) {
  await requireRole("admin");
  const t = await getTranslations("admin.purchases");
  const format = await getFormatter();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isMonthId(sp.month) ? sp.month : "";
  const status =
    typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)
      ? (sp.status as BillStatus)
      : "";

  const short = decodeShortfall(typeof sp.short === "string" ? sp.short : null);
  const [all, names] = await Promise.all([listBills(), short.length ? stockItemNames() : null]);
  const today = istDateISO(new Date());
  const bills = all.filter(
    (b) => (!month || monthOfDate(b.date) === month) && (!status || billStatus(b) === status),
  );
  const months = [...new Set(all.map((b) => monthOfDate(b.date)))].sort().reverse();
  const money = (paise: number) =>
    format.number(paise / 100, { style: "currency", currency: "INR", minimumFractionDigits: 2 });
  const monthLabel = (m: string) =>
    format.dateTime(new Date(`${m}-01T00:00:00+05:30`), { month: "long", year: "numeric" });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00+05:30`), { dateStyle: "medium" });

  const sum = bills.reduce(
    (a, b) => {
      const x = signedTotals(b);
      return { taxable: a.taxable + x.taxable, tax: a.tax + x.igst + x.cgst + x.sgst };
    },
    { taxable: 0, tax: 0 },
  );
  const notes = bills.filter(isCreditNote).length;
  const waiting = all.filter((b) => billStatus(b) === "waiting" && !isCreditNote(b)).length;
  const waitingNotes = all.filter((b) => billStatus(b) === "waiting" && isCreditNote(b)).length;
  const unpaidSoon = all.filter((b) => owesPayBy(b) && !b.paidOn && daysBetween(today, payBy(b)) <= 30);

  const filterLink = (q: { month?: string; status?: string }) => {
    const p = new URLSearchParams();
    const m = q.month ?? month;
    const s = q.status ?? status;
    if (m) p.set("month", m);
    if (s) p.set("status", s);
    const qs = p.toString();
    return `/admin/purchases${qs ? `?${qs}` : ""}`;
  };
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
      active ? "bg-forest text-cream" : "border border-forest/25 text-forest hover:bg-forest/5"
    }`;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
          <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/purchases/new?doc=creditNote"
            className="inline-flex items-center gap-2 rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5"
          >
            <Plus aria-hidden size={16} strokeWidth={2} />
            {t("newNote")}
          </Link>
          <Link
            href="/admin/purchases/new"
            className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            <Plus aria-hidden size={16} strokeWidth={2} />
            {t("newBill")}
          </Link>
        </div>
      </section>

      {short.length > 0 && (
        <ShortfallNotice
          title={sp.saved === "1" ? t("shortfall.savedNew") : t("shortfall.deleted")}
          lines={short.map((s) =>
            t("shortfall.line", { item: names?.[s.kind][s.key] ?? s.key, kind: s.kind, short: s.short }),
          )}
        />
      )}

      {(waiting > 0 || waitingNotes > 0 || unpaidSoon.length > 0) && (
        <section className="space-y-2">
          {waiting > 0 && (
            <p className="rounded-xl bg-sand/60 px-4 py-3 font-body text-sm text-forest">
              {t("waitingNote", { count: waiting })}{" "}
              <Link
                href={filterLink({ status: "waiting", month: "" })}
                className="font-semibold underline underline-offset-4"
              >
                {t("showThem")}
              </Link>
            </p>
          )}
          {waitingNotes > 0 && (
            <p className="rounded-xl bg-sand/40 px-4 py-3 font-body text-sm text-forest">
              {t("waitingNotesNote", { count: waitingNotes })}
            </p>
          )}
          {unpaidSoon.map((b) => (
            <p key={b.id} className="rounded-xl bg-terracotta/10 px-4 py-3 font-body text-sm text-terracotta">
              {t("payByNote", { vendor: b.vendor.name, number: b.number, date: day(payBy(b)) })}{" "}
              <Link href={`/admin/purchases/${b.id}`} className="font-semibold underline underline-offset-4">
                {t("open")}
              </Link>
            </p>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body text-xs uppercase tracking-wider text-stone">{t("filterMonth")}</span>
          <Link href={filterLink({ month: "" })} className={pill(!month)}>
            {t("all")}
          </Link>
          {months.map((m) => (
            <Link key={m} href={filterLink({ month: m })} className={pill(month === m)}>
              {monthLabel(m)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body text-xs uppercase tracking-wider text-stone">{t("filterStatus")}</span>
          <Link href={filterLink({ status: "" })} className={pill(!status)}>
            {t("all")}
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={filterLink({ status: s })} className={pill(status === s)}>
              {t(`status.${s}`)}
            </Link>
          ))}
        </div>
      </section>

      {bills.length === 0 ? (
        <p className="font-body text-sm text-stone">{all.length === 0 ? t("empty") : t("emptyFiltered")}</p>
      ) : (
        /* Cards below `lg` (`.stack-table`, globals.css): each cell's
           `data-label` is the heading it sits under, and the file link, which
           has none, is left off a card when the bill has no file (9 Nov 2026). */
        <div className="lg:overflow-x-auto lg:rounded-2xl lg:border lg:border-forest/15">
          <table className="stack-table w-full min-w-[56rem] font-body text-sm">
            <thead className="bg-forest/5">
              <tr className="text-left text-[11px] uppercase tracking-wider text-stone">
                <th className="px-4 py-2.5 font-medium">{t("colDate")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colVendor")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colNumber")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("colTaxable")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("colTax")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colPaid")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="text-forest">
              {bills.map((b) => {
                const x = signedTotals(b);
                const s = billStatus(b);
                const note = isCreditNote(b);
                return (
                  <tr key={b.id} className="border-t border-forest/10 align-top">
                    <td data-label={t("colDate")} className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {day(b.date)}
                    </td>
                    <td data-label={t("colVendor")} className="px-4 py-2.5">
                      <Link
                        href={`/admin/purchases/${b.id}`}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {b.vendor.name}
                      </Link>
                      <span className="block text-[11px] text-stone">
                        {b.lines
                          .map((l) => t(`categories.${l.category}`))
                          .filter((c, i, a) => a.indexOf(c) === i)
                          .join(", ")}
                      </span>
                    </td>
                    <td data-label={t("colNumber")} className="px-4 py-2.5 tabular-nums">
                      {b.number}
                      {note && (
                        <span className="mt-1 block w-fit rounded-full border border-terracotta/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-terracotta">
                          {t("noteChip")}
                        </span>
                      )}
                    </td>
                    <td data-label={t("colTaxable")} className="px-4 py-2.5 text-right tabular-nums">
                      {money(x.taxable)}
                    </td>
                    <td data-label={t("colTax")} className="px-4 py-2.5 text-right tabular-nums">
                      {money(x.igst + x.cgst + x.sgst)}
                    </td>
                    <td data-label={t("colStatus")} className="px-4 py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CHIP[s]}`}>
                        {note ? t(`noteStatus.${s}`) : t(`status.${s}`)}
                      </span>
                      {b.claim && (
                        <span className="mt-1 block text-[11px] text-stone">
                          {t("claimedIn", { month: monthLabel(b.claim.month) })}
                        </span>
                      )}
                    </td>
                    <td data-label={t("colPaid")} className="px-4 py-2.5 text-[12px]">
                      {b.paidOn ? (
                        <span className="tabular-nums">{day(b.paidOn)}</span>
                      ) : owesPayBy(b) ? (
                        <span className="text-stone">{t("payBy", { date: day(payBy(b)) })}</span>
                      ) : (
                        <span className="text-stone">{note ? t("notSettled") : t("unpaid")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right max-lg:empty:!hidden">
                      {b.file && (
                        <a
                          href={`/api/admin/bills/${b.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t("viewFile", { number: b.number })}
                          title={t("viewFile", { number: b.number })}
                          className="inline-flex text-forest transition-colors hover:text-stone"
                        >
                          <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-forest/25 font-semibold text-forest">
              <tr>
                <td className="px-4 py-2.5" colSpan={3}>
                  {t("totalFor", { count: bills.length - notes, notes })}
                </td>
                <td data-label={t("colTaxable")} className="px-4 py-2.5 text-right tabular-nums">
                  {money(sum.taxable)}
                </td>
                <td data-label={t("colTax")} className="px-4 py-2.5 text-right tabular-nums">
                  {money(sum.tax)}
                </td>
                <td colSpan={3} className="max-lg:!hidden" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
