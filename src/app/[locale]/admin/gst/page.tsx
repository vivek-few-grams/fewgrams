import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { floorHeads, subHeads, sumHeads } from "@/lib/gst/ledger";
import { dueDates, isQuarterId, monthOf, monthsOf, quartersSince } from "@/lib/gst/period";
import { quarterView } from "@/lib/gst/quarter";
import { getGstr2b, loadBooks, type StoredGstr2b } from "@/lib/repo/gst";
import { FilingView } from "./FilingView";
import { Gstr1View } from "./Gstr1View";
import { Gstr3bView } from "./Gstr3bView";
import { MatchView } from "./MatchView";
import { PaymentsView } from "./PaymentsView";
import { SummaryView } from "./SummaryView";
import { formatters } from "./ui";

export const dynamic = "force-dynamic";

const VIEWS = ["summary", "payments", "gstr1", "gstr3b", "match", "filing"] as const;
type View = (typeof VIEWS)[number];

/**
 * `/admin/gst` — the GST books, a quarter at a time (SPEC §26.5). Quarterly
 * returns with monthly payment: what was sold and bought each month, what to
 * pay by the 25th, every GSTR-1 table and GSTR-3B box, the GSTR-2B match,
 * and a record of what was filed. Nothing is sent to the portal from here;
 * every figure is one to type across, or a CSV to import.
 */
export default async function GstAdmin({ searchParams }: PageProps<"/[locale]/admin/gst">) {
  await requireRole("admin");
  const t = await getTranslations("admin.gst");
  const { money, shortMonth, date } = await formatters();
  const sp = await searchParams;
  const today = istDateISO(new Date());
  const quarters = quartersSince(today);
  const quarter =
    typeof sp.q === "string" && isQuarterId(sp.q) && quarters.includes(sp.q) ? sp.q : quarters.at(-1)!;
  const tab: View =
    typeof sp.view === "string" && (VIEWS as readonly string[]).includes(sp.view)
      ? (sp.view as View)
      : "summary";

  const books = await loadBooks();
  const view = quarterView(books, quarter);
  const index = quarters.indexOf(quarter);
  const fixedSum =
    index > 0
      ? Math.round(sumHeads(quarterView(books, quarters[index - 1]).settlement.cashNeeded) * 0.35)
      : null;
  const statements =
    tab === "match"
      ? (await Promise.all(view.months.map(getGstr2b))).filter((s): s is StoredGstr2b => s !== null)
      : [];

  const label = (q: string) => {
    const [m1, , m3] = monthsOf(q);
    return t("quarterLabel", { from: shortMonth(m1), to: shortMonth(m3), year: m3.slice(0, 4) });
  };
  const href = (q: string, v: View = tab) => `/admin/gst?q=${q}&view=${v}`;
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
      active ? "bg-forest text-cream" : "border border-forest/25 text-forest hover:bg-forest/5"
    }`;

  /* What is due this quarter, and where each stands. */
  const due = dueDates(quarter);
  const current = monthOf(new Date());
  const dueItems = [0, 1].map((k) => {
    const mp = view.monthly[k];
    const owed = sumHeads(floorHeads(subHeads(mp.settlement.toPay, mp.paid)));
    const state =
      mp.month >= current ? "open" : owed === 0 ? "done" : today > due.pmt06[k] ? "overdue" : "due";
    return {
      key: `pmt${k}`,
      label: t("due.pmt06", { month: shortMonth(mp.month) }),
      date: due.pmt06[k],
      state,
      detail: state === "due" || state === "overdue" ? money(owed) : null,
    };
  });
  for (const which of ["gstr1", "gstr3b"] as const) {
    const filed = !!view.filing?.[which];
    const ended = view.months[2] < current;
    dueItems.push({
      key: which,
      label: t(`due.${which}`),
      date: due[which],
      state: filed ? "done" : !ended ? "open" : today > due[which] ? "overdue" : "due",
      detail: null,
    });
  }
  const tone: Record<string, string> = {
    done: "border-forest/20 bg-forest/5 text-forest",
    open: "border-forest/15 text-stone",
    due: "border-forest/40 bg-sand/60 text-forest",
    overdue: "border-terracotta/40 bg-terracotta/10 text-terracotta",
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("intro")}</p>
      </section>

      <nav aria-label={t("quarters")} className="flex flex-wrap items-center gap-2">
        {quarters.map((q) => (
          <Link key={q} href={href(q)} className={pill(q === quarter)}>
            {label(q)}
          </Link>
        ))}
        {view.locked && (
          <span className="rounded-full bg-sand px-3 py-1 font-body text-xs font-semibold text-stone">
            {t("locked")}
          </span>
        )}
      </nav>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dueItems.map((d) => (
          <li key={d.key} className={`rounded-xl border px-4 py-3 font-body text-sm ${tone[d.state]}`}>
            <p className="font-semibold">{d.label}</p>
            <p className="mt-0.5 text-xs">
              {t(`due.${d.state}`, { date: date(d.date) })}
              {d.detail && ` · ${d.detail}`}
            </p>
          </li>
        ))}
      </ul>

      <nav aria-label={t("views")} className="flex flex-wrap gap-1 border-b border-forest/15">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={href(quarter, v)}
            aria-current={v === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 font-body text-sm font-semibold transition-colors ${
              v === tab ? "border-forest text-forest" : "border-transparent text-stone hover:text-forest"
            }`}
          >
            {t(`tabs.${v}`)}
          </Link>
        ))}
      </nav>

      {tab === "summary" && <SummaryView view={view} />}
      {tab === "payments" && <PaymentsView view={view} payments={books.payments} fixedSum={fixedSum} />}
      {tab === "gstr1" && <Gstr1View view={view} />}
      {tab === "gstr3b" && <Gstr3bView view={view} />}
      {tab === "match" && <MatchView view={view} statements={statements} bills={books.bills} />}
      {tab === "filing" && <FilingView view={view} bills={books.bills} />}
    </div>
  );
}
