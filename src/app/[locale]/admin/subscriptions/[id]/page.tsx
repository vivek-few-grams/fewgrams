import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { formatPhone } from "@/lib/account/validation";
import { firstDeliveryDate, formatDeliveryDate, fromIstDateISO, istDateISO } from "@/lib/delivery-date";
import { formatReceiptNo } from "@/lib/orders/order";
import { GATEWAY_LABEL } from "@/lib/payments/provider";
import { getSubscription } from "@/lib/repo/subscriptions";
import {
  boxesPerWeek,
  cancelDeliveries,
  changeableDeliveries,
  isSubscriptionId,
  pauseDeliveries,
  resumeDeliveries,
  subscriptionState,
  undeliveredSaturdays,
} from "@/lib/subscriptions/subscription";
import { StepSubmit } from "../../orders/StepSubmit";
import { cancelSubscription, pauseSubscription, resumeSubscription, skipSaturday } from "../actions";

export const dynamic = "force-dynamic";

/**
 * `/admin/subscriptions/[id]` — one subscription, and the four things the
 * owner can do to it (27 Sep 2026): skip a Saturday, pause, resume, cancel.
 * Each is offered only when `subscription.ts` would allow it, by asking the
 * same function the action will call — so a button can never be shown for a
 * move the server then refuses.
 */
