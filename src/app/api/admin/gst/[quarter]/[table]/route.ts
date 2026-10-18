import { currentActor } from "@/lib/auth/guard";
import { hasRole } from "@/lib/auth/roles";
import { GSTR1_CSV_TABLES, gstr1Csv, type Gstr1CsvTable } from "@/lib/gst/csv";
import { isQuarterId, monthsOf, returnPeriod } from "@/lib/gst/period";
import { periodFigures } from "@/lib/gst/quarter";
import { loadBooks } from "@/lib/repo/gst";

/**
 * One GSTR-1 section as the Offline Tool's CSV — SPEC §26.5. Admin only; a
 * 404 to anyone else. Named for the section and the return period, so a
 * folder of them sorts by quarter.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/gst/[quarter]/[table]">) {
  const actor = await currentActor();
  if (!actor || !hasRole(actor.role, "admin")) return new Response(null, { status: 404 });
  const { quarter, table } = await ctx.params;
  if (!isQuarterId(quarter) || !(GSTR1_CSV_TABLES as readonly string[]).includes(table)) {
    return new Response(null, { status: 404 });
  }
  const months = monthsOf(quarter);
  const { gstr1 } = periodFigures(await loadBooks(), months);
  return new Response(gstr1Csv(gstr1, table as Gstr1CsvTable), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${table}-${returnPeriod(months[2])}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
