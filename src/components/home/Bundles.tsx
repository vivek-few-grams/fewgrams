"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { t, type Plan, type PlanWeek, type Variety } from "@/lib/types";
import {
  deliverySchedule,
  firstDeliveryDate,
  formatDeliveryDate,
} from "@/lib/delivery-date";
import { Sprout } from "@/components/ui/Sprout";

/**
 * Bundle cards — SPEC §18.4. Plans, their rotation weeks and every variety
 * name come from DynamoDB via the server component that renders this.
 *
 * The four-week rotation is deliberately NOT printed on the cards: three dense
 * week-by-week tables side by side is unreadable. "See the 4-week rotation"
 * expands one panel below the grid instead, which also keeps cards equal height.
 */
export type PlanWithWeeks = { plan: Plan; weeks: PlanWeek[] };

const panels = {
  sage: { card: "bg-sage", marquee: "text-forest/25" },
  forest: { card: "bg-forest", marquee: "text-mint/25" },
  sand: { card: "bg-sand", marquee: "text-forest/15" },
} as const;

/** Monthly price expressed per 100 g, so a visitor can compare a plan against
 *  buying the same greens ad hoc (SPEC §18.4, §18.6). */
function pricePer100g(p: Plan): number | null {
  if (p.monthlyPrice === null || p.gramsPerBox === 0) return null;
  return Math.round((p.monthlyPrice / (p.gramsPerBox * 4)) * 100);
}

export function Bundles({
  plans,
  varieties,
}: {
  plans: PlanWithWeeks[];
  varieties: Variety[];
}) {
  const [openRotation, setOpenRotation] = useState<string | null>(null);
  const firstDelivery = formatDeliveryDate(firstDeliveryDate());
  const schedule = deliverySchedule();
  const nameOf = (slug: string) =>
    t(varieties.find((v) => v.slug === slug)?.name) || slug;

  return (
    <section id="plans" className="scroll-mt-24 bg-cream">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12">
        <div className="max-w-2xl">
          <p className="font-body text-[11px] uppercase tracking-widest text-stone">
            Weekly plans
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
            One month, four Saturdays, nothing grown until you ask.
          </h2>
          <p className="mt-4 font-body text-sm leading-relaxed text-stone">
            Order by Friday night and your first box arrives{" "}
            <strong className="font-semibold text-forest">{firstDelivery}</strong>. Plans
            work out cheaper per 100 g than buying varieties one at a time.
          </p>
        </div>

        {plans.length === 0 ? (
          <div className="mt-10 rounded-[20px] border border-dashed border-forest/25 p-10 text-center">
            <p className="font-display text-lg font-semibold text-forest">
              No plans published yet
            </p>
            <p className="mx-auto mt-2 max-w-sm font-body text-sm text-stone">
              Create Essential, Exotic or Build Your Own and they will appear here.
            </p>
            <Link
              href="/admin/plans"
              className="mt-6 inline-block rounded-full bg-forest px-6 py-3 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
            >
              Add a plan
            </Link>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map(({ plan, weeks }) => (
              <BundleCard
                key={plan.id}
                plan={plan}
                weekCount={weeks.length}
                firstDelivery={firstDelivery}
                onShowRotation={() =>
                  setOpenRotation(openRotation === plan.id ? null : plan.id)
                }
                isRotationOpen={openRotation === plan.id}
              />
            ))}
          </div>
        )}

        {openRotation && (
          <RotationPanel
            entry={plans.find((p) => p.plan.id === openRotation)!}
            schedule={schedule}
            nameOf={nameOf}
            varieties={varieties}
            onClose={() => setOpenRotation(null)}
          />
        )}
      </div>
    </section>
  );
}

