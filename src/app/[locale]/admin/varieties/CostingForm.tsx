"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import type { VarietyCosting } from "@/lib/types";
import { saveVarietyCosting } from "./actions";
import { NumberField } from "../fields";

/**
 * What a tray of microgreens costs besides its seed, and the margin on top —
 * one set for every variety (the owner, 19 Oct 2026). The margin half is the
 * rack screens' `MarginForm` again, in a form of its own because one save
 * reprices from all five figures.
 */
export function CostingForm({
  costing,
  cocopeatPerTray,
}: {
  costing: VarietyCosting;
  cocopeatPerTray: number;
}) {
  const t = useTranslations("admin.varieties");
  const [state, action, pending] = useActionState<FormState, FormData>(saveVarietyCosting, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <form action={action} noValidate className="mt-5 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          label={t("cocopeatBlockCost")}
          hint={t("cocopeatBlockCostHint")}
          name="cocopeatBlockCost"
          defaultValue={costing.cocopeatBlockCost}
          error={errorFor("cocopeatBlockCost")}
        />
        <NumberField
          label={t("traysPerBlock")}
          hint={t("traysPerBlockHint")}
          name="traysPerBlock"
          inputMode="numeric"
          defaultValue={costing.traysPerBlock}
          error={errorFor("traysPerBlock")}
        />
        <NumberField
          label={t("overheadPerTray")}
          hint={t("overheadPerTrayHint")}
          name="overheadPerTray"
          defaultValue={costing.overheadPerTray}
          error={errorFor("overheadPerTray")}
        />
        <NumberField
          label={t("markupPercent")}
          hint={t("markupPercentHint")}
          name="markupPercent"
          defaultValue={costing.margin.markupPercent}
          error={errorFor("markupPercent")}
        />
        <NumberField
          label={t("roundUpToNearest")}
          hint={t("roundUpToNearestHint")}
          name="roundUpToNearest"
          inputMode="numeric"
          defaultValue={costing.margin.roundUpToNearest}
          error={errorFor("roundUpToNearest")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest/85 disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={14} strokeWidth={2.5} />}
          {t("save")}
        </button>
        {/* From the saved figures, not the inputs being typed: it is what the
            prices below were worked out with. */}
        <p className="font-body text-xs tabular-nums text-stone">
          {t("cocopeatPerTray", { amount: Math.round(cocopeatPerTray * 100) / 100 })}
        </p>
        {state.status === "error" && !state.field && (
          <p className="font-body text-xs text-terracotta">{t(`errors.${state.code}`, state.values ?? {})}</p>
        )}
      </div>
    </form>
  );
}
