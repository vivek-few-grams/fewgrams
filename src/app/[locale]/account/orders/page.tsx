import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { listOrdersForUser } from "@/lib/repo/orders";
import { Card } from "../ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/orders">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.orders" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/account/orders` — SPEC §12.
 *
 * Empty today, and honestly so: nothing writes an order until checkout lands
 * (SPEC §14 phase 5), so `listOrdersForUser` returns `[]` by design rather
 * than by omission — see src/lib/repo/orders.ts. The table below is real and
 * renders from the real type, so turning orders on is a change to the
 * repository and to nothing here.
 */
export default async function OrdersPage({
  params,
}: PageProps<"/[locale]/account/orders">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("account.orders");
  const status = await getTranslations("account.orders.status");
  const format = await getFormatter();
  const actor = await requireRole("customer");

  const orders = await listOrdersForUser(actor.userId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-forest">{t("heading")}</h2>
        <p className="mt-2 max-w-xl font-body text-sm text-stone">{t("body")}</p>
      </div>

      {orders.length === 0 ? (
        <Card>
          <div className="flex flex-col items-start gap-3 py-4">
            <span className="grid size-11 place-items-center rounded-full bg-sand text-forest">
              <Package size={20} strokeWidth={1.5} />
            </span>
            <p className="font-display text-lg font-semibold text-forest">{t("empty")}</p>
            <p className="max-w-md font-body text-sm text-stone">{t("emptyBody")}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href="/#plans"
                className="rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
              >
                {t("browsePlans")}
              </Link>
              <Link
                href="/shop"
                className="rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
              >
                {t("browseShop")}
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          {/* A table, because these are five short comparable values per row
              and that is what a table is for. It scrolls sideways on a phone
              rather than reflowing into cards, so the columns stay aligned. */}
          <div className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-forest/15">
                  {[
                    t("colOrder"),
                    t("colPlaced"),
                    t("colDelivery"),
                    t("colStatus"),
                    t("colTotal"),
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="pb-3 font-body text-xs font-medium uppercase tracking-wider text-stone"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-forest/10 last:border-0">
                    <td className="py-3 font-body text-sm font-semibold text-forest">
                      <Link
                        href={`/account/orders/${order.id}`}
                        className="underline underline-offset-4"
                      >
                        {order.id}
                      </Link>
                      <span className="mt-0.5 block font-normal text-xs text-stone">
                        {t("items", { count: order.itemCount })}
                      </span>
                    </td>
                    <td className="py-3 font-body text-sm text-stone">
                      {format.dateTime(new Date(order.placedAt), { dateStyle: "medium" })}
                    </td>
                    <td className="py-3 font-body text-sm text-stone">
                      {order.deliveryDate
                        ? format.dateTime(new Date(order.deliveryDate), {
                            dateStyle: "medium",
                          })
                        : t("notScheduled")}
                    </td>
                    <td className="py-3 font-body text-sm text-forest">
                      {status(order.status)}
                    </td>
                    <td className="py-3 font-body text-sm tabular-nums text-forest">
                      {format.number(order.total, {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
