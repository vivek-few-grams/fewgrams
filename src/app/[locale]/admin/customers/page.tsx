import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatPhone } from "@/lib/account/validation";
import type { Order } from "@/lib/orders/order";
import { listCustomers } from "@/lib/repo/customers";
import { listOrdersByStatus } from "@/lib/repo/orders";
import { listSubscriptionsByStatus } from "@/lib/repo/subscriptions";
import { subscriptionState, type Subscription } from "@/lib/subscriptions/subscription";
import { ORDER_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Orders that still count as money taken. A cancelled or refunded order was
 *  given back; a failed delivery was not (Refund policy). */
const counts = (o: Order) => o.status !== "cancelled" && o.status !== "refunded";

/**
 * `/admin/customers` — everyone who has signed in, with what they have
 * bought (27 Sep 2026). Deliberately not a report: who they are, how to reach
 * them, and a way into their orders and plans. No role editing yet — that is
 * still done in the table.
 *
 * The customers are one Scan (`listCustomers`); their orders come from the
 * status index, every placed status, grouped here. Both are a one-farm
 * shop's size. `?q=` filters on name, email or phone.
 */
export default async function CustomersAdmin({ searchParams }: PageProps<"/[locale]/admin/customers">) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const t = await getTranslations("admin.customers");
  const format = await getFormatter();

  const [customers, orderLists, subLists] = await Promise.all([
    listCustomers(),
    Promise.all(ORDER_STATUSES.filter((s) => s !== "pending_payment").map((s) => listOrdersByStatus(s))),
    Promise.all((["active", "paused"] as const).map((s) => listSubscriptionsByStatus(s))),
  ]);

  const ordersBy = new Map<string, Order[]>();
  for (const o of orderLists.flat()) ordersBy.set(o.userId, [...(ordersBy.get(o.userId) ?? []), o]);
  const plansBy = new Map<string, Subscription[]>();
  const now = new Date();
  for (const s of subLists.flat()) {
    if (subscriptionState(s, now) === "expired") continue;
    plansBy.set(s.userId, [...(plansBy.get(s.userId) ?? []), s]);
  }

  const digits = q.replace(/\D/g, "");
  const rows = customers
    .map((c) => {
      const orders = ordersBy.get(c.userId) ?? [];
      const last = orders.reduce<string | null>((m, o) => {
        const at = o.paidAt ?? o.createdAt;
        return m === null || at > m ? at : m;
      }, null);
      return {
        ...c,
        orders: orders.length,
        spent: orders.filter(counts).reduce((n, o) => n + o.total, 0),
        last,
        plans: plansBy.get(c.userId)?.length ?? 0,
      };
    })
    .filter(
      (c) =>
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        (digits.length >= 3 && c.phone?.includes(digits)),
    )
    /* Most recent buyer first; people who have never ordered after, by name. */
    .sort(
      (a, b) =>
        (b.last ?? "").localeCompare(a.last ?? "") ||
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
    );

  const money = (n: number) => format.number(n, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("intro")}</p>
      </section>

      <form role="search" className="flex flex-wrap items-center gap-2">
        <label htmlFor="customer-q" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id="customer-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm rounded-full border border-forest/20 bg-cream px-4 py-2 font-body text-sm text-forest"
        />
        <button
          type="submit"
          className="rounded-full bg-forest px-4 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          {t("search")}
        </button>
        {q && (
          <Link href="/admin/customers" className="font-body text-sm text-stone underline underline-offset-4 hover:text-forest">
            {t("clear")}
          </Link>
        )}
        <span className="ml-auto font-body text-sm tabular-nums text-stone">
          {t("count", { count: rows.length, total: customers.length })}
        </span>
      </form>

      {rows.length === 0 ? (
        <p className="font-body text-sm text-stone">{q ? t("noMatch") : t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-forest/15">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-forest/15 bg-sand/50">
                {[t("colCustomer"), t("colPhone"), t("colOrders"), t("colSpent"), t("colLast"), t("colPlans")].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.userId} className="border-b border-forest/10 last:border-0 align-top">
                  <td className={td}>
                    <Link
                      href={`/admin/customers/${c.userId}`}
                      className="font-semibold text-forest underline underline-offset-4 hover:text-stone"
                    >
                      {c.name ?? c.email ?? t("noName")}
                    </Link>
                    {c.role !== "customer" && (
                      <span className="ml-2 rounded-full bg-sage px-2 py-0.5 text-xs text-forest">{t(`role.${c.role}`)}</span>
                    )}
                    {c.name && c.email && <span className="block text-xs text-stone">{c.email}</span>}
                  </td>
                  <td className={`${td} tabular-nums text-forest`}>{c.phone ? formatPhone(c.phone) : "—"}</td>
                  <td className={`${td} tabular-nums text-forest`}>{format.number(c.orders)}</td>
                  <td className={`${td} tabular-nums text-forest`}>{c.orders ? money(c.spent) : "—"}</td>
                  <td className={`${td} text-forest`}>
                    {c.last ? format.dateTime(new Date(c.last), { dateStyle: "medium" }) : "—"}
                  </td>
                  <td className={`${td} tabular-nums text-forest`}>{c.plans ? format.number(c.plans) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = "px-4 py-3 font-body text-xs font-medium uppercase tracking-wider text-stone";
const td = "px-4 py-3 font-body text-sm";
