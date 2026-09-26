import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { formatReceiptNo } from "@/lib/orders/order";
import { formatDeliveryDate, fromIstDateISO, istDateISO } from "@/lib/delivery-date";
import { getSubscription, listSubscriptionsForUser } from "@/lib/repo/subscriptions";
import {
  boxesPerWeek,
  isSubscriptionId,
  subscriptionState,
  type Subscription,
} from "@/lib/subscriptions/subscription";
import { Card } from "../ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/subscriptions">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.subscriptions" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/account/subscriptions` — SPEC §5, §12. Every paid subscription, with its
 * four Saturdays and which of them are still to come.
 *
 * The payment return route lands here with `?paid=<id>`. That subscription
 * may still be `pending_payment` for a few seconds if the gateway was slow,
 * and an unpaid one is not in the customer index this page lists from — so it
 * is read by id (and checked to be theirs) to say "confirming" rather than
 * let the list look as if the payment vanished.
 */
export default async function SubscriptionsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/account/subscriptions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.subscriptions");
  const format = await getFormatter();
  const actor = await requireRole("customer");
  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";

  const paidParam = (await searchParams).paid;
  const paidId = typeof paidParam === "string" && isSubscriptionId(paidParam) ? paidParam : null;
  const [subs, justPaid] = await Promise.all([
    listSubscriptionsForUser(actor.userId),
    paidId ? getSubscription(paidId) : Promise.resolve(null),
  ]);
  const landed = justPaid && justPaid.userId === actor.userId ? justPaid : null;
  const today = istDateISO(new Date());
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  const row = (sub: Subscription) => {
    const state = subscriptionState(sub);
    return (
      <Card key={sub.id}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold text-forest">
              {sub.lines.map((l) => t("planTimes", { plan: l.name, count: l.boxes })).join(" + ")}
            </p>
            <p className="mt-0.5 font-body text-xs text-stone">
              {sub.receiptNo !== null ? formatReceiptNo(sub.receiptNo) : sub.id} ·{" "}
              {t("boxesPerWeek", { count: boxesPerWeek(sub) })} · {money(sub.total)}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${
              state === "expired" ? "bg-sand text-stone" : "bg-forest text-cream"
            }`}
          >
            {t(`state.${state}`)}
          </span>
        </div>
        <ol className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {sub.deliveries.map((d) => {
            const past = d.date < today;
            return (
              <li key={d.date} className={`border-t pt-3 ${past ? "border-forest/10" : "border-forest/30"}`}>
                <p className="font-body text-[11px] uppercase tracking-widest text-stone">
                  {t("week", { n: d.week })}
                </p>
                <p className={`mt-0.5 font-body text-sm font-semibold ${past ? "text-stone" : "text-forest"}`}>
                  {formatDeliveryDate(fromIstDateISO(d.date), dateLocale)}
                </p>
                {past && <p className="font-body text-xs text-stone">{t("delivered")}</p>}
              </li>
            );
          })}
        </ol>
        <p className="mt-4 font-body text-xs text-stone">
          {t("deliverTo", { name: sub.address.recipient, pincode: sub.address.pincode })}
        </p>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div data-account-intro>
        <h2 className="font-display text-xl font-semibold text-forest">{t("heading")}</h2>
        <p className="mt-2 max-w-xl font-body text-sm text-stone">{t("body")}</p>
      </div>

      {landed && (
        <div role="status" className="rounded-2xl bg-forest p-5 font-body text-sm text-cream">
          <p className="font-semibold">
            {landed.status === "active" ? t("paidHeading") : t("confirmingHeading")}
          </p>
          <p className="mt-1 text-cream/80">
            {landed.status === "active" && landed.deliveries[0]
              ? t("paidBody", { date: formatDeliveryDate(fromIstDateISO(landed.deliveries[0].date), dateLocale) })
              : t("confirmingBody")}
          </p>
        </div>
      )}

      {subs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-start gap-3 py-4">
            <span className="grid size-11 place-items-center rounded-full bg-forest text-cream">
              <CalendarDays size={20} strokeWidth={1.5} />
            </span>
            <p className="font-display text-lg font-semibold text-forest">{t("empty")}</p>
            <p className="max-w-md font-body text-sm text-stone">{t("emptyBody")}</p>
            <Link
              href="/#plans"
              className="mt-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
            >
              {t("browsePlans")}
            </Link>
          </div>
        </Card>
      ) : (
        subs.map(row)
      )}
    </div>
  );
}
