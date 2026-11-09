import { getTranslations } from "next-intl/server";
import { isUnfinished, type Order } from "@/lib/orders/order";
import { FINISH_LEASE_MS } from "@/lib/orders/settle";
import { finishOrder } from "./actions";
import { StepSubmit } from "./StepSubmit";

/**
 * A paid order whose after-payment work stopped part-way (8 Nov 2026): the
 * invoice number, the stock coming off the shelf or the confirmation email
 * may be missing, and the order is out of the GST returns until it has an
 * invoice. A webhook retry normally finishes it; this is for when none
 * comes. Offered only once the run's lease has gone stale, so it can never
 * race a run still working.
 */
export async function OrderUnfinished({ order, now = new Date() }: { order: Order; now?: Date }) {
  if (!isUnfinished(order)) return null;
  const t = await getTranslations("admin.orders.unfinished");
  const stale = now.getTime() - Date.parse(order.finishingAt!) >= FINISH_LEASE_MS;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-terracotta/40 bg-terracotta/5 p-6 md:flex-row md:items-center md:justify-between">
      <div className="max-w-2xl">
        <h2 className="font-display text-lg font-semibold text-terracotta">{t("title")}</h2>
        <p className="mt-1 font-body text-sm text-forest">{t(stale ? "body" : "running")}</p>
      </div>
      {stale && (
        <form action={finishOrder} className="shrink-0">
          <input type="hidden" name="id" value={order.id} />
          <StepSubmit label={t("button")} primary />
        </form>
      )}
    </section>
  );
}
