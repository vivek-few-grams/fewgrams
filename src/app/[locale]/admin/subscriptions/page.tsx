import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { firstDeliveryDate, formatDeliveryDate, fromIstDateISO, istDateISO, nextCutoff } from "@/lib/delivery-date";
import { formatReceiptNo } from "@/lib/orders/order";
import { getPlanContent } from "@/lib/content/plans";
import { varietyNameMap } from "@/lib/content/varieties";
import { listPlansWithWeeks } from "@/lib/repo/plans";
import { listSubscriptionsByStatus } from "@/lib/repo/subscriptions";
import { listVarieties } from "@/lib/repo/varieties";
import { demandFor, type DeliveryDemand } from "@/lib/subscriptions/demand";
import { rotationWeek, upcomingSaturdays } from "@/lib/subscriptions/rotation";
import {
  boxesPerWeek,
  nextDelivery,
  subscriptionState,
  type Subscription,
} from "@/lib/subscriptions/subscription";

export const dynamic = "force-dynamic";

const VIEWS = ["active", "expired", "pending"] as const;
type View = (typeof VIEWS)[number];
const isView = (v: unknown): v is View => typeof v === "string" && (VIEWS as readonly string[]).includes(v);

/** Saturdays the tray plan looks ahead. Four is one full rotation. */
const HORIZON = 4;

/**
 * `/admin/subscriptions` — SPEC §5, §6, §12.
 *
 * Three things, in the order the owner uses them:
 *
 * 1. **The tray plan.** One card per coming Saturday: every paid box that
 *    Saturday, turned into grams of each variety, trays at the low yield, seed,
 *    and the day it has to be sown by. The card for the Saturday new
 *    subscribers are still joining is marked, since its numbers can still grow
 *    until the Friday cutoff.
 * 2. **The rotation**, on the shared calendar — which week each Saturday is,
 *    and what each plan holds that week. Edited on admin → plans; this is the
 *    read-back of what those picks mean in dates.
 * 3. **The subscriptions**, active or expired (expiry is derived from the
 *    dates, never stored), plus unpaid checkouts for looking up a customer
 *    who says they paid.
 *
 * Reads the whole `SUBSTATUS#active` partition. That is every paid
 * subscription, expired included — hundreds at most for a one-farm operation,
 * and one Query.
 */
