"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Minus, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import { MAX_BOXES_PER_PLAN } from "@/lib/subscriptions/limits";
import { CHECKOUT_IDLE, type CheckoutState } from "../checkout/state";
import { openGateway } from "../checkout/open-gateway";
import { PaymentConfirming } from "../checkout/PaymentConfirming";
import {
  AddressStep,
  StepHeading,
  useAddressChoice,
  type AddressPrefill,
  type PayAddress,
} from "../checkout/AddressStep";
import { startSubscription } from "./actions";
import { boxesField } from "./fields";

export type SubscribePlan = {
  key: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  gramsPerBox: number;
  /** Bundles to start with — 1 for the plan the visitor came from. */
  initial: number;
};

/** One Saturday of the term, with each plan's varieties for its rotation week. */
export type SubscribeBox = {
  date: string;
  week: number;
  plans: Record<string, { name: string; growDays: number | null }[]>;
};


/**
 * The subscribe form: bundle counts, the four Saturdays, an address, pay.
 *
 * **The address comes first** (the owner, 26 Sep 2026): a subscription is
 * fresh greens on the own run, so the delivery area is settled before any box
 * is chosen. The step is checkout's own (`AddressStep`), so choosing, changing
 * and adding an address — PIN code first when there is none — works and looks
 * the same in both places. The plans and paying stay locked until an address
 * is accepted. It renders outside the pay
 * `<form>`, which carries the chosen id in a hidden input.
 *
 * The counts are posted as `boxes:<planKey>`, and the total only so the
 * action can refuse a price the customer was not shown — it recomputes the
 * real one from the plans as stored.
 */
