import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { RateAmounts } from "@/lib/gst/gstr1";
import type { QuarterView } from "@/lib/gst/quarter";
import type { GstState } from "@/lib/tax/states";
import { CsvLink, Figures, Section, formatters, type Money } from "./ui";

const pos = (s: GstState | null, unknown: string) => (s ? `${s.code}-${s.name}` : unknown);
const rates = (items: RateAmounts[], money: Money) =>
  items.map((a) => `${a.rate}%: ${money(a.taxable)}`).join(" · ");

/**
 * GSTR-1 for the quarter — SPEC §26.5. Each table as the portal lays it
 * out, with the Offline Tool's CSV for it, so a section can be imported
 * whole or its figures typed across.
 */
export async function Gstr1View({ view }: { view: QuarterView }) {
  const t = await getTranslations("admin.gst");
  const { money, date } = await formatters();
  const g = view.figures.gstr1;
  const q = view.quarter;
  const csv = (table: string) => <CsvLink quarter={q} table={table} label={t("gstr1.csv")} />;
  const unknown = t("gstr1.unplaced");
  const nil = (intra: boolean, registered: boolean) =>
    money(g.nil.find((n) => n.intra === intra && n.registered === registered)?.exempt ?? 0);

  return (
    <div className="space-y-10">
      <p className="max-w-3xl font-body text-sm text-stone">{t("gstr1.intro")}</p>

      {g.unplaced.length > 0 && (
        <div className="rounded-xl bg-terracotta/10 px-4 py-3 font-body text-sm text-terracotta">
          <p className="font-semibold">{t("gstr1.unplacedTitle", { count: g.unplaced.length })}</p>
          <ul className="mt-1 list-disc pl-5">
            {g.unplaced.map((d) => (
              <li key={d.number}>
                <Link
                  href={d.source === "order" ? `/admin/orders/${d.id}` : `/admin/subscriptions/${d.id}`}
                  className="underline underline-offset-4"
                >
                  {d.number}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section title={t("gstr1.b2bTitle")} hint={t("gstr1.b2bHint")} action={csv("b2b")}>
        <Figures
          head={[
            t("gstr1.buyer"),
            t("gstr1.invoice"),
            t("gstr1.date"),
            t("gstr1.value"),
            t("gstr1.pos"),
            t("gstr1.byRate"),
          ]}
          empty={t("gstr1.none")}
          rows={g.b2b.map((e) => [
            `${e.name} (${e.gstin})`,
            e.number,
            date(e.date),
            money(e.value),
            pos(e.pos, unknown),
            rates(e.items, money),
          ])}
        />
      </Section>

      <Section title={t("gstr1.b2clTitle")} hint={t("gstr1.b2clHint")} action={csv("b2cl")}>
        <Figures
          head={[t("gstr1.invoice"), t("gstr1.date"), t("gstr1.value"), t("gstr1.pos"), t("gstr1.byRate")]}
          empty={t("gstr1.none")}
          rows={g.b2cl.map((e) => [
            e.number,
            date(e.date),
            money(e.value),
            pos(e.pos, unknown),
            rates(e.items, money),
          ])}
        />
      </Section>

      <Section title={t("gstr1.b2csTitle")} hint={t("gstr1.b2csHint")} action={csv("b2cs")}>
        <Figures
          head={[t("gstr1.pos"), t("gstr1.rate"), t("gstr1.taxable"), t("igst"), t("cgst"), t("sgst")]}
          empty={t("gstr1.none")}
          rows={g.b2cs.map((r) => [
            pos(r.pos, unknown),
            `${r.rate}%`,
            money(r.taxable),
            money(r.igst),
            money(r.cgst),
            money(r.sgst),
          ])}
        />
      </Section>

      <Section title={t("gstr1.nilTitle")} hint={t("gstr1.nilHint")} action={csv("exemp")}>
        <Figures
          head={[t("gstr1.description"), t("gstr1.exempted")]}
          empty=""
          rows={[
            [t("gstr1.nilInterReg"), nil(false, true)],
            [t("gstr1.nilIntraReg"), nil(true, true)],
            [t("gstr1.nilInterUnreg"), nil(false, false)],
            [t("gstr1.nilIntraUnreg"), nil(true, false)],
          ]}
        />
      </Section>

      <Section
        title={t("gstr1.notesTitle")}
        hint={t("gstr1.notesHint")}
        action={
          <span className="flex gap-2">
            {csv("cdnr")}
            {csv("cdnur")}
          </span>
        }
      >
        <Figures
          head={[
            t("gstr1.note"),
            t("gstr1.date"),
            t("gstr1.against"),
            t("gstr1.buyer"),
            t("gstr1.value"),
            t("gstr1.byRate"),
          ]}
          empty={t("gstr1.none")}
          rows={[
            ...g.cdnr.map((e) => [
              e.number,
              date(e.date),
              e.invoice.number,
              `${e.name} (${e.gstin})`,
              money(e.value),
              rates(e.items, money),
            ]),
            ...g.cdnur.map((e) => [
              e.number,
              date(e.date),
              e.invoice.number,
              t("gstr1.b2cl"),
              money(e.value),
              rates(e.items, money),
            ]),
          ]}
        />
      </Section>

      <Section
        title={t("gstr1.hsnTitle")}
        hint={t("gstr1.hsnHint")}
        action={
          <span className="flex gap-2">
            {csv("hsn-b2b")}
            {csv("hsn-b2c")}
          </span>
        }
      >
        <Figures
          minWidth="56rem"
          head={[
            t("gstr1.hsn"),
            t("gstr1.uqc"),
            t("gstr1.qty"),
            t("gstr1.rate"),
            t("gstr1.value"),
            t("gstr1.taxable"),
            t("igst"),
            t("cgst"),
            t("sgst"),
          ]}
          empty={t("gstr1.none")}
          rows={g.hsn.map((h) => [
            <span key="h">
              {h.hsn}{" "}
              <span className="text-[11px] text-stone">{h.b2b ? t("gstr1.b2bTab") : t("gstr1.b2cTab")}</span>
              <span className="block text-[11px] text-stone">{h.description}</span>
            </span>,
            h.uqc,
            Number(h.qty.toFixed(3)),
            `${h.rate}%`,
            money(h.value),
            money(h.taxable),
            money(h.igst),
            money(h.cgst),
            money(h.sgst),
          ])}
        />
      </Section>

      <Section title={t("gstr1.docsTitle")} hint={t("gstr1.docsHint")} action={csv("docs")}>
        <Figures
          head={[t("gstr1.docKind"), t("gstr1.from"), t("gstr1.to"), t("gstr1.count"), t("gstr1.cancelled")]}
          empty={t("gstr1.none")}
          rows={[
            ...(g.docs.invoices
              ? [[t("gstr1.docInvoices"), g.docs.invoices.from, g.docs.invoices.to, g.docs.invoices.count, 0]]
              : []),
            ...(g.docs.creditNotes
              ? [
                  [
                    t("gstr1.docCreditNotes"),
                    g.docs.creditNotes.from,
                    g.docs.creditNotes.to,
                    g.docs.creditNotes.count,
                    0,
                  ],
                ]
              : []),
          ]}
        />
      </Section>

      <p className="max-w-3xl font-body text-xs text-stone">{t("gstr1.csvNote")}</p>
    </div>
  );
}
