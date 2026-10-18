import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { matchStatement } from "@/lib/gst/gstr2b";
import { monthOfDate } from "@/lib/gst/period";
import type { QuarterView } from "@/lib/gst/quarter";
import { billTotals, billStatus, type PurchaseBill } from "@/lib/purchases/bill";
import type { StoredGstr2b } from "@/lib/repo/gst";
import { Figures, Section, formatters } from "./ui";
import { UploadForm } from "./UploadForm";

/**
 * Credit match — SPEC §26.5. The GSTR-2B statements uploaded for the
 * quarter's months, set against the purchase register:
 * - bills the vendor reported, as billed — claimed;
 * - bills the vendor reported differently — to check with them;
 * - bills not in any statement yet — the chase list;
 * - portal invoices with no bill — to record, or to reject in IMS.
 */
export async function MatchView({
  view,
  statements,
  bills,
}: {
  view: QuarterView;
  statements: StoredGstr2b[];
  bills: PurchaseBill[];
}) {
  const t = await getTranslations("admin.gst");
  const { money, month: monthLabel, date } = await formatters();
  const lastDay = `${view.months[2]}-31`;
  const results = statements.map((s) => ({ s, r: matchStatement(s, bills) }));
  const tax = (b: PurchaseBill) => {
    const x = billTotals(b.lines);
    return x.igst + x.cgst + x.sgst;
  };

  const mismatched = bills.filter((b) => billStatus(b) === "mismatch");
  const waiting = bills.filter((b) => billStatus(b) === "waiting" && b.date <= lastDay);
  const claimed = bills.filter((b) => b.claim && view.months.includes(b.claim.month));
  const billLink = (b: PurchaseBill) => (
    <Link href={`/admin/purchases/${b.id}`} className="font-semibold underline-offset-4 hover:underline">
      {b.vendor.name}
    </Link>
  );

  return (
    <div className="space-y-10">
      <Section title={t("match.uploadTitle")} hint={t("match.uploadHint")}>
        {view.locked ? <p className="font-body text-sm text-stone">{t("lockedNote")}</p> : <UploadForm />}
        <Figures
          head={[
            t("match.statement"),
            t("match.uploadedAt"),
            t("match.invoices"),
            t("match.matched"),
            t("match.unknown"),
          ]}
          empty={t("match.noStatements")}
          rows={results.map(({ s, r }) => [
            monthLabel(s.month),
            date(s.uploadedAt.slice(0, 10)),
            s.invoices.length,
            r.matched.length,
            r.unknown.length,
          ])}
        />
      </Section>

      <Section title={t("match.claimedTitle")} hint={t("match.claimedHint")}>
        <Figures
          head={[
            t("match.vendor"),
            t("match.bill"),
            t("match.billDate"),
            t("match.claimedIn"),
            t("match.tax"),
          ]}
          empty={t("match.none")}
          rows={claimed.map((b) => [
            billLink(b),
            b.number,
            date(b.date),
            monthLabel(b.claim!.month),
            money(tax(b)),
          ])}
        />
      </Section>

      <Section title={t("match.mismatchTitle")} hint={t("match.mismatchHint")}>
        <Figures
          head={[t("match.vendor"), t("match.bill"), t("match.ours"), t("match.theirs")]}
          empty={t("match.none")}
          rows={mismatched.map((b) => {
            const x = billTotals(b.lines);
            const p = b.match!.portal;
            return [
              billLink(b),
              b.number,
              `${money(x.taxable)} + ${money(x.igst + x.cgst + x.sgst)}`,
              `${money(p.taxable)} + ${money(p.igst + p.cgst + p.sgst)}`,
            ];
          })}
        />
      </Section>

      <Section title={t("match.waitingTitle")} hint={t("match.waitingHint")}>
        <Figures
          head={[t("match.vendor"), t("match.bill"), t("match.billDate"), t("match.tax"), t("match.age")]}
          empty={t("match.none")}
          rows={waiting.map((b) => [
            billLink(b),
            b.number,
            date(b.date),
            money(tax(b)),
            t("match.ageValue", { month: monthLabel(monthOfDate(b.date)) }),
          ])}
        />
      </Section>

      <Section title={t("match.unknownTitle")} hint={t("match.unknownHint")}>
        <Figures
          head={[
            t("match.supplier"),
            t("match.bill"),
            t("match.billDate"),
            t("match.taxable"),
            t("match.tax"),
            t("match.statement"),
          ]}
          empty={t("match.none")}
          rows={results.flatMap(({ s, r }) =>
            r.unknown.map((u) => [
              `${u.name || u.gstin} (${u.gstin})${u.note ? ` · ${t("match.vendorNote")}` : ""}`,
              u.number,
              date(u.date),
              money(u.taxable),
              money(u.igst + u.cgst + u.sgst),
              monthLabel(s.month),
            ]),
          )}
        />
      </Section>
    </div>
  );
}