export default async function SubscriptionsAdmin({ searchParams }: PageProps<"/[locale]/admin/subscriptions">) {
  const raw = (await searchParams).view;
  const view: View = isView(raw) ? raw : "active";
  const t = await getTranslations("admin.subscriptions");
  const format = await getFormatter();
  const now = new Date();
  const today = istDateISO(now);

  const [paid, pending, planRows, varieties, names] = await Promise.all([
    listSubscriptionsByStatus("active"),
    view === "pending" ? listSubscriptionsByStatus("pending_payment") : Promise.resolve([]),
    listPlansWithWeeks(),
    listVarieties(),
    varietyNameMap("en"),
  ]);
  const planNames = new Map(
    await Promise.all(
      planRows.map(async ({ plan }) => [plan.id, (await getPlanContent(plan.contentKey, "en"))?.text.name ?? plan.contentKey] as const),
    ),
  );
  const rotations = new Map(planRows.map(({ plan, weeks }) => [plan.id, weeks]));
  const byKey = new Map(varieties.map((v) => [v.contentKey, v]));
  const nameOf = (key: string) => names[key] ?? key;

  const current = paid.filter((s) => subscriptionState(s, now) !== "expired");
  const expired = paid.filter((s) => subscriptionState(s, now) === "expired");
  const saturdays = upcomingSaturdays(now, HORIZON);
  const demand = saturdays.map((d) => demandFor(d, paid, rotations, byKey));
  const openDate = istDateISO(firstDeliveryDate(now));
  /* The cutoff for `openDate` is the Saturday 00:00 after `now`; the last day
     to join is the Friday before it. */
  const lastDayToJoin = new Date(nextCutoff(now).getTime() - 24 * 60 * 60 * 1000);
  const subscribable = planRows.filter(({ plan }) => plan.monthlyPrice !== null && plan.active);

  const date = (iso: string) => formatDeliveryDate(fromIstDateISO(iso));
  const weight = (g: number) => (g >= 1000 ? t("kg", { kg: Math.round(g / 10) / 100 }) : t("grams", { grams: g }));
  const money = (n: number) => format.number(n, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  const list = view === "active" ? current : view === "expired" ? expired : pending;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <p className="mt-2 max-w-3xl font-body text-sm text-stone">{t("intro")}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("statActive")} value={format.number(current.length)} />
          <Stat label={t("statBoxes", { date: date(saturdays[0]) })} value={format.number(demand[0].plans.reduce((n, p) => n + p.boxes, 0))} />
          <Stat label={t("statOpen", { date: date(openDate) })} value={formatDeliveryDate(lastDayToJoin)} hint={t("statOpenHint")} />
          <Stat label={t("statExpired")} value={format.number(expired.length)} />
        </dl>
      </section>

      {/* 1. The tray plan. */}
      <section aria-labelledby="tray-plan">
        <h2 id="tray-plan" className="font-display text-xl font-semibold text-forest">{t("trayPlanHeading")}</h2>
        <p className="mt-1 max-w-3xl font-body text-sm text-stone">{t("trayPlanIntro")}</p>
        <div className="mt-5 space-y-5">
          {demand.map((d) => (
            <DemandCard
              key={d.date}
              demand={d}
              title={date(d.date)}
              badge={d.date < openDate ? t("locked") : d.date === openDate ? t("openNow") : t("openLater")}
              open={d.date >= openDate}
              planName={(id) => planNames.get(id) ?? id}
              nameOf={nameOf}
              weight={weight}
              today={today}
              date={date}
            />
          ))}
        </div>
      </section>

      {/* 2. The rotation, on the shared calendar. */}
      <section aria-labelledby="rotation">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="rotation" className="font-display text-xl font-semibold text-forest">{t("rotationHeading")}</h2>
          <Link
            href="/admin/plans"
            className="rounded-full border border-forest/25 px-4 py-1.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
          >
            {t("editRotation")}
          </Link>
        </div>
        <p className="mt-1 max-w-3xl font-body text-sm text-stone">{t("rotationIntro")}</p>
        {subscribable.length === 0 ? (
          <p className="mt-4 font-body text-sm text-stone">{t("noPlans")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-forest/15">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-forest/15 bg-sand/50">
                  <th scope="col" className={th}>{t("colSaturday")}</th>
                  {subscribable.map(({ plan }) => (
                    <th key={plan.id} scope="col" className={th}>{planNames.get(plan.id)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saturdays.map((iso) => {
                  const week = rotationWeek(fromIstDateISO(iso));
                  return (
                    <tr key={iso} className="border-b border-forest/10 last:border-0 align-top">
                      <td className={td}>
                        <span className="font-semibold text-forest">{date(iso)}</span>
                        <span className="block text-xs text-stone">{t("week", { n: week })}</span>
                      </td>
                      {subscribable.map(({ plan, weeks }) => {
                        const keys = weeks.find((w) => w.week === week)?.varietyKeys ?? [];
                        return (
                          <td key={plan.id} className={td}>
                            {keys.length === 0 ? (
                              <span className="text-terracotta">{t("weekEmpty")}</span>
                            ) : (
                              keys.map((k) => (
                                <span key={k} className="block text-forest">
                                  {nameOf(k)}
                                  <span className="ml-1 text-xs tabular-nums text-stone">
                                    {t("growDays", { days: byKey.get(k)?.growDays ?? 0 })}
                                  </span>
                                </span>
                              ))
                            )}
                            <span className="mt-1 block text-xs text-stone">
                              {t("perVariety", { grams: keys.length ? Math.round(plan.gramsPerBox / keys.length) : 0 })}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. The subscriptions themselves. */}
      <section aria-labelledby="subs">
        <h2 id="subs" className="font-display text-xl font-semibold text-forest">{t("listHeading")}</h2>
        <nav aria-label={t("filterLabel")} className="mt-3 flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={v === "active" ? "/admin/subscriptions" : `/admin/subscriptions?view=${v}`}
              aria-current={v === view ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 font-body text-sm transition-colors ${
                v === view ? "bg-forest text-cream" : "border border-forest/20 text-forest hover:bg-forest/5"
              }`}
            >
              {t(`view.${v}`, { count: v === "active" ? current.length : v === "expired" ? expired.length : pending.length })}
            </Link>
          ))}
        </nav>
        {list.length === 0 ? (
          <p className="mt-4 font-body text-sm text-stone">{t(`empty.${view}`)}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-forest/15">
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-forest/15 bg-sand/50">
                  {[t("colReceipt"), t("colCustomer"), t("colPlans"), t("colNext"), t("colSchedule"), t("colTotal")].map((h) => (
                    <th key={h} scope="col" className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <SubRow key={s.id} sub={s} now={now} date={date} money={money} t={t} format={format} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const th = "px-4 py-3 font-body text-xs font-medium uppercase tracking-wider text-stone";
const td = "px-4 py-3 font-body text-sm";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-forest/15 bg-cream p-4">
      <dt className="font-body text-xs uppercase tracking-wider text-stone">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-forest">{value}</dd>
      {hint && <p className="mt-0.5 font-body text-xs text-stone">{hint}</p>}
    </div>
  );
}

async function DemandCard({
  demand,
  title,
  badge,
  open,
  planName,
  nameOf,
  weight,
  today,
  date,
}: {
  demand: DeliveryDemand;
  title: string;
  badge: string;
  open: boolean;
  planName: (id: string) => string;
  nameOf: (key: string) => string;
  weight: (g: number) => string;
  today: string;
  date: (iso: string) => string;
}) {
  const t = await getTranslations("admin.subscriptions");
  const week = rotationWeek(fromIstDateISO(demand.date));
  const trays = demand.lines.reduce((n, l) => n + (l.trays ?? 0), 0);

  return (
    <article className="rounded-2xl border border-forest/15 bg-cream p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-forest">
            {title} <span className="font-body text-sm font-normal text-stone">· {t("week", { n: week })}</span>
          </h3>
          <p className="mt-0.5 font-body text-sm text-stone">
            {demand.plans.length === 0
              ? t("noBoxes")
              : [
                  ...demand.plans.map((p) => t("planBoxes", { plan: planName(p.planId), count: p.boxes })),
                  t("subscribers", { count: demand.subscribers }),
                ].join(" · ")}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${
            open ? "bg-forest text-cream" : "bg-sand text-stone"
          }`}
        >
          {badge}
        </span>
      </header>

      {demand.emptyWeeks.length > 0 && (
        <p className="mt-3 rounded-xl border border-terracotta/40 bg-terracotta/5 p-3 font-body text-sm text-terracotta">
          {t("emptyWeekWarning", { plans: demand.emptyWeeks.map((p) => planName(p.planId)).join(", "), n: week })}
        </p>
      )}

      {demand.lines.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-forest/15">
                {[t("colVariety"), t("colWeight"), t("colTrays"), t("colSeed"), t("colSowBy")].map((h) => (
                  <th key={h} scope="col" className="pb-2 pr-4 font-body text-xs font-medium uppercase tracking-wider text-stone">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demand.lines.map((l) => {
                const late = l.sowBy !== null && l.sowBy < today;
                return (
                  <tr key={l.varietyKey} className="border-b border-forest/10 last:border-0">
                    <td className="py-2.5 pr-4 font-body text-sm font-semibold text-forest">
                      {nameOf(l.varietyKey)}
                      <span className="block text-xs font-normal text-stone">{t("inBoxes", { count: l.boxes })}</span>
                    </td>
                    <td className="py-2.5 pr-4 font-body text-sm tabular-nums text-forest">{weight(l.grams)}</td>
                    <td className="py-2.5 pr-4 font-body text-sm tabular-nums text-forest">
                      {l.trays === null ? (
                        <span className="text-terracotta">{t("noYield")}</span>
                      ) : (
                        <>
                          <span className="text-base font-bold">{l.trays}</span>
                          {l.traysAtBest !== null && l.traysAtBest !== l.trays && (
                            <span className="ml-1.5 text-xs text-stone">{t("atBest", { count: l.traysAtBest })}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-body text-sm tabular-nums text-stone">
                      {l.seedGrams !== null ? weight(l.seedGrams) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 font-body text-sm">
                      {l.sowBy === null ? (
                        <span className="text-terracotta">{t("notInCatalogue")}</span>
                      ) : (
                        <span className={late ? "font-semibold text-terracotta" : "text-forest"}>
                          {date(l.sowBy)}
                          <span className="ml-1.5 text-xs font-normal text-stone">{t("growDays", { days: l.growDays ?? 0 })}</span>
                          {late && <span className="block text-xs">{t("late")}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 font-body text-sm font-semibold text-forest">{t("totalTrays")}</td>
                <td />
                <td className="pt-3 font-body text-base font-bold tabular-nums text-forest">{trays}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </article>
  );
}

function SubRow({
  sub,
  now,
  date,
  money,
  t,
  format,
}: {
  sub: Subscription;
  now: Date;
  date: (iso: string) => string;
  money: (n: number) => string;
  t: Awaited<ReturnType<typeof getTranslations<"admin.subscriptions">>>;
  format: Awaited<ReturnType<typeof getFormatter>>;
}) {
  const state = subscriptionState(sub, now);
  const next = nextDelivery(sub, now);
  const left = sub.deliveries.filter((d) => d.date >= istDateISO(now)).length;
  return (
    <tr className="border-b border-forest/10 last:border-0 align-top">
      <td className={td}>
        <span className="font-semibold text-forest">{sub.receiptNo !== null ? formatReceiptNo(sub.receiptNo) : sub.id}</span>
        <span className="block text-xs text-stone">
          {format.dateTime(new Date(sub.paidAt ?? sub.createdAt), { dateStyle: "medium" })}
        </span>
      </td>
      <td className={td}>
        <span className="text-forest">{sub.address.recipient}</span>
        <span className="block text-xs text-stone">{sub.email ?? "—"}</span>
        <span className="block text-xs text-stone">
          {sub.address.phone} · {sub.address.pincode}
        </span>
      </td>
      <td className={td}>
        {sub.lines.map((l) => (
          <span key={l.planId} className="block text-forest">
            {t("planBoxes", { plan: l.name, count: l.boxes })}
          </span>
        ))}
        <span className="block text-xs text-stone">{t("boxesPerWeek", { count: boxesPerWeek(sub) })}</span>
      </td>
      <td className={td}>
        {next ? (
          <>
            <span className="text-forest">{date(next.date)}</span>
            <span className="block text-xs text-stone">{t("week", { n: next.week })}</span>
          </>
        ) : (
          <span className="text-stone">{t(`state.${state}`)}</span>
        )}
      </td>
      <td className={td}>
        <span className="text-forest">{t("left", { left, total: sub.deliveries.length })}</span>
        <span className="block text-xs text-stone">
          {sub.deliveries[0] && t("range", { from: date(sub.deliveries[0].date), to: date(sub.deliveries.at(-1)!.date) })}
        </span>
      </td>
      <td className={`${td} tabular-nums text-forest`}>{money(sub.total)}</td>
    </tr>
  );
}
