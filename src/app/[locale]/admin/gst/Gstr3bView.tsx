import { getTranslations } from "next-intl/server";
import { HEADS, sumHeads, type Head } from "@/lib/gst/ledger";
import type { QuarterView } from "@/lib/gst/quarter";
import { Figures, Section, formatters, headCells } from "./ui";

/**
 * GSTR-3B for the quarter — SPEC §26.5. Box by box as the portal numbers
 * them. Since July 2025 the portal fills 3.1 and 3.2 from GSTR-1 and will
 * not let them be edited, so these are the figures to check it against;
 * table 4 is what to type, and 6.1 is how the tax gets paid.
 */
export async function Gstr3bView({ view }: { view: QuarterView }) {
  const t = await getTranslations("admin.gst");
  const { money } = await formatters();
  const r = view.figures.gstr3b;
  const s = view.settlement;
  const zero = money(0);
  const used = (from: Head, to: Head) => money(s.setOff.used[from][to]);

  return (
    <div className="space-y-10">
      <p className="max-w-3xl font-body text-sm text-stone">{t("gstr3b.intro")}</p>

      <Section title={t("gstr3b.t31Title")}>
        <Figures
          head={[t("gstr3b.nature"), t("gstr3b.taxable"), t("igst"), t("cgst"), t("sgst")]}
          empty=""
          rows={[
            [
              t("gstr3b.t31a"),
              money(r.outward.taxable),
              money(r.outward.igst),
              money(r.outward.cgst),
              money(r.outward.sgst),
            ],
            [t("gstr3b.t31b"), zero, zero, zero, zero],
            [t("gstr3b.t31c"), money(r.exempt), "", "", ""],
            [
              t("gstr3b.t31d"),
              money(r.reverseCharge.taxable),
              money(r.reverseCharge.igst),
              money(r.reverseCharge.cgst),
              money(r.reverseCharge.sgst),
            ],
            [t("gstr3b.t31e"), zero, "", "", ""],
          ]}
        />
      </Section>

      <Section title={t("gstr3b.t32Title")} hint={t("gstr3b.t32Hint")}>
        <Figures
          head={[t("gstr3b.pos"), t("gstr3b.taxable"), t("igst")]}
          empty={t("gstr3b.none")}
          rows={r.interStateB2c.map((x) => [
            x.pos ? `${x.pos.code}-${x.pos.name}` : t("gstr3b.unplaced"),
            money(x.taxable),
            money(x.igst),
          ])}
        />
      </Section>

      <Section title={t("gstr3b.t4Title")} hint={t("gstr3b.t4Hint")}>
        <Figures
          head={[t("gstr3b.details"), t("igst"), t("cgst"), t("sgst"), t("total")]}
          empty=""
          rows={[
            [t("gstr3b.t4a2"), ...headCells(r.itc.importServices, money)],
            [t("gstr3b.t4a3"), ...headCells(r.itc.reverseCharge, money)],
            [t("gstr3b.t4a5"), ...headCells(r.itc.other, money)],
            [t("gstr3b.t4b1"), ...headCells(r.itc.reversed, money)],
            [t("gstr3b.t4b2"), zero, zero, zero, zero],
          ]}
          foot={[t("gstr3b.t4c"), ...headCells(r.itc.net, money)]}
        />
        <div className="rounded-xl bg-forest/5 px-4 py-3 font-body text-sm text-forest">
          <p className="font-semibold">{t("gstr3b.rule42Title")}</p>
          <p className="mt-1 text-stone">
            {t("gstr3b.rule42", {
              exempt: money(r.rule42.exemptTurnover),
              total: money(r.rule42.totalTurnover),
              share: (r.rule42.share * 100).toFixed(2),
              common: money(sumHeads(r.rule42.common)),
              reversed: money(sumHeads(r.rule42.commonReversed)),
              exclusive: money(sumHeads(r.rule42.exclusive)),
            })}
          </p>
          <p className="mt-1 text-xs text-stone">{t("gstr3b.rule42Note")}</p>
        </div>
      </Section>

      <Section title={t("gstr3b.t5Title")}>
        <Figures
          head={[t("gstr3b.nature"), t("gstr3b.inter"), t("gstr3b.intra")]}
          empty=""
          rows={[
            [t("gstr3b.t5exempt"), money(r.exemptInward.inter), money(r.exemptInward.intra)],
            [t("gstr3b.t5nonGst"), zero, zero],
          ]}
        />
      </Section>

      <Section title={t("gstr3b.t61Title")} hint={t("gstr3b.t61Hint")}>
        <Figures
          minWidth="52rem"
          head={[
            t("gstr3b.head"),
            t("gstr3b.payable"),
            t("gstr3b.byIgst"),
            t("gstr3b.byCgst"),
            t("gstr3b.bySgst"),
            t("gstr3b.inCash"),
          ]}
          empty=""
          rows={HEADS.map((h) => [
            t(h),
            money(r.outward[h]),
            used("igst", h),
            used("cgst", h),
            used("sgst", h),
            money(s.setOff.cash[h]),
          ])}
          foot={[
            t("gstr3b.reverseChargeCash"),
            money(sumHeads(r.reverseCharge)),
            "",
            "",
            "",
            money(sumHeads(r.reverseCharge)),
          ]}
        />
        <Figures
          head={["", t("igst"), t("cgst"), t("sgst"), t("total")]}
          empty=""
          rows={[
            [t("gstr3b.cashNeeded"), ...headCells(s.cashNeeded, money)],
            [t("gstr3b.cashHeld"), ...headCells(s.cashHeld, money)],
            [t("gstr3b.closingCredit"), ...headCells(s.closingCredit, money)],
          ]}
          foot={[t("gstr3b.toPay"), ...headCells(s.toPay, money)]}
        />
      </Section>
    </div>
  );
}
