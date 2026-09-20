"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { IDLE, type FormState } from "@/lib/forms";
import type { PipeSettings, RackSettings } from "@/lib/types";
import { savePipeRates } from "./actions";
import { NumberField } from "../fields";

/**
 * The rates this range prices from: **three of them editable here, the rest
 * shown read-only with a link.**
 *
 * The split is the point, and it is drawn along a real seam:
 *
 * - **Editable here** — pipe per foot, the four-way connector, the bottom
 *   bush. No other range buys any of them, so this screen is their only home.
 *   The angle screen has no rates form for exactly the opposite reason: every
 *   rate it uses belongs to the plated range too.
 * - **Read-only, edited on `/admin/racks`** — the corner leg count, the
 *   heights on sale, markup and rounding. Those are frame geometry and
 *   commercial policy, the same for all three ranges, and a second form
 *   writing them would be a second place to change the markup and one of them
 *   to forget.
 *
 * An operator still has to *see* the shared figures, or the cost column on the
 * table below is unexplained — so they are stated, not hidden.
 */
export function PipeRates({
  pipeSettings,
  settings,
  maxHeightFt,
}: {
  pipeSettings: PipeSettings | null;
  settings: RackSettings | null;
  /** `PIPE_MAX_HEIGHT_FT`, passed in rather than imported: pulling the pricing
   *  module into a client component would ship the vendor seed with it. */
  maxHeightFt: number;
}) {
  const t = useTranslations("admin.pipeRacks");
  const [state, action, pending] = useActionState<FormState, FormData>(
    savePipeRates,
    IDLE,
  );

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <div className="mt-5 space-y-6">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label={t("ratePerFt")}
            hint={t("ratePerFtHint")}
            name="ratePerFt"
            min={0}
            defaultValue={pipeSettings?.ratePerFt ?? ""}
            error={errorFor("ratePerFt")}
          />
          <NumberField
            label={t("connectorPrice")}
            hint={t("connectorPriceHint")}
            name="connectorPrice"
            min={0}
            defaultValue={pipeSettings?.connectorPrice ?? ""}
            error={errorFor("connectorPrice")}
          />
          <NumberField
            label={t("pipeBushPrice")}
            hint={t("pipeBushPriceHint")}
            name="bushPrice"
            min={0}
            defaultValue={pipeSettings?.bushPrice ?? ""}
            error={errorFor("bushPrice")}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest/85 disabled:opacity-60"
          >
            {state.status === "saved" && !pending && <Check size={14} strokeWidth={2.5} />}
            {state.status === "saved" && !pending ? t("ratesSaved") : t("saveRates")}
          </button>
          {state.status === "error" && !state.field && (
            <p className="font-body text-xs text-terracotta">
              {t(`errors.${state.code}`, state.values ?? {})}
            </p>
          )}
        </div>

        {pipeSettings === null && (
          <p className="rounded-xl border border-dashed border-forest/20 p-4 font-body text-sm text-stone">
            {t("noRates")}
          </p>
        )}
      </form>

      <div className="border-t border-forest/12 pt-5">
        <p className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("sharedLabel")}
        </p>

        {settings === null ? (
          <p className="mt-3 rounded-xl border border-dashed border-forest/20 p-4 font-body text-sm text-stone">
            {t("noSharedRates")}
          </p>
        ) : (
          <>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label={t("legsPerRack")} value={String(settings.legsPerRack)} />
              <Fact
                label={t("markupPercent")}
                value={t("percent", { value: settings.markupPercent })}
              />
              <Fact
                label={t("roundUpToNearest")}
                value={t("rupees", { amount: settings.roundUpToNearest })}
              />
              <Fact label={t("heightsFt")} value={settings.heightsFt.join(", ")} />
            </dl>
            {/* Stated whenever the shared list reaches past what pipe can
                carry, because that is the moment the two ranges visibly
                disagree and an operator would otherwise read the cap as a
                missing rack. */}
            {settings.heightsFt.some((h) => h > maxHeightFt) && (
              <p className="mt-3 font-body text-[11px] text-stone">
                {t("maxHeightNote", { max: maxHeightFt })}
              </p>
            )}
          </>
        )}

        <Link
          href="/admin/racks"
          className="mt-4 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-forest underline underline-offset-2 transition-colors hover:text-stone"
        >
          {t("editShared")}
          <ExternalLink size={13} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[10px] font-medium uppercase tracking-widest text-stone">
        {label}
      </dt>
      <dd className="mt-0.5 font-body text-sm tabular-nums text-forest">{value}</dd>
    </div>
  );
}
