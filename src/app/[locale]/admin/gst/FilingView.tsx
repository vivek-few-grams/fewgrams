import { getTranslations } from "next-intl/server";
import { CircleCheck, CircleAlert } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { istDateISO } from "@/lib/delivery-date";
import { sumHeads } from "@/lib/gst/ledger";
import { dueDates } from "@/lib/gst/period";
import type { QuarterView } from "@/lib/gst/quarter";
import { billStatus, type PurchaseBill } from "@/lib/purchases/bill";
import { unmarkFiled } from "./actions";
import { FileForm } from "./FileForm";
import { Section, formatters } from "./ui";

/**
 * Filing — SPEC §26.5. A check before each return, then a place to record
 * that it was filed. Marking GSTR-3B filed freezes the ledgers the quarter
 * left and closes it; undoing it reopens it.
 */
export async function FilingView({ view, bills }: { view: QuarterView; bills: PurchaseBill[] }) {
  const t = await getTranslations("admin.gst");
  const tc = await getTranslations("admin.common");
  const { money, date } = await formatters();
  const due = dueDates(view.quarter);
  const today = istDateISO(new Date());
  const lastDay = `${view.months[2]}-31`;

  const checks = [
    {
      ok: view.figures.gstr1.unplaced.length === 0,
      okLabel: t("filing.okPlaced"),
      label: t("filing.checkPlaced", { count: view.figures.gstr1.unplaced.length }),
    },
    {
      ok: !bills.some((b) => billStatus(b) === "mismatch"),
      okLabel: t("filing.okMismatch"),
      label: t("filing.checkMismatch", { count: bills.filter((b) => billStatus(b) === "mismatch").length }),
    },
    {
      ok: !bills.some((b) => billStatus(b) === "waiting" && b.date <= lastDay),
      okLabel: t("filing.okWaiting"),
      label: t("filing.checkWaiting", {
        count: bills.filter((b) => billStatus(b) === "waiting" && b.date <= lastDay).length,
      }),
    },
    {
      ok: sumHeads(view.settlement.toPay) === 0,
      okLabel: t("filing.okPaid"),
      label: t("filing.checkPaid", { amount: money(sumHeads(view.settlement.toPay)) }),
    },
  ];

  const filed = (which: "gstr1" | "gstr3b") => {
    const f = view.filing?.[which];
    if (!f) return <FileForm quarter={view.quarter} which={which} today={today} />;
    return (
      <div className="flex flex-wrap items-center gap-4 font-body text-sm text-forest">
        <span className="flex items-center gap-2">
          <CircleCheck aria-hidden size={18} strokeWidth={1.75} />
          {t("filing.filed", { date: date(f.filedOn), arn: f.arn })}
        </span>
        <form action={unmarkFiled}>
          <input type="hidden" name="quarter" value={view.quarter} />
          <input type="hidden" name="which" value={which} />
          <ConfirmSubmit
            label={t("filing.undo")}
            title={t("filing.undoTitle")}
            message={t(which === "gstr3b" ? "filing.undo3b" : "filing.undo1")}
            confirmLabel={t("filing.undoYes")}
            cancelLabel={tc("cancel")}
            className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
          />
        </form>
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <Section title={t("filing.checksTitle")} hint={t("filing.checksHint")}>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li
              key={c.label}
              className={`flex items-start gap-2 font-body text-sm ${c.ok ? "text-forest" : "text-terracotta"}`}
            >
              {c.ok ? (
                <CircleCheck aria-hidden size={18} strokeWidth={1.75} className="mt-px shrink-0" />
              ) : (
                <CircleAlert aria-hidden size={18} strokeWidth={1.75} className="mt-px shrink-0" />
              )}
              {c.ok ? c.okLabel : c.label}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("filing.gstr1Title", { date: date(due.gstr1) })} hint={t("filing.gstr1Hint")}>
        {filed("gstr1")}
      </Section>

      <Section title={t("filing.gstr3bTitle", { date: date(due.gstr3b) })} hint={t("filing.gstr3bHint")}>
        {filed("gstr3b")}
        {view.locked && <p className="font-body text-sm text-stone">{t("lockedNote")}</p>}
      </Section>
    </div>
  );
}
