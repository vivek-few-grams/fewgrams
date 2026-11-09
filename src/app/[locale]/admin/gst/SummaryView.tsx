import { getTranslations } from "next-intl/server";
import { reportedOutward } from "@/lib/gst/gstr3b";
import { ZERO, addHeads, sumHeads, type Heads } from "@/lib/gst/ledger";
import { categoriesWithSales, type MonthSummary, type QuarterView } from "@/lib/gst/quarter";
import { Figures, Section, formatters, headCells } from "./ui";

/** The categories a sale is split into, in the order they are listed. */
const CATEGORIES = ["variety", "plan", "seed", "tray", "media", "rack", "pack", "delivery"] as const;

/**
 * The quarter at a glance, a column per month and one for the quarter — the
 * monthly and quarterly sales the owner asked to see before filing (SPEC
 * §26.5). Sales are what customers paid, net of credit notes.
 */
export async function SummaryView({ view }: { view: QuarterView }) {
  const t = await getTranslations("admin.gst");
  const { money, shortMonth } = await formatters();
  const s = view.summaries;
  const total: MonthSummary = s.reduce(
    (a, m) => ({
      ...a,
      invoices: a.invoices + m.invoices,
      creditNotes: a.creditNotes + m.creditNotes,
      sales: a.sales + m.sales,
      byCategory: Object.fromEntries(
        CATEGORIES.map((c) => [c, (a.byCategory[c] ?? 0) + (m.byCategory[c] ?? 0)]),
      ),
      taxable: a.taxable + m.taxable,
      exempt: a.exempt + m.exempt,
      tax: addHeads(a.tax, m.tax),
      bills: a.bills + m.bills,
      purchases: a.purchases + m.purchases,
      purchaseTax: a.purchaseTax + m.purchaseTax,
      credit: addHeads(a.credit, m.credit),
    }),
    {
      month: "",
      invoices: 0,
      creditNotes: 0,
      sales: 0,
      byCategory: {},
      taxable: 0,
      exempt: 0,
      tax: ZERO,
      bills: 0,
      purchases: 0,
      purchaseTax: 0,
      credit: ZERO,
    },
  );
  const cols = [...s, total];
  /* The Negative Liability Statement's rows, only in a quarter that has one. */
  const neg = view.settlement.negative;
  const hasNegative = [neg.opening, neg.arising, neg.closing].some((h) => sumHeads(h) !== 0);
  const negativeRow = (label: string, h: Heads) => (hasNegative ? [[label, ...headCells(h, money)]] : []);
  const row = (label: string, f: (m: MonthSummary) => string | number) => [label, ...cols.map(f)];

  return (
    <div className="space-y-10">
      <Section title={t("summary.salesTitle")} hint={t("summary.salesHint")}>
        <Figures
          head={[t("summary.figure"), ...s.map((m) => shortMonth(m.month)), t("summary.quarter")]}
          empty=""
          rows={[
            row(t("summary.invoices"), (m) => m.invoices),
            row(t("summary.creditNotes"), (m) => m.creditNotes),
            row(t("summary.sales"), (m) => money(m.sales)),
            ...categoriesWithSales(s, CATEGORIES).map((c) =>
              row(t(`summary.category.${c}`), (m) => money(m.byCategory[c] ?? 0)),
            ),
            row(t("summary.taxable"), (m) => money(m.taxable)),
            row(t("summary.exempt"), (m) => money(m.exempt)),
            row(t("summary.cgst"), (m) => money(m.tax.cgst)),
            row(t("summary.sgst"), (m) => money(m.tax.sgst)),
            row(t("summary.igst"), (m) => money(m.tax.igst)),
            row(t("summary.taxTotal"), (m) => money(sumHeads(m.tax))),
          ]}
        />
      </Section>

      <Section title={t("summary.purchasesTitle")} hint={t("summary.purchasesHint")}>
        <Figures
          head={[t("summary.figure"), ...s.map((m) => shortMonth(m.month)), t("summary.quarter")]}
          empty=""
          rows={[
            row(t("summary.bills"), (m) => m.bills),
            row(t("summary.purchases"), (m) => money(m.purchases)),
            row(t("summary.purchaseTax"), (m) => money(m.purchaseTax)),
            row(t("summary.credit"), (m) => money(sumHeads(m.credit))),
          ]}
        />
      </Section>

      <Section title={t("summary.positionTitle")} hint={t("summary.positionHint")}>
        <Figures
          head={[t("summary.figure"), t("igst"), t("cgst"), t("sgst"), t("total")]}
          empty=""
          rows={[
            [t("summary.openingCredit"), ...headCells(view.opening.credit, money)],
            ...negativeRow(t("summary.openingNegative"), neg.opening),
            [t("summary.netCredit"), ...headCells(view.figures.gstr3b.itc.net, money)],
            /* As 3.1 reports it: a head below zero is 0 here, and its excess
               is carried in the Negative Liability Statement. */
            [t("summary.taxDue"), ...headCells(reportedOutward(view.figures.gstr3b.outward), money)],
            ...negativeRow(t("summary.negativeUsed"), neg.used),
            [t("summary.reverseCharge"), ...headCells(view.figures.gstr3b.reverseCharge, money)],
            [t("summary.deposited"), ...headCells(view.settlement.cashHeld, money)],
            [t("summary.toPay"), ...headCells(view.settlement.toPay, money)],
            [t("summary.closingCredit"), ...headCells(view.settlement.closingCredit, money)],
            ...negativeRow(t("summary.closingNegative"), neg.closing),
          ]}
        />
      </Section>
    </div>
  );
}
