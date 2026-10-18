import { getTranslations } from "next-intl/server";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { istDateISO } from "@/lib/delivery-date";
import { floorHeads, subHeads, sumHeads, type Heads } from "@/lib/gst/ledger";
import { dueDates, monthOf } from "@/lib/gst/period";
import type { GstPayment, MonthPayment, QuarterView } from "@/lib/gst/quarter";
import { removePayment } from "./actions";
import { PaymentForm } from "./PaymentForm";
import { Figures, Section, formatters, headCells } from "./ui";

/**
 * What to pay and when — SPEC §26.5. Self-assessment for the quarter's first
 * two months (PMT-06 by the 25th), worked out on the quarter so far; the
 * rest with GSTR-3B. Every figure by head, because a deposit made in one
 * head cannot pay another.
 */
export async function PaymentsView({
  view,
  payments,
  fixedSum,
}: {
  view: QuarterView;
  payments: GstPayment[];
  /** 35% of last quarter's cash, per month — the fixed-sum alternative.
   *  Null in the first quarter, which has no last quarter. */
  fixedSum: number | null;
}) {
  const t = await getTranslations("admin.gst");
  const tc = await getTranslations("admin.common");
  const { money, month: monthLabel, date } = await formatters();
  const due = dueDates(view.quarter);
  const today = istDateISO(new Date());
  const current = monthOf(new Date());
  const rupees = (p: number) => (p / 100).toFixed(2);

  const monthCard = (mp: MonthPayment, k: 0 | 1) => {
    const s = mp.settlement;
    const out = mp.figures.gstr3b.outward;
    const fromCredit: Heads = subHeads({ igst: out.igst, cgst: out.cgst, sgst: out.sgst }, s.setOff.cash);
    const still = floorHeads(subHeads(s.toPay, mp.paid));
    const ended = mp.month < current;
    return (
      <Section
        key={mp.month}
        title={t("payments.monthTitle", { month: monthLabel(mp.month), date: date(due.pmt06[k]) })}
        hint={
          ended
            ? sumHeads(still) === 0
              ? t("payments.settled")
              : t("payments.toPayHint")
            : t("payments.inProgress")
        }
      >
        <Figures
          head={["", t("igst"), t("cgst"), t("sgst"), t("total")]}
          empty=""
          rows={[
            [t("payments.taxSoFar"), ...headCells(out, money)],
            [t("payments.reverseCharge"), ...headCells(mp.figures.gstr3b.reverseCharge, money)],
            [t("payments.creditAvailable"), ...headCells(s.credit, money)],
            [t("payments.paidFromCredit"), ...headCells(fromCredit, money)],
            [t("payments.cashNeeded"), ...headCells(s.cashNeeded, money)],
            [t("payments.depositedEarlier"), ...headCells(s.cashHeld, money)],
            [t("payments.toPay"), ...headCells(s.toPay, money)],
            [t("payments.recorded"), ...headCells(mp.paid, money)],
          ]}
          foot={[t("payments.stillToPay"), ...headCells(still, money)]}
        />
      </Section>
    );
  };

  const months = view.months.filter((m) => m <= current);
  const suggest = Object.fromEntries(
    view.months.map((m, i) => {
      const h =
        i < 2
          ? floorHeads(subHeads(view.monthly[i].settlement.toPay, view.monthly[i].paid))
          : view.settlement.toPay;
      return [m, { igst: rupees(h.igst), cgst: rupees(h.cgst), sgst: rupees(h.sgst) }];
    }),
  );
  const inQuarter = payments
    .filter((p) => view.months.includes(p.month))
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn));

  return (
    <div className="space-y-10">
      <p className="max-w-3xl font-body text-sm text-stone">{t("payments.intro")}</p>
      {fixedSum !== null && (
        <p className="rounded-xl bg-sand/60 px-4 py-3 font-body text-sm text-forest">
          {t("payments.fixedSum", { amount: money(fixedSum) })}
        </p>
      )}
      {monthCard(view.monthly[0], 0)}
      {monthCard(view.monthly[1], 1)}

      <Section
        title={t("payments.quarterTitle", { date: date(due.gstr3b) })}
        hint={t("payments.quarterHint")}
      >
        <Figures
          head={["", t("igst"), t("cgst"), t("sgst"), t("total")]}
          empty=""
          rows={[
            [t("payments.cashNeeded"), ...headCells(view.settlement.cashNeeded, money)],
            [t("payments.depositedQuarter"), ...headCells(view.settlement.cashHeld, money)],
          ]}
          foot={[t("payments.balance"), ...headCells(view.settlement.toPay, money)]}
        />
      </Section>

      <Section title={t("payments.recordTitle")} hint={t("payments.recordHint")}>
        {view.locked ? (
          <p className="font-body text-sm text-stone">{t("lockedNote")}</p>
        ) : months.length === 0 ? (
          <p className="font-body text-sm text-stone">{t("payments.notYet")}</p>
        ) : (
          <PaymentForm
            months={months.map((m) => ({ value: m, label: monthLabel(m) }))}
            today={today}
            suggest={suggest}
          />
        )}
        <Figures
          head={[
            t("payments.month"),
            t("payments.paidOn"),
            t("payments.reference"),
            t("igst"),
            t("cgst"),
            t("sgst"),
            "",
          ]}
          empty={t("payments.none")}
          rows={inQuarter.map((p) => [
            monthLabel(p.month),
            date(p.paidOn),
            p.reference,
            money(p.heads.igst),
            money(p.heads.cgst),
            money(p.heads.sgst),
            view.locked ? (
              ""
            ) : (
              <form action={removePayment}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmSubmit
                  label={tc("delete")}
                  title={t("payments.deleteTitle")}
                  message={t("payments.deleteConfirm", { reference: p.reference })}
                  confirmLabel={tc("confirmDelete")}
                  cancelLabel={tc("cancel")}
                  className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
                />
              </form>
            ),
          ])}
        />
      </Section>
    </div>
  );
}
