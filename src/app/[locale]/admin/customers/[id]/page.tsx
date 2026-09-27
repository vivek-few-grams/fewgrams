import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { formatReceiptNo } from "@/lib/orders/order";
import { getCustomer } from "@/lib/repo/customers";
import { listOrdersForUser } from "@/lib/repo/orders";
import { listAddresses } from "@/lib/repo/profile";
import { listSubscriptionsForUser } from "@/lib/repo/subscriptions";
import { subscriptionState } from "@/lib/subscriptions/subscription";

export const dynamic = "force-dynamic";

/** Auth.js user ids are UUIDs; anything else is not worth a read. */
const USER_ID = /^[0-9a-f-]{36}$/i;

/**
 * `/admin/customers/[id]` — one customer: how to reach them, where they
 * have us deliver, and every order and plan they have paid for, each linking
 * to its own admin page (27 Sep 2026).
 */
export default async function CustomerAdmin({ params }: PageProps<"/[locale]/admin/customers/[id]">) {
  const { id } = await params;
  if (!USER_ID.test(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [addresses, orders, subs] = await Promise.all([
    listAddresses(id),
    listOrdersForUser(id),
    listSubscriptionsForUser(id),
  ]);
  const t = await getTranslations("admin.customers");
  const orderStatus = await getTranslations("admin.orders.status");
  const subState = await getTranslations("admin.subscriptions.state");
  const format = await getFormatter();
  const money = (n: number) => format.number(n, { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-forest">{customer.name ?? customer.email ?? t("noName")}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-sm text-forest">
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="underline underline-offset-4 hover:text-stone">
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="tabular-nums underline underline-offset-4 hover:text-stone">
                {formatPhone(customer.phone)}
              </a>
            )}
            {customer.role !== "customer" && <span className="text-stone">{t(`role.${customer.role}`)}</span>}
          </p>
        </div>
        <Link
          href="/admin/customers"
          className="order-first font-body text-sm text-stone underline underline-offset-4 hover:text-forest md:order-none"
        >
          {t("back")}
        </Link>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("ordersHeading")}</h2>
        {orders.length === 0 ? (
          <p className="mt-2 font-body text-sm text-stone">{t("noOrders")}</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-forest/10 last:border-0">
                  <td className="py-2.5 pr-4 font-body text-sm">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-semibold text-forest underline underline-offset-4 hover:text-stone"
                    >
                      {o.receiptNo !== null ? formatReceiptNo(o.receiptNo) : o.id}
                    </Link>
                    <span className="block text-xs text-stone">{day(o.placedAt)}</span>
                  </td>
                  <td className="py-2.5 pr-4 font-body text-sm text-forest">{orderStatus(o.status)}</td>
                  <td className="py-2.5 pr-4 font-body text-sm text-stone">{t("items", { count: o.itemCount })}</td>
                  <td className="py-2.5 text-right font-body text-sm tabular-nums text-forest">{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("plansHeading")}</h2>
        {subs.length === 0 ? (
          <p className="mt-2 font-body text-sm text-stone">{t("noPlans")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-forest/10">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                <span className="font-body text-sm">
                  <Link
                    href={`/admin/subscriptions/${s.id}`}
                    className="font-semibold text-forest underline underline-offset-4 hover:text-stone"
                  >
                    {s.receiptNo !== null ? formatReceiptNo(s.receiptNo) : s.id}
                  </Link>
                  <span className="block text-xs text-stone">
                    {s.lines.map((l) => `${l.name} × ${l.boxes}`).join(" + ")}
                  </span>
                </span>
                <span className="font-body text-sm text-forest">{subState(subscriptionState(s))}</span>
                <span className="font-body text-sm tabular-nums text-forest">{money(s.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("addressesHeading")}</h2>
        {addresses.length === 0 ? (
          <p className="mt-2 font-body text-sm text-stone">{t("noAddresses")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {addresses.map((a) => (
              <li key={a.addrId} className="font-body text-sm text-forest">
                <span className="font-semibold">{a.label}</span>
                {a.isDefault && <span className="ml-2 text-xs text-stone">{t("default")}</span>}
                <span className="block text-stone">
                  {[a.recipient, a.line1, a.line2, a.landmark, formatPlace(a), formatPhone(a.phone)]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
