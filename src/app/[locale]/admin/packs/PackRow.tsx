"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import { keepFields } from "@/lib/keep-fields";
import type { Pack } from "@/lib/types";
import { removePack, savePack } from "./actions";
import { CheckField, NumberField, SelectField } from "../fields";

/** Whether the pack is on sale, and the seeds its menu offers now. */
export type PackStatus = { reason: string | null; menu: number };

type Option = { value: string; label: string };

/**
 * One pack, editable in place — `PlanRow`'s card, for the same reason: the
 * row exists per content file, so `pack` is null until the first save, and
 * the form posts `contentKey` rather than an id.
 *
 * The three selects are controlled and the form submits through
 * `keepFields`: React resets a form after its action, and a controlled select
 * would show its first option while posting the chosen one (CLAUDE.md).
 */
export function PackRow({
  contentKey,
  name,
  pack,
  status,
  rackOptions,
  trayOptions,
  mediumOptions,
}: {
  contentKey: string;
  /** Null only for an orphan row whose content file is gone. */
  name: string | null;
  pack: Pack | null;
  status: PackStatus | null;
  rackOptions: Option[];
  trayOptions: Option[];
  mediumOptions: Option[];
}) {
  const t = useTranslations("admin.packs");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(savePack, IDLE);
  const [rackSku, setRackSku] = useState(pack?.rackSku ?? "");
  const [trayKey, setTrayKey] = useState(pack?.trayKey ?? trayOptions[0]?.value ?? "");
  const [mediumKey, setMediumKey] = useState(pack?.mediumKey ?? "");

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field ? t(`errors.${state.code}`) : undefined;
  const orphan = name === null;

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
            {pack?.recommended && (
              <span className="rounded-full bg-forest px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-cream">
                {t("recommendedBadge")}
              </span>
            )}
            {pack && !pack.active && (
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
          {pack && status && (
            <p className="mt-1.5 font-body text-sm text-forest">
              {t("summary", { price: pack.price, menu: status.menu })}
            </p>
          )}
          {status?.reason && (
            <p className="mt-1 flex items-start gap-1.5 font-body text-xs text-terracotta">
              <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
              {t("notOnSale", { reason: status.reason })}
            </p>
          )}
        </div>

        {orphan && pack && (
          <form action={removePack} className="shrink-0">
            <input type="hidden" name="id" value={pack.id} />
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
        !pack && <p className="mt-2 font-body text-xs text-stone">{t("notConfigured")}</p>
      )}

      <form action={action} onSubmit={keepFields(action)} noValidate className="mt-5 space-y-5">
        <input type="hidden" name="contentKey" value={contentKey} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label={t("price")}
            name="price"
            defaultValue={pack?.price ?? ""}
            hint={t("priceHint")}
            error={errorFor("price")}
          />
          <NumberField
            label={t("sortOrder")}
            name="sortOrder"
            defaultValue={pack?.sortOrder ?? 0}
            hint={t("sortOrderHint")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <SelectField
            label={t("rack")}
            name="rackSku"
            options={rackOptions}
            value={rackSku}
            onChange={(e) => setRackSku(e.target.value)}
            hint={t("rackHint")}
            error={errorFor("rackSku")}
          />
          <NumberField
            label={t("rackCount")}
            name="rackCount"
            defaultValue={pack?.rackCount || 1}
            disabled={rackSku === ""}
            error={errorFor("rackCount")}
          />
          <SelectField
            label={t("tray")}
            name="trayKey"
            options={trayOptions}
            value={trayKey}
            onChange={(e) => setTrayKey(e.target.value)}
            error={errorFor("trayKey")}
          />
          <NumberField
            label={t("trayCount")}
            name="trayCount"
            defaultValue={pack?.trayCount ?? 4}
            error={errorFor("trayCount")}
          />
          <SelectField
            label={t("medium")}
            name="mediumKey"
            options={mediumOptions}
            value={mediumKey}
            onChange={(e) => setMediumKey(e.target.value)}
            error={errorFor("mediumKey")}
          />
          <NumberField
            label={t("mediumCount")}
            name="mediumCount"
            defaultValue={pack?.mediumCount || 1}
            disabled={mediumKey === ""}
            error={errorFor("mediumCount")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label={t("seedCount")}
            name="seedCount"
            defaultValue={pack?.seedCount ?? 4}
            hint={t("seedCountHint")}
            error={errorFor("seedCount")}
          />
          <NumberField
            label={t("menuSize")}
            name="menuSize"
            defaultValue={pack?.menuSize ?? 15}
            hint={t("menuSizeHint")}
            error={errorFor("menuSize")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <CheckField label={t("onSiteLabel")} name="onSite" defaultChecked={pack?.onSite ?? true} />
          <CheckField label={t("activeLabel")} name="active" defaultChecked={pack?.active ?? true} />
          <CheckField
            label={t("recommendedLabel")}
            name="recommended"
            defaultChecked={pack?.recommended ?? false}
          />

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
          <p className="font-body text-[11px] text-terracotta">{t(`errors.${state.code}`)}</p>
        )}
      </form>
    </article>
  );
}
