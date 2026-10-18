import { getFormatter } from "next-intl/server";
import type { Heads } from "@/lib/gst/ledger";

/**
 * Shared pieces of `/admin/gst`. Figures are paise everywhere below the
 * page; these turn them into rupees to the paisa, the way the portal shows
 * them, so each figure can be typed across as it reads.
 */

export async function formatters() {
  const format = await getFormatter();
  return {
    money: (paise: number) =>
      format.number(paise / 100, { style: "currency", currency: "INR", minimumFractionDigits: 2 }),
    month: (m: string) =>
      format.dateTime(new Date(`${m}-01T00:00:00+05:30`), { month: "long", year: "numeric" }),
    shortMonth: (m: string) => format.dateTime(new Date(`${m}-01T00:00:00+05:30`), { month: "short" }),
    date: (iso: string) => format.dateTime(new Date(`${iso}T00:00:00+05:30`), { dateStyle: "medium" }),
  };
}

export type Money = (paise: number) => string;

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-forest">{title}</h2>
          {hint && <p className="mt-1 max-w-3xl font-body text-sm text-stone">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A plain figures table. The first column reads left, the rest are numbers
 * and read right. `rows` already formatted; an empty table says so.
 */
export function Figures({
  head,
  rows,
  foot,
  empty,
  minWidth = "40rem",
}: {
  head: string[];
  rows: React.ReactNode[][];
  foot?: React.ReactNode[];
  empty: string;
  minWidth?: string;
}) {
  if (rows.length === 0) return <p className="font-body text-sm text-stone">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-forest/15">
      <table className="w-full font-body text-sm" style={{ minWidth }}>
        <thead className="bg-forest/5">
          <tr className="text-[11px] uppercase tracking-wider text-stone">
            {head.map((h, i) => (
              <th key={i} className={`px-4 py-2.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-forest">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-forest/10 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 ${j === 0 ? "text-left" : "text-right tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot className="border-t border-forest/25 font-semibold text-forest">
            <tr>
              {foot.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 ${j === 0 ? "text-left" : "text-right tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** IGST, CGST, SGST and their sum, as four cells. */
export const headCells = (h: Heads, money: Money) => [
  money(h.igst),
  money(h.cgst),
  money(h.sgst),
  money(h.igst + h.cgst + h.sgst),
];

/** A CSV download for one GSTR-1 section. */
export function CsvLink({ quarter, table, label }: { quarter: string; table: string; label: string }) {
  return (
    <a
      href={`/api/admin/gst/${quarter}/${table}`}
      className="rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest/5"
    >
      {label}
    </a>
  );
}