export function SubscribeForm({
  locale,
  plans,
  schedule,
  addresses,
  savedCount,
  emptyBody,
  prefill,
  payable,
  gatewayLabel,
}: {
  locale: string;
  plans: SubscribePlan[];
  schedule: SubscribeBox[];
  /** Addresses in the delivery area only, default first. */
  addresses: PayAddress[];
  /** Every saved address — the limit counts them all. */
  savedCount: number;
  emptyBody: string;
  prefill: AddressPrefill;
  payable: boolean;
  gatewayLabel: string;
}) {
  const t = useTranslations("plans.subscribe");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";

  const [boxes, setBoxes] = useState<Record<string, number>>(() =>
    Object.fromEntries(plans.map((p) => [p.key, p.initial])),
  );
  const address = useAddressChoice(addresses);
  /* Address first: the plans wait until one in the delivery area is accepted. */
  const locked = !address.confirmed;
  /* With nothing saved the address is two cards — the PIN, then the form —
     so the steps after it count on by one, as on checkout. */
  const next = address.selected ? 2 : 3;
  const [confirming, setConfirming] = useState(false);

  const chosen = plans.filter((p) => (boxes[p.key] ?? 0) > 0);
  const perWeek = chosen.reduce((n, p) => n + boxes[p.key], 0);
  const total = chosen.reduce((sum, p) => sum + boxes[p.key] * p.monthlyPrice, 0);

  const [state, action, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData): Promise<CheckoutState> => {
      const next = await startSubscription(prev, fd);
      if (next.status !== "ready") return next;
      try {
        return { status: "error", code: await openGateway(next.checkout, () => setConfirming(true)) };
      } catch {
        return { status: "error", code: "notCompleted" };
      }
    },
    CHECKOUT_IDLE,
  );

  /* A price moved under the page: re-read it so the total shown is the one
     that would be charged. */
  useEffect(() => {
    if (state.status === "error" && state.code === "priceChanged") router.refresh();
  }, [state, router]);

  const error =
    state.status === "error"
      ? t.has(`errors.${state.code}`)
        ? t(`errors.${state.code}`, state.values)
        : tc.has(`errors.${state.code}`)
          ? tc(`errors.${state.code}`, state.values)
          : tc("errors.gatewayError")
      : null;

  const step = (key: string, by: number) =>
    setBoxes((b) => ({ ...b, [key]: Math.min(MAX_BOXES_PER_PLAN, Math.max(0, (b[key] ?? 0) + by)) }));

  const card = "co-card co-card--leaf p-5 md:p-6";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-10">
      <div className="min-w-0 space-y-5">
        {/* 1. Where to — first, because a subscription is fresh greens on our
            own run and nothing else on the page matters outside its area.
            Checkout's step, verbatim: a saved address in the area to accept,
            or a PIN code to check before typing one. The action checks the
            area again. */}
        <AddressStep
          n={1}
          choice={address}
          addresses={addresses}
          savedCount={savedCount}
          emptyBody={emptyBody}
          prefill={prefill}
          greensOnly
          forSubscription
        />

        {/* 2. How many of each bundle. On the page from the start so the
            customer sees what follows, but held until the address is
            accepted — the same way checkout holds its delivery partners. */}
        <section
          className={`${card} transition-opacity duration-300 ${locked ? "opacity-60" : ""}`}
          aria-labelledby="sub-bundles"
        >
          <StepHeading id="sub-bundles" n={next} done={!locked && chosen.length > 0} muted={locked}>
            {t("bundlesHeading")}
          </StepHeading>
          <p className="mt-2 font-body text-sm text-stone">{locked ? t("lockedHint") : t("bundlesHint")}</p>
          <ul className="mt-4 divide-y divide-forest/10">
            {plans.map((p) => {
              const n = boxes[p.key] ?? 0;
              return (
                <li key={p.key} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-forest">{p.name}</p>
                    <p className="mt-0.5 font-body text-sm text-stone">{p.tagline}</p>
                    <p className="mt-1 font-body text-xs text-stone">
                      {t("bundlePrice", { price: p.monthlyPrice, grams: p.gramsPerBox })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => step(p.key, -1)}
                      disabled={locked || n === 0}
                      aria-label={t("fewer", { plan: p.name })}
                      className="grid size-9 place-items-center rounded-full border border-forest/25 text-forest transition-colors hover:bg-sand disabled:opacity-40"
                    >
                      <Minus size={16} aria-hidden />
                    </button>
                    <span className="min-w-[4.5rem] text-center font-body text-sm font-semibold tabular-nums text-forest" aria-live="polite">
                      {t("boxesCount", { count: n })}
                    </span>
                    <button
                      type="button"
                      onClick={() => step(p.key, 1)}
                      disabled={locked || n >= MAX_BOXES_PER_PLAN}
                      aria-label={t("more", { plan: p.name })}
                      className="grid size-9 place-items-center rounded-full bg-forest text-cream transition-colors hover:bg-forest-deep disabled:opacity-40"
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 3. The four Saturdays, each on its own rotation week. */}
        <section
          className={`${card} transition-opacity duration-300 ${locked ? "opacity-60" : ""}`}
          aria-labelledby="sub-schedule"
        >
          <StepHeading id="sub-schedule" n={next + 1} muted={locked}>
            {t("scheduleHeading")}
          </StepHeading>
          <p className="mt-2 font-body text-sm text-stone">{t("scheduleHint")}</p>
          <ol className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {schedule.map((box, i) => (
              <li key={box.date} className="border-t border-forest/20 pt-4">
                <p className="font-body text-[11px] uppercase tracking-widest text-stone">
                  {i === 0 ? t("firstBox") : t("boxN", { n: i + 1 })} · {t("rotationWeek", { n: box.week })}
                </p>
                <p className="mt-0.5 font-display text-base font-semibold text-forest">
                  {formatDeliveryDate(fromIstDateISO(box.date), dateLocale)}
                </p>
                {(chosen.length > 0 ? chosen : plans).map((p) => (
                  <div key={p.key} className={`mt-3 ${chosen.length === 0 ? "opacity-60" : ""}`}>
                    {(chosen.length > 0 ? chosen : plans).length > 1 && (
                      <p className="font-body text-xs font-semibold text-forest">
                        {chosen.length > 0 ? t("planTimes", { plan: p.name, count: boxes[p.key] }) : p.name}
                      </p>
                    )}
                    <ul className="mt-1 space-y-1">
                      {(box.plans[p.key] ?? []).length === 0 ? (
                        <li className="font-body text-sm text-stone">{t("weekTba")}</li>
                      ) : (
                        box.plans[p.key].map((v) => (
                          <li key={v.name} className="font-body text-sm text-stone">
                            {v.name}
                            {v.growDays !== null && (
                              <span className="ml-1.5 text-xs tabular-nums text-stone/60">
                                {t("growDays", { days: v.growDays })}
                              </span>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </section>

      </div>

      {/* The summary and the pay button. */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <form action={action} className="co-card co-card--dark p-5 md:p-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="total" value={total} />
          <input type="hidden" name="addrId" value={address.confirmed ? address.addrId : ""} />
          {plans.map((p) => (
            <input key={p.key} type="hidden" name={boxesField(p.key)} value={boxes[p.key] ?? 0} />
          ))}
          <h2 className="font-display text-lg font-bold text-cream">{t("summaryHeading")}</h2>
          {chosen.length === 0 ? (
            <p className="mt-2 font-body text-sm text-cream/70">{t("summaryEmpty")}</p>
          ) : (
            <ul className="mt-4 border-t border-cream/15">
              {chosen.map((p) => (
                <li key={p.key} className="flex items-baseline justify-between gap-4 border-b border-cream/15 py-3">
                  <span className="font-body text-sm text-cream">
                    {t("planTimes", { plan: p.name, count: boxes[p.key] })}
                  </span>
                  <span className="font-body text-sm font-semibold tabular-nums text-cream">
                    {t("amount", { amount: boxes[p.key] * p.monthlyPrice })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 space-y-1.5 font-body text-sm text-cream/80">
            <div className="flex justify-between gap-4">
              <dt>{t("boxesPerWeek")}</dt>
              <dd className="tabular-nums">{perWeek}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t("firstBoxOn")}</dt>
              <dd>{schedule[0] ? formatDeliveryDate(fromIstDateISO(schedule[0].date), dateLocale) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{tc("delivery")}</dt>
              <dd>{t("deliveryIncluded")}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-cream/15 pt-4">
            <span className="font-body text-sm font-semibold text-cream">{tc("total")}</span>
            <span className="font-display text-xl font-bold tabular-nums text-cream">
              {t("amount", { amount: total })}
            </span>
          </div>

          {payable ? (
            <>
              <button
                type="submit"
                disabled={pending || total === 0 || !address.confirmed}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-cream px-5 py-3 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage disabled:bg-cream/40 disabled:text-forest/70"
              >
                <Lock size={16} strokeWidth={1.75} aria-hidden />
                {pending
                  ? t("paying")
                  : !address.confirmed
                    ? tc("payLocked")
                    : total === 0
                      ? t("summaryEmpty")
                      : t("pay", { amount: total })}
              </button>
              <p className="mt-3 flex items-start gap-1.5 font-body text-xs leading-relaxed text-cream/65">
                <ShieldCheck size={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
                {tc("payNote", { gateway: gatewayLabel })}
              </p>
            </>
          ) : (
            <p className="mt-5 font-body text-sm text-cream/80">{tc("closedBody")}</p>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-terracotta/20 p-3 font-body text-sm text-cream">
              {error}
            </p>
          )}
          <p className="mt-4 font-body text-xs leading-relaxed text-cream/65">{t("termNote")}</p>
        </form>
      </aside>

      {confirming && <PaymentConfirming title={t("confirmingTitle")} body={t("confirmingBody")} />}
    </div>
  );
}
