"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import type { RackMargin, RackRange } from "@/lib/types";
import { saveRackMargin } from "./actions";
import { NumberField } from "../fields";

/**
 * One range's markup and rounding, on that range's own screen.
 *
 * The same component on all three screens, each bound to its own `range`, so
 * a save writes that range's `MARGIN#<range>` row and nothing else (the owner,
 * 3 Oct 2026). Until then the two fields sat in the shelf-rack rates form and
 * moved every price in all three ranges.
 */
export function MarginForm({ range, margin }: { range: RackRange; margin: RackMargin }) {
  const t = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(saveRackMargin, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <form action={action} className="mt-5 space-y-6">
      <input type="hidden" name="range" value={range} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label={t("markupPercent")}
          hint={t("markupPercentHint")}
          name="markupPercent"
          defaultValue={margin.markupPercent}
          error={errorFor("markupPercent")}
        />
        <NumberField
          label={t("roundUpToNearest")}
          hint={t("roundUpToNearestHint")}
          name="roundUpToNearest"
          defaultValue={margin.roundUpToNearest}
          error={errorFor("roundUpToNearest")}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest/85 disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={14} strokeWidth={2.5} />}
          {t("save")}
        </button>
        {state.status === "error" && !state.field && (
          <p className="font-body text-xs text-terracotta">
            {t(`errors.${state.code}`, state.values ?? {})}
          </p>
        )}
      </div>
    </form>
  );
}