export default async function SubscriptionAdmin({ params }: PageProps<"/[locale]/admin/subscriptions/[id]">) {
  const { id } = await params;
  if (!isSubscriptionId(id)) notFound();
  const sub = await getSubscription(id);
  if (!sub) notFound();

  const t = await getTranslations("admin.subscriptions");
  const format = await getFormatter();
  const now = new Date();
  const today = istDateISO(now);
  const openDate = istDateISO(firstDeliveryDate(now));
  const state = subscriptionState(sub, now);
  const gateway = GATEWAY_LABEL[sub.provider];
  const date = (iso: string) => formatDeliveryDate(fromIstDateISO(iso));
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  const changeable = new Set(changeableDeliveries(sub, now).map((d) => d.date));
  const canSkip = sub.status === "active";
  const canPause = pauseDeliveries(sub, now) !== null;
  const canResume = resumeDeliveries(sub, now) !== null;
  const canCancel = cancelDeliveries(sub, now) !== null;
  const owed = undeliveredSaturdays(sub, now);
  const lastDate = sub.deliveries.at(-1)?.date;

  const outline =
    "rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5";

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0">
          <p className="font-body text-xs uppercase tracking-wider text-stone">{sub.id}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-forest">
            {sub.receiptNo !== null ? formatReceiptNo(sub.receiptNo) : sub.id}
          </h1>
          <p className="mt-2 font-body text-sm text-forest">
            {t(`state.${state}`)}
            {sub.paidAt &&
              ` · ${t("detail.paidOn", { date: format.dateTime(new Date(sub.paidAt), { dateStyle: "medium" }) })}`}
          </p>
        </div>
        <div className="order-first flex flex-col items-start gap-3 md:order-none md:shrink-0 md:items-end">
          <Link
            href="/admin/subscriptions"
            className="font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
          >
            {t("detail.back")}
          </Link>
          <div className="flex flex-wrap gap-2">
            {canResume && (
              <form action={resumeSubscription}>
                <input type="hidden" name="id" value={sub.id} />
                <StepSubmit label={t("detail.resume.label")} primary />
              </form>
            )}
            {canPause && (
              <form action={pauseSubscription}>
                <input type="hidden" name="id" value={sub.id} />
                <ConfirmSubmit
                  label={t("detail.pause.label")}
                  title={t("detail.pause.title")}
                  message={t("detail.pause.confirm", { count: changeable.size })}
                  confirmLabel={t("detail.pause.yes")}
                  cancelLabel={t("detail.cancel")}
                  className={outline}
                />
              </form>
            )}
            {canCancel && (
              <form action={cancelSubscription}>
                <input type="hidden" name="id" value={sub.id} />
                <ConfirmSubmit
                  label={t("detail.cancelSub.label")}
                  title={t("detail.cancelSub.title")}
                  message={t("detail.cancelSub.confirm", {
                    count: owed,
                    boxes: owed * boxesPerWeek(sub),
                    gateway,
                  })}
                  confirmLabel={t("detail.cancelSub.yes")}
                  cancelLabel={t("detail.cancelSub.keep")}
                  className="rounded-full border border-terracotta/40 px-4 py-2 font-body text-sm font-semibold text-terracotta transition-colors hover:bg-terracotta/10"
                />
              </form>
            )}
          </div>
          {canResume && (
            <p className="font-body text-xs text-stone">
              {t("detail.resume.hint", { date: date(openDate) })}
            </p>
          )}
        </div>
      </section>

      {sub.status === "paused" && (
        <p className="rounded-2xl bg-sand/60 p-4 font-body text-sm text-forest">
          {t("detail.paused", { count: sub.held })}
        </p>
      )}
      {sub.status === "cancelled" && (
        <p className="rounded-2xl bg-sand/60 p-4 font-body text-sm text-forest">
          {t("detail.cancelledNote", { gateway })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-forest/15 p-6">
          <h2 className="font-display text-lg font-semibold text-forest">{t("detail.customerHeading")}</h2>
          <p className="mt-2 font-body text-sm text-forest">{sub.address.recipient}</p>
          <p className="font-body text-sm text-stone">
            <a href={`tel:${sub.address.phone}`} className="hover:text-forest">
              {formatPhone(sub.address.phone)}
            </a>
            {sub.email && (
              <>
                {" · "}
                <a href={`mailto:${sub.email}`} className="hover:text-forest">
                  {sub.email}
                </a>
              </>
            )}
          </p>
          <p className="mt-1 font-body text-xs text-stone">
            {[sub.address.line1, sub.address.line2, sub.address.landmark, sub.address.pincode]
              .filter(Boolean)
              .join(", ")}
          </p>
          <Link
            href={`/admin/customers/${sub.userId}`}
            className="mt-3 inline-block font-body text-sm text-forest underline underline-offset-4 hover:text-stone"
          >
            {t("detail.customerLink")}
          </Link>
        </section>

        <section className="rounded-2xl border border-forest/15 p-6">
          <h2 className="font-display text-lg font-semibold text-forest">{t("detail.plansHeading")}</h2>
          <ul className="mt-2 space-y-1">
            {sub.lines.map((l) => (
              <li key={l.planId} className="flex justify-between gap-4 font-body text-sm text-forest">
                <span>{t("planBoxes", { plan: l.name, count: l.boxes })}</span>
                <span className="tabular-nums">{money(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between gap-4 border-t border-forest/10 pt-3 font-body text-sm font-semibold text-forest">
            <span>{t("detail.total")}</span>
            <span className="tabular-nums">{money(sub.total)}</span>
          </p>
          <p className="mt-1 font-body text-xs text-stone">
            {t("boxesPerWeek", { count: boxesPerWeek(sub) })}
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("detail.saturdaysHeading")}</h2>
        <p className="mt-1 max-w-3xl font-body text-sm text-stone">{t("detail.saturdaysIntro")}</p>
        {sub.deliveries.length === 0 ? (
          <p className="mt-4 font-body text-sm text-stone">{t("detail.noSaturdays")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-forest/10 border-y border-forest/10">
            {sub.deliveries.map((d) => {
              const label =
                d.date < today
                  ? t("detail.delivered")
                  : d.date === today
                    ? t("detail.today")
                    : d.date < openDate
                      ? t("detail.sown")
                      : t("detail.upcoming");
              return (
                <li key={d.date} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-body text-sm font-semibold text-forest">{date(d.date)}</p>
                    <p className="font-body text-xs text-stone">
                      {t("week", { n: d.week })} · {label}
                    </p>
                  </div>
                  {canSkip && changeable.has(d.date) && (
                    <form action={skipSaturday}>
                      <input type="hidden" name="id" value={sub.id} />
                      <input type="hidden" name="date" value={d.date} />
                      <ConfirmSubmit
                        label={t("detail.skip.label")}
                        title={t("detail.skip.title", { date: date(d.date) })}
                        message={t("detail.skip.confirm", { last: lastDate ? date(lastDate) : date(d.date) })}
                        confirmLabel={t("detail.skip.yes")}
                        cancelLabel={t("detail.cancel")}
                        className="rounded-full border border-forest/25 px-3 py-1 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest/5"
                      />
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {sub.skipped.length > 0 && (
          <p className="mt-4 font-body text-sm text-stone">
            <span className="font-semibold text-forest">{t("detail.skippedHeading")}:</span>{" "}
            {sub.skipped.map(date).join(", ")}
          </p>
        )}
      </section>
    </div>
  );
}
