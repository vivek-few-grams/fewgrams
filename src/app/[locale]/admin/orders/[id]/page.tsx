import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { formatReceiptNo, isOrderId, type ShippingQuote } from "@/lib/orders/order";
import { GATEWAY_LABEL } from "@/lib/payments/provider";
import { getOrder, listPayments } from "@/lib/repo/orders";
import { OrderSteps } from "../OrderSteps";

export const dynamic = "force-dynamic";

/**
 * `/admin/orders/[id]` — SPEC §12. Everything needed to fulfil one order:
 * the lines as sold (the snapshot, not today's catalogue), the address as it
 * was at checkout, every payment event the gateway reported, and the next
 * status move.
 *
 * A tray or grow-media line bigger than the stock when it was placed says
 * "order from the vendor" (SPEC §23.1) — nothing else in the app raises a
 * purchase order yet.
 */
export default async function OrderAdmin({ params }: PageProps<"/[locale]/admin/orders/[id]">) {
  const { id } = await params;
  if (!isOrderId(id)) notFound();
  const order = await getOrder(id);
  if (!order) notFound();

  const t = await getTranslations("admin.orders");
  const format = await getFormatter();
  /* Shiprocket's quote names the carrier chosen, which is what booking the
     shipment has to match. */
  const quoteText = (q: ShippingQuote) =>
    t("deliveryQuote", {
      courier: q.carrier ? t("courierVia", { carrier: q.carrier, courier: t(`courier.${q.courier}`) }) : t(`courier.${q.courier}`),
      zone: q.zone,
      quoted: q.quotedTotal,
    });
  const payments = await listPayments(id);

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-8">
      {/* The way back and the next move sit to the right of the order, from
          `md`; on a phone they come first, above it. */}
      <section className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0">
          <p className="font-body text-xs uppercase tracking-wider text-stone">{order.id}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-forest">
            {order.receiptNo !== null ? formatReceiptNo(order.receiptNo) : t("noReceipt")}
          </h1>
          <p className="mt-2 font-body text-sm text-forest">
            {t(`status.${order.status}`)} ·{" "}
            {t("deliverOn", {
              date: format.dateTime(new Date(`${order.deliveryDate}T00:00:00+05:30`), {
                dateStyle: "full",
              }),
            })}
          </p>
          <p className="mt-1 font-body text-xs text-stone">
            {t("placed", { when: when(order.createdAt) })}
            {order.paidAt && ` · ${t("paidAt", { when: when(order.paidAt) })}`}
          </p>
        </div>
        <div className="order-first flex flex-col items-start gap-4 md:order-none md:shrink-0 md:items-end">
          <Link
            href="/admin/orders"
            className="font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
          >
            {t("back")}
          </Link>
          <OrderSteps order={order} />
        </div>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("itemsHeading")}</h2>
        <table className="mt-3 w-full border-collapse text-left">
          <tbody>
            {order.lines.map((l) => (
              <tr key={`${l.kind}:${l.key}`} className="border-b border-forest/10 align-top">
                <td className="py-2.5 font-body text-sm text-forest">
                  {l.name}
                  <span className="block text-xs text-stone">
                    {t(`kind.${l.kind}`)} · {l.key}
                    {/* Off the shelf, or to order from the vendor — for a tray or
                        cocopeat line bigger than the stock when it was placed. */}
                    {l.sourcing && ` · ${t(`sourcing.${l.sourcing}`)}`}
                  </span>
                </td>
                <td className="py-2.5 font-body text-sm tabular-nums text-forest">
                  {l.grams !== null ? t("grams", { grams: l.grams }) : t("units", { count: l.units })}
                </td>
                <td className="py-2.5 text-right font-body text-sm tabular-nums text-forest">
                  {t("amount", { amount: l.lineTotal })}
                </td>
              </tr>
            ))}
            {/* One row per parcel, each with where it is collected and the
                courier it was quoted on — what booking it needs. Orders
                placed before parcels existed keep their single row. */}
            {order.shipments.length > 0
              ? order.shipments.map((x) => (
                  <tr key={x.origin.id} className="border-b border-forest/10 align-top">
                    <td className="py-2.5 font-body text-sm text-forest">
                      {t("shipmentLine", { name: x.origin.name, city: x.origin.city, pincode: x.origin.pincode })}
                      <span className="block text-xs text-stone">
                        {x.quote ? quoteText(x.quote) : t("deliveryOwnRun")}
                        {" · "}
                        {x.lines.map((id) => order.lines.find((l) => `${l.kind}:${l.key}` === id)?.name ?? id).join(", ")}
                        {" · "}
                        {t("shipmentArrives", {
                          date: format.dateTime(new Date(`${x.deliveryDate}T00:00:00+05:30`), { dateStyle: "medium" }),
                        })}
                      </span>
                    </td>
                    <td className="py-2.5 font-body text-sm tabular-nums text-forest">
                      {x.quote && t("grams", { grams: x.quote.chargedGrams })}
                    </td>
                    <td className="py-2.5 text-right font-body text-sm tabular-nums text-forest">
                      {t("amount", { amount: x.charge })}
                    </td>
                  </tr>
                ))
              : order.deliveryMethod && (
                  <tr className="border-b border-forest/10 align-top">
                    <td className="py-2.5 font-body text-sm text-forest">
                      {t("deliveryLine")}
                      <span className="block text-xs text-stone">
                        {order.shippingQuote ? quoteText(order.shippingQuote) : t("deliveryOwnRun")}
                      </span>
                    </td>
                    <td className="py-2.5 font-body text-sm tabular-nums text-forest">
                      {order.shippingQuote && t("grams", { grams: order.shippingQuote.chargedGrams })}
                    </td>
                    <td className="py-2.5 text-right font-body text-sm tabular-nums text-forest">
                      {t("amount", { amount: order.deliveryCharge })}
                    </td>
                  </tr>
                )}
            <tr>
              <td className="pt-3 font-body text-sm font-semibold text-forest" colSpan={2}>
                {t("total")}
              </td>
              <td className="pt-3 text-right font-body text-sm font-semibold tabular-nums text-forest">
                {t("amount", { amount: order.total })}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("deliverTo")}</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-forest">
          {[
            order.address.recipient,
            order.address.line1,
            order.address.line2,
            order.address.landmark,
            formatPlace(order.address),
            formatPhone(order.address.phone),
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        {order.address.notes && (
          <p className="mt-1 font-body text-xs text-stone">{order.address.notes}</p>
        )}
        <p className="mt-2 font-body text-xs text-stone">{order.email}</p>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("paymentsHeading")}</h2>
        {payments.length === 0 ? (
          <p className="mt-2 font-body text-sm text-stone">{t("noPayments")}</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {payments.map((p) => (
              <li key={`${p.id}:${p.status}`} className="font-body text-sm text-forest">
                {t(`attempt.${p.status}`)} · {t("amount", { amount: p.amount })}
                {p.method && ` · ${p.method}`}
                <span className="block text-xs text-stone">
                  {t("gatewayRef", { gateway: GATEWAY_LABEL[order.provider], id: p.id })} · {t(`source.${p.source}`)} ·{" "}
                  {when(p.receivedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
