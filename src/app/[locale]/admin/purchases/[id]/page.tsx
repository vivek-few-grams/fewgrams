import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { requireRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { monthOf, monthOfDate, nextMonth } from "@/lib/gst/period";
import { isLockedBill, isLockedMonth } from "@/lib/gst/quarter";
import { billStatus, claimable, docOf, isCreditNote, signedTotals } from "@/lib/purchases/bill";
import { listFilings } from "@/lib/repo/gst";
import { getBill } from "@/lib/repo/purchases";
import { BillEditor } from "../BillEditor";
import { ClaimForm } from "../ClaimForm";
import { removeBill } from "../actions";
import { billFormOptions } from "../load";

export const dynamic = "force-dynamic";

/**
 * `/admin/purchases/[id]` — one bill: correct it, see where its credit
 * stands, claim it by hand, or delete it (SPEC §26.6). A bill in a quarter
 * whose GSTR-3B is filed — claimed there, or dated there with a 0% line its
 * table 5 reports (`isLockedBill`) — is shown, not edited. Only the first
 * also closes its claim: a seed bill dated in a filed quarter may still have
 * credit (its shipping) waiting for an open month.
 *
 * A vendor's credit note opens here too, said to be one: its total with a
 * minus, the bill it is against, and "taken off credit" where a bill says
 * "claimed".
 */
export default async function BillPage({ params }: PageProps<"/[locale]/admin/purchases/[id]">) {
  await requireRole("admin");
  const { id, locale } = await params;
  const bill = await getBill(id);
  if (!bill) notFound();

  const t = await getTranslations("admin.purchases");
  const tc = await getTranslations("admin.common");
  const format = await getFormatter();
  const [{ vendors, items, suggestions, bills }, filings] = await Promise.all([
    billFormOptions(bill.vendor.id),
    listFilings(),
  ]);
  const claimLocked = !!bill.claim && isLockedMonth(filings, bill.claim.month);
  const locked = isLockedBill(filings, bill);
  const status = billStatus(bill);
  const note = isCreditNote(bill);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00+05:30`), { dateStyle: "medium" });
  const monthLabel = (m: string) =>
    format.dateTime(new Date(`${m}-01T00:00:00+05:30`), { month: "long", year: "numeric" });
  const money = (paise: number) =>
    format.number(paise / 100, { style: "currency", currency: "INR", minimumFractionDigits: 2 });

  /* A claim can go in any open month from the bill's own to this one. */
  const months: { value: string; label: string }[] = [];
  for (let m = monthOfDate(bill.date), now = monthOf(new Date()); m <= now; m = nextMonth(m)) {
    if (!isLockedMonth(filings, m)) months.push({ value: m, label: monthLabel(m) });
  }

  return (
    <div className="space-y-8">
      <Link
        href="/admin/purchases"
        className="font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
      >
        {t("back")}
      </Link>
      <section>
        <p className="font-body text-xs uppercase tracking-wider text-stone">{bill.vendor.name}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-forest">
          {note ? t("editNoteTitle", { number: bill.number }) : t("editTitle", { number: bill.number })}
        </h1>
        <p className="mt-2 font-body text-sm text-forest">
          {note && `${money(signedTotals(bill).gross)} · `}
          {note ? t(`noteStatus.${status}`) : t(`status.${status}`)}
          {bill.claim && ` · ${t("claimedIn", { month: monthLabel(bill.claim.month) })}`}
        </p>
        {note && bill.against && (
          <p className="mt-1 font-body text-sm text-stone">
            <Link
              href={`/admin/purchases/${bill.against.id}`}
              className="underline underline-offset-4 hover:text-forest"
            >
              {t("againstBill", { number: bill.against.number, date: day(bill.against.date) })}
            </Link>
          </p>
        )}
        {status === "withdrawn" && bill.withdrawnAt && (
          <p className="mt-1 font-body text-sm text-stone">
            {t("withdrawnNote", {
              doc: docOf(bill),
              /* A moment, not a calendar date: printed in IST, the
                 formatter's zone, so a late-evening withdrawal is not dated
                 the day before. */
              date: format.dateTime(new Date(bill.withdrawnAt), { dateStyle: "medium" }),
            })}
          </p>
        )}
        {bill.match && (
          <p
            className={`mt-1 font-body text-sm ${bill.match.status === "mismatch" ? "text-terracotta" : "text-stone"}`}
          >
            {t(bill.match.status === "mismatch" ? "portalMismatch" : "portalMatched", {
              doc: docOf(bill),
              month: monthLabel(bill.match.month),
              taxable: money(bill.match.portal.taxable),
              tax: money(bill.match.portal.igst + bill.match.portal.cgst + bill.match.portal.sgst),
            })}
          </p>
        )}
      </section>

      {locked && (
        <p className="rounded-xl bg-sand/60 px-4 py-3 font-body text-sm text-forest">
          {t(claimLocked ? "lockedNote" : "lockedDateNote")}
        </p>
      )}
      {!claimLocked && claimable(bill) && !bill.reverseCharge && (
        <section className="rounded-2xl border border-forest/15 p-6">
          <h2 className="font-display text-lg font-semibold text-forest">
            {note ? t("claimTitleNote") : t("claimTitle")}
          </h2>
          <p className="mb-4 mt-1 font-body text-sm text-stone">
            {note ? t("claimHintNote") : t("claimHint")}
          </p>
          <ClaimForm billId={bill.id} months={months} current={bill.claim?.month ?? null} note={note} />
        </section>
      )}
      {!locked && (
        <>
          <section className="rounded-2xl border border-forest/15 p-6">
            <BillEditor
              vendors={vendors}
              items={items}
              suggestions={suggestions}
              bills={bills}
              bill={bill}
              today={istDateISO(new Date())}
            />
          </section>
          <form action={removeBill}>
            <input type="hidden" name="id" value={bill.id} />
            <input type="hidden" name="locale" value={locale} />
            <ConfirmSubmit
              label={note ? t("deleteNote") : t("deleteBill")}
              title={note ? t("deleteNoteTitle") : t("deleteTitle")}
              message={t(note ? "deleteNoteConfirm" : "deleteConfirm", {
                number: bill.number,
                vendor: bill.vendor.name,
              })}
              confirmLabel={tc("confirmDelete")}
              cancelLabel={tc("cancel")}
              className="font-body text-sm text-terracotta underline underline-offset-4 hover:text-terracotta/80"
            />
          </form>
        </>
      )}
    </div>
  );
}