function BundleCard({
  plan,
  weekCount,
  firstDelivery,
  onShowRotation,
  isRotationOpen,
}: {
  plan: Plan;
  weekCount: number;
  firstDelivery: string;
  onShowRotation: () => void;
  isRotationOpen: boolean;
}) {
  const p = panels[plan.panel];
  const per100 = pricePer100g(plan);
  const isByo = plan.monthlyPrice === null;

  const words = isByo ? ["Your", "Pick", "Your", "Grams"] : [t(plan.name)];
  const lines = (
    <div className="px-2">
      {words.map((w, i) => (
        <span
          key={i}
          className="mcard__marquee-line text-[clamp(1.5rem,2.6vw,2.2rem)] tracking-tight"
        >
          {w}
        </span>
      ))}
    </div>
  );

  return (
    <article
      className={`relative flex flex-col rounded-[20px] border ${
        plan.recommended ? "border-forest" : "border-forest/12"
      } bg-cream p-5`}
    >
      {plan.recommended && (
        <span className="absolute -top-3 left-5 rounded-full bg-forest px-3.5 py-1 font-body text-[10px] font-semibold uppercase tracking-widest text-cream">
          Recommended
        </span>
      )}

      {/* Image panel carries the marquee — SPEC §18.4. Body copy below stays
          static so the price and ticks remain readable. */}
      <div className={`mcard flex aspect-[16/10] items-center justify-center ${p.card}`}>
        <div className={`mcard__marquee ${p.marquee}`} aria-hidden="true">
          <div className="mcard__marquee-inner">
            {lines}
            {lines}
          </div>
        </div>
        <div className="mcard__media flex h-[78%] items-center justify-center">
          <Sprout
            className="h-full"
            stroke={plan.panel === "forest" ? "#ABE1CC" : "#033923"}
            seed={plan.slug.length}
          />
        </div>
      </div>

      <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-forest">
        {t(plan.name)}
      </h3>
      <p className="mt-1.5 font-body text-sm text-stone">{t(plan.blurb)}</p>

      <dl className="mt-6 space-y-1 font-body text-sm text-forest">
        <dd>{weekCount > 0 ? `${weekCount} weekly boxes` : "4 weekly boxes"}</dd>
        <dd>
          {plan.gramsPerBox > 0 ? `~${plan.gramsPerBox} g per box` : "Grams you choose"}
        </dd>
      </dl>

      {plan.highlights.length > 0 && (
        <ul className="mt-6 space-y-2.5">
          {plan.highlights.map((h) => (
            <li key={h} className="flex gap-2.5 font-body text-sm text-stone">
              <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-forest" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-8">
        {isByo ? (
          <p className="font-display text-xl font-bold text-forest">Priced by weight</p>
        ) : (
          <>
            <p className="font-display text-2xl font-bold text-forest">
              ₹{plan.monthlyPrice!.toLocaleString("en-IN")}
              <span className="ml-1 font-body text-sm font-normal text-stone">/month</span>
            </p>
            {per100 !== null && (
              <p className="mt-0.5 font-body text-sm text-stone">₹{per100} per 100 g</p>
            )}
          </>
        )}

        <p className="mt-4 font-body text-sm text-forest">
          First box: <strong className="font-semibold">{firstDelivery}</strong>
        </p>

        <button
          className={`mt-5 w-full rounded-full px-5 py-3 font-body text-sm font-semibold transition-colors ${
            isByo
              ? "border border-forest text-forest hover:bg-forest hover:text-cream"
              : "bg-forest text-cream hover:bg-forest-deep"
          }`}
        >
          {isByo ? "Build my bundle" : "Subscribe"}
        </button>

        {weekCount > 0 && (
          <button
            onClick={onShowRotation}
            aria-expanded={isRotationOpen}
            className="mt-3 w-full font-body text-sm text-stone underline underline-offset-4 transition-colors hover:text-forest"
          >
            {isRotationOpen
              ? `Hide the ${weekCount}-week rotation`
              : `See the ${weekCount}-week rotation →`}
          </button>
        )}
      </div>
    </article>
  );
}

function RotationPanel({
  entry,
  schedule,
  nameOf,
  varieties,
  onClose,
}: {
  entry: PlanWithWeeks;
  schedule: Date[];
  nameOf: (slug: string) => string;
  varieties: Variety[];
  onClose: () => void;
}) {
  const growDaysOf = (slug: string) =>
    varieties.find((v) => v.slug === slug)?.growDays;

  return (
    <div className="mt-8 rounded-[20px] bg-sand p-6 md:p-9">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-bold tracking-tight text-forest">
            {t(entry.plan.name)} — what arrives each Saturday
          </h3>
          <p className="mt-1.5 max-w-xl font-body text-sm text-stone">
            A month is a rotation, not the same box four times. Each Sunday we sow both
            next week&apos;s fast crops and the following week&apos;s slower ones.
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
        >
          Close
        </button>
      </div>

      <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {entry.weeks.map((w, i) => (
          <li key={w.week} className="rounded-2xl bg-cream p-5">
            <p className="font-body text-[11px] uppercase tracking-widest text-stone">
              Week {w.week}
            </p>
            <p className="mt-1 font-display text-base font-semibold text-forest">
              {schedule[i] ? formatDeliveryDate(schedule[i]) : "—"}
            </p>
            <ul className="mt-4 space-y-1.5">
              {w.varietySlugs.map((slug) => (
                <li
                  key={slug}
                  className="flex items-baseline justify-between gap-2 font-body text-sm text-stone"
                >
                  <span>{nameOf(slug)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-stone/60">
                    {growDaysOf(slug) ? `${growDaysOf(slug)}d` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
