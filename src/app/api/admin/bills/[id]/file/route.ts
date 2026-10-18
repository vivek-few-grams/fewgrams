import { currentActor } from "@/lib/auth/guard";
import { hasRole } from "@/lib/auth/roles";
import { getBill, getBillFile } from "@/lib/repo/purchases";

/**
 * A purchase bill's file — SPEC §26.6. Admin only, and a 404 to anyone else
 * so the URL does not confirm a bill exists. Served inline, never cached,
 * with its stored type; `nosniff` keeps a browser from reading a PDF as
 * anything else.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/bills/[id]/file">) {
  const actor = await currentActor();
  if (!actor || !hasRole(actor.role, "admin")) return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  const bill = await getBill(id);
  const data = bill?.file ? await getBillFile(id) : null;
  if (!bill?.file || !data) return new Response(null, { status: 404 });

  const name = bill.file.name.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": bill.file.type,
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
