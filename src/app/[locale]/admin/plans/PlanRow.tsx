"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { Plan } from "@/lib/types";
import { removePlan, savePlan } from "./actions";
import { CheckField, NumberField } from "../fields";
import { RotationPicker } from "./RotationPicker";
import { ROTATION_WEEKS, type VarietyChoice } from "./rotation";

/**
 * One plan, editable in place.
 *
 * A card rather than a table row, which is the deliberate divergence from
 * `VarietyRow`: a plan carries a four-week rotation, and four pickers do not
 * fit in a table cell.
 *
 * The row exists **per content file**, so `plan` is null until the plan has
 * been priced for the first time. That is why the form posts `contentKey`
 * rather than `id`: the content file is what says the plan exists, and this
 * screen only decides its numbers (SPEC §5.1.1).
 */
export function PlanRow({
  contentKey,
  name,
  plan,
  weeks,
  choices,
}: {
  contentKey: string;
  /** From the content file; null only for an orphan row whose file is gone. */
  name: string | null;
  /** The stored record, or null when this plan has never been saved. */
  plan: Plan | null;
  /** week number → variety keys currently stored. */
  weeks: Record<number, string[]>;
  choices: VarietyChoice[];
}) {
  const t = useTranslations("admin.plans");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(savePlan, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  /* Build Your Own is `monthlyPrice: null` (SPEC §5.1). An unsaved plan is
     not BYO by default — the tick box decides, and only build-your-own will
     ever have it on. */
  const isByo = plan !== null && plan.monthlyPrice === null;
  const orphan = name === null;
  const rotation = Object.fromEntries(
    ROTATION_WEEKS.map((week) => [week, weeks[week] ?? []]),
  );

  return (
    <article
      className={`rounded-2xl border p-5 ${
        orphan ? "border-terracotta/40 bg-terracotta/5" : "border-forest/15 bg-cream"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold text-forest">
            {name ?? contentKey}
            {plan?.recommended && (
              <span className="rounded-full bg-forest px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-cream">
                {t("recommendedBadge")}
              </span>
            )}
            {plan && !plan.active && (
              <span className="rounded-full bg-forest/10 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-stone">
                {t("hidden")}
              </span>
            )}
            {orphan && (
              <span className="rounded-full bg-terracotta/15 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-terracotta">
                {t("orphanTitle")}
              </span>
            )}
          </p>
          <code className="font-body text-[11px] text-stone">{contentKey}</code>
          {plan && (
            <p className="mt-1.5 font-body text-sm text-forest">
              {isByo
                ? t("byoPrice")
                : t("monthlyPrice", {
                    price: plan.monthlyPrice ?? 0,
                    grams: plan.gramsPerBox,
                  })}
            </p>
          )}
        </div>

        {/* Delete exists for one case only: the content file is gone, so
            nothing about this plan can be shown to a customer. The three real
            plans are defined by their files and are not deletable — and the
            action re-checks that, because a hidden button is not a rule. */}
        {orphan && plan && (
          <form action={removePlan} className="shrink-0">
            <input type="hidden" name="id" value={plan.id} />
            <ConfirmSubmit
              label={tc("delete")}
              title={t("deleteTitle")}
              message={t("deleteConfirm")}
              confirmLabel={tc("confirmDelete")}
              cancelLabel={tc("cancel")}
              className="font-body text-xs text-terracotta underline underline-offset-2 transition-colors hover:text-terracotta/80"
            />
          </form>
        )}
      </div>

      {orphan ? (
        <p className="mt-3 flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("orphanHint", { key: contentKey })}
        </p>
      ) : (
        !plan && (
          <p className="mt-2 font-body text-xs text-stone">{t("notConfigured")}</p>
        )
      )}

      <form action={action} className="mt-5 space-y-5">
        <input type="hidden" name="contentKey" value={contentKey} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label={t("price")}
            name="monthlyPrice"
            min={1}
            defaultValue={plan?.monthlyPrice ?? ""}
            hint={t("priceHint")}
            error={errorFor("monthlyPrice")}
          />
          <NumberField
            label={t("grams")}
            name="gramsPerBox"
            min={0}
            defaultValue={plan?.gramsPerBox ?? 400}
            hint={t("gramsHint")}
            error={errorFor("gramsPerBox")}
          />
          <NumberField
            label={t("sortOrder")}
            name="sortOrder"
            defaultValue={plan?.sortOrder ?? 0}
            hint={t("sortOrderHint")}
          />
        </div>

        <RotationPicker choices={choices} weeks={rotation} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <CheckField
            label={t("activeLabel")}
            name="active"
            defaultChecked={plan?.active ?? true}
          />
          <CheckField
            label={t("recommendedLabel")}
            name="recommended"
            defaultChecked={plan?.recommended ?? false}
          />
          <CheckField label={t("byoLabel")} name="byo" defaultChecked={isByo} />

          <button
            type="submit"
            disabled={pending}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-forest/25 px-5 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
          >
            {state.status === "saved" && !pending && <Check size={13} strokeWidth={2.5} />}
            {state.status === "saved" && !pending ? t("savedRow") : t("save")}
          </button>
        </div>

        {state.status === "error" && !state.field && (
          <p className="font-body text-[11px] text-terracotta">
            {t(`errors.${state.code}`, state.values ?? {})}
          </p>
        )}
      </form>
    </article>
  );
}
