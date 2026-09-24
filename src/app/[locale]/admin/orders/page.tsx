import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { istDateISO } from "@/lib/delivery-date";
import { formatReceiptNo, type Order } from "@/lib/orders/order";
import { listOrdersByStatus } from "@/lib/repo/orders";
import type { OrderStatus } from "@/lib/types";
import { OrderSteps } from "./OrderSteps";

export const dynamic = "force-dynamic";


/** The statuses that need the owner to do something, in the order the work
 *  happens. After `ready_for_delivery` the order is with the delivery agent. */
const ACTIVE = ["paid", "picked", "ready_for_delivery"] as const satisfies readonly OrderStatus[];

/**
 * Statuses with a tab of their own: the ones past the owner's hands, and
 * unpaid checkouts. The three `ACTIVE` statuses have no tab — the board shows
 * them — so a `?status=paid` link lands on the board rather than on a second
 * view of one lane.
 */
const DONE = ["out_for_delivery", "delivered", "failed", "refunded"] as const satisfies readonly OrderStatus[];
const TABBED: readonly OrderStatus[] = [...DONE, "pending_payment"];
const isTabbed = (v: string): v is OrderStatus => (TABBED as readonly string[]).includes(v);

/** Soonest delivery first, then first paid — the order the work should be
 *  done in. `YYYY-MM-DD` and ISO timestamps both sort as strings. */
const byUrgency = (a: Order, b: Order) =>
  a.deliveryDate.localeCompare(b.deliveryDate) ||
  (a.paidAt ?? a.createdAt).localeCompare(b.paidAt ?? b.createdAt);

/**
 * `/admin/orders` — SPEC §12, §13.
 *
 * Opens on **Needs attention**: one lane per status that is still the
 * owner's to move — new, picked, ready for delivery — each card carrying the
 * button for its next step, so an order is taken on and handed over without
 * opening it. Three GSI2 queries (`STATUS#<status>`), sorted by delivery date
 * rather than by arrival, because that is what decides which to pick first.
 *
 * `?status=` shows one finished status as a table, for history. Unpaid
 * checkouts (`pending_payment`) sit apart at the end of the row: they are
 * not orders to prepare, only where a customer who says they paid and has no
 * receipt is looked up.
 */
