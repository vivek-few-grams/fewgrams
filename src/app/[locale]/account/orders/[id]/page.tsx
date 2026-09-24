import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarCheck, CircleCheck, Clock, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { hasRole } from "@/lib/auth/roles";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { lineUnits } from "@/lib/cart/line-display";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { formatReceiptNo, isOrderId, paymentWindowClosed } from "@/lib/orders/order";
import { getOrder } from "@/lib/repo/orders";
import { Card } from "../../ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders/[id]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.orders.detail" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** A `YYYY-MM-DD` IST date as the instant `formatDeliveryDate` expects. */
const istDay = (iso: string) => new Date(`${iso}T00:00:00+05:30`);

/**
 * `/account/orders/[id]` — SPEC §12. The receipt, and the page Cashfree's
 * return route lands on, so it doubles as the order confirmation.
 *
 * Someone else's order is a 404, not a 403: saying "forbidden" would confirm
 * the id exists. An admin may open any order.
 *
 * An unpaid order is either still being confirmed — the gateway took the
 * money but neither the webhook nor the return route has settled it yet — or
 * was never paid. "Check again" goes back through the return route, which
 * settles against the gateway and clears the cart; this page itself writes
 * nothing.
 */
export default async function OrderPage({ params }: PageProps<"/[locale]/account/orders/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const actor = await requireRole("customer");
  if (!isOrderId(id)) notFound();
  const order = await getOrder(id);
  if (!order || (order.userId !== actor.userId && !hasRole(actor.role, "admin"))) notFound();

  const t = await getTranslations("account.orders.detail");
  const status = await getTranslations("account.orders.status");
  const tc = await getTranslations("cart");
  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";

  const pending = order.status === "pending_payment";
  const expired = pending && paymentWindowClosed(order);
  const recheck = `/api/payments/return/${locale}?order_id=${order.id}`;

  return (
    <div className="space-y-6">
      <Link
        href="/account/orders"
        className="font-body text-sm text-stone underline underline-offset-4 transition-colors hover:text-forest"
      >
        {t("back")}
      </Link>

      {pending ? (
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sand text-forest">
              {expired ? <RotateCcw size={20} strokeWidth={1.5} /> : <Clock size={20} strokeWidth={1.5} />}
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold text-forest">
                {expired ? t("expiredHeading") : t("pendingHeading")}
              </h2>
              <p className="mt-2 max-w-xl font-body text-sm text-stone">
                {expired ? t("expiredBody") : t("pendingBody")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {!expired && (
                  /* A route handler, not a page, so a plain anchor rather than
                     the locale-aware Link. */
                  <a
                    href={recheck}
                    className="rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
                  >
                    {t("checkAgain")}
                  </a>
                )}
                <Link
                  href="/cart"
                  className="rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
                >
                  {t("backToCart")}
                </Link>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-cream">
              <CircleCheck size={20} strokeWidth={1.5} />
            </span>
            <div>
              <p className="font-body text-xs uppercase tracking-wider text-stone">
                {order.receiptNo !== null
                  ? t("receipt", { number: formatReceiptNo(order.receiptNo) })
                  : t("orderRef", { id: order.id })}
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-forest">
                {order.status === "paid" ? t("paidHeading") : status(order.status)}
              </h2>
              <p className="mt-2 flex items-center gap-2 font-body text-sm text-forest">
                <CalendarCheck size={16} strokeWidth={1.75} />
                {t("arrives", { date: formatDeliveryDate(istDay(order.deliveryDate), dateLocale) })}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card title={t("itemsHeading")}>
        <ul className="border-t border-forest/15">
          {order.lines.map((line) => (
            <li
              key={`${line.kind}:${line.key}`}
              className="flex items-baseline justify-between gap-4 border-b border-forest/15 py-3"
            >
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold text-forest">{line.name}</span>
                <span className="mt-0.5 block font-body text-xs text-stone">{lineUnits(line, tc)}</span>
              </span>
              <span className="shrink-0 font-body text-sm tabular-nums text-forest">
                {tc("subtotalValue", { amount: line.lineTotal })}
              </span>
            </li>
          ))}
        </ul>
        {/* Orders placed while delivery was free carry 0 and no quote; they
            keep reading as before rather than gain a "₹0 delivery" line. */}
        {order.deliveryMethod && (
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <span className="font-body text-sm text-stone">{t("delivery")}</span>
            <span className="font-body text-sm tabular-nums text-forest">
              {tc("subtotalValue", { amount: order.deliveryCharge })}
            </span>
          </div>
        )}
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <span className="font-body text-sm font-semibold text-forest">{t("total")}</span>
          <span className="font-display text-xl font-bold tabular-nums text-forest">
            {tc("subtotalValue", { amount: order.total })}
          </span>
        </div>
      </Card>

      <Card title={t("deliverTo")}>
        <p className="font-body text-sm leading-relaxed text-forest">
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
      </Card>
    </div>
  );
}