export default async function OrdersAdmin({
  searchParams,
}: PageProps<"/[locale]/admin/orders">) {
  const raw = (await searchParams).status;
  const current: OrderStatus | null = typeof raw === "string" && isTabbed(raw) ? raw : null;

  const t = await getTranslations("admin.orders");

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("intro")}</p>
      </section>

      <nav aria-label={t("filterLabel")} className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Tab href="/admin/orders" active={current === null} label={t("activeTab")} />
        <div role="group" aria-labelledby="orders-done" className="flex flex-wrap items-center gap-2">
          <span id="orders-done" className="font-body text-xs uppercase tracking-wider text-stone">
            {t("doneGroup")}
          </span>
          {DONE.map((s) => (
            <Tab
              key={s}
              href={`/admin/orders?status=${s}`}
              active={s === current}
              label={t(`status.${s}`)}
            />
          ))}
        </div>
        <div className="ml-auto">
          <Tab
            href="/admin/orders?status=pending_payment"
            active={current === "pending_payment"}
            label={t("unpaidTab")}
          />
        </div>
      </nav>

      {current ? <StatusTable status={current} /> : <Board />}
    </div>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 font-body text-sm transition-colors ${
        active ? "bg-forest text-cream" : "border border-forest/20 text-forest hover:bg-forest/5"
      }`}
    >
      {label}
    </Link>
  );
}

async function Board() {
  const t = await getTranslations("admin.orders");
  const lanes = await Promise.all(
    ACTIVE.map(async (status) => ({
      status,
      orders: (await listOrdersByStatus(status)).sort(byUrgency),
    })),
  );
  const today = istDateISO(new Date());

  if (lanes.every((l) => l.orders.length === 0)) {
    return <p className="font-body text-sm text-stone">{t("activeEmpty")}</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {lanes.map(({ status, orders }) => (
        <section key={status} aria-labelledby={`lane-${status}`} className="rounded-2xl bg-sand/40 p-4">
          <header className="flex items-baseline justify-between gap-3 px-1">
            <h2 id={`lane-${status}`} className="font-display text-lg font-semibold text-forest">
              {t(`lane.${status}.heading`)}
            </h2>
            <span className="font-body text-sm tabular-nums text-stone">{orders.length}</span>
          </header>
          <p className="px-1 font-body text-xs text-stone">{t(`lane.${status}.hint`)}</p>

          {orders.length === 0 ? (
            <p className="mt-4 px-1 font-body text-sm text-stone">{t("laneEmpty")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {orders.map((o) => (
                <li key={o.id}>
                  <OrderCard order={o} today={today} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** Lines shown on a card before the rest collapse into "+n more". */
const CARD_LINES = 3;

async function OrderCard({ order, today }: { order: Order; today: string }) {
  const t = await getTranslations("admin.orders");
  const format = await getFormatter();
  const due =
    order.deliveryDate < today ? "overdue" : order.deliveryDate === today ? "dueToday" : null;
  const shown = order.lines.slice(0, CARD_LINES);

  return (
    <article className="rounded-xl border border-forest/15 bg-cream p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-body text-sm font-semibold text-forest underline underline-offset-4"
        >
          {order.receiptNo !== null ? formatReceiptNo(order.receiptNo) : order.id}
        </Link>
        <span className="font-body text-sm tabular-nums text-forest">
          {t("amount", { amount: order.total })}
        </span>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-2 font-body text-xs text-stone">
        {t("cardDeliver", {
          date: format.dateTime(new Date(`${order.deliveryDate}T00:00:00+05:30`), {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
        })}
        {due && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              due === "overdue" ? "bg-terracotta text-cream" : "bg-forest text-cream"
            }`}
          >
            {t(due)}
          </span>
        )}
      </p>

      <p className="mt-2 font-body text-sm text-forest">
        {order.address.recipient}
        <span className="text-stone"> · {order.address.pincode}</span>
      </p>

      <ul className="mt-2 space-y-0.5 font-body text-sm text-forest">
        {shown.map((l) => (
          <li key={`${l.kind}:${l.key}`}>
            {l.name}{" "}
            <span className="text-stone">
              {l.grams !== null ? t("grams", { grams: l.grams }) : t("units", { count: l.units })}
            </span>
          </li>
        ))}
        {order.lines.length > CARD_LINES && (
          <li className="text-xs text-stone">
            {t("more", { count: order.lines.length - CARD_LINES })}
          </li>
        )}
      </ul>

      <div className="mt-4">
        <OrderSteps order={order} />
      </div>
    </article>
  );
}

async function StatusTable({ status }: { status: OrderStatus }) {
  const t = await getTranslations("admin.orders");
  const format = await getFormatter();
  const orders = await listOrdersByStatus(status);

  if (orders.length === 0) {
    return <p className="font-body text-sm text-stone">{t("empty", { status: t(`status.${status}`) })}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-forest/15">
            {[t("colOrder"), t("colCustomer"), t("colItems"), t("colDelivery"), t("colTotal")].map(
              (h) => (
                <th
                  key={h}
                  scope="col"
                  className="pb-3 font-body text-xs font-medium uppercase tracking-wider text-stone"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-forest/10 align-top">
              <td className="py-3 font-body text-sm">
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="font-semibold text-forest underline underline-offset-4"
                >
                  {o.receiptNo !== null ? formatReceiptNo(o.receiptNo) : o.id}
                </Link>
                <span className="mt-0.5 block text-xs text-stone">
                  {format.dateTime(new Date(o.paidAt ?? o.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </td>
              <td className="py-3 font-body text-sm text-forest">
                {o.address.recipient}
                <span className="block text-xs text-stone">{o.address.pincode}</span>
              </td>
              <td className="py-3 font-body text-sm text-forest">
                {o.lines.map((l) => `${l.name} × ${l.units}`).join(", ")}
              </td>
              <td className="py-3 font-body text-sm text-forest">
                {format.dateTime(new Date(`${o.deliveryDate}T00:00:00+05:30`), {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </td>
              <td className="py-3 font-body text-sm tabular-nums text-forest">
                {t("amount", { amount: o.total })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
