"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import type { ShippingSettings } from "@/lib/repo/shipping";
import { NumberField, TextField } from "../fields";
import { saveShippingSettings } from "./actions";

/**
 * The pickup address and packing figures — one form, one save, because the
 * two only mean something together: a quote needs both an origin PIN and a
 * parcel weight.
 */
export function DeliveryForm({ settings }: { settings: ShippingSettings | null }) {
  const t = useTranslations("admin.delivery");
  const e = useTranslations("admin.delivery.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(saveShippingSettings, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field ? e(state.code, state.values ?? {}) : undefined;

  const p = settings?.pickup;
  const k = settings?.packing;

  const text = (name: string, value: string | undefined, extra?: Record<string, string>) => (
    <TextField
      label={t(`field.${name}`)}
      name={name}
      defaultValue={value}
      error={errorFor(name)}
      required
      {...extra}
    />
  );
  const num = (name: string, value: number | undefined) => (
    <NumberField
      label={t(`field.${name}`)}
      name={name}
      defaultValue={value}
      error={errorFor(name)}
      min={0}
      required
    />
  );

  return (
    <form action={action} className="mt-8 max-w-3xl space-y-8">
      <fieldset className="rounded-2xl border border-forest/12 p-5">
        <legend className="px-1 font-display text-base font-semibold text-forest">{t("pickupHeading")}</legend>
        <p className="font-body text-xs text-stone">{t("pickupHint")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {text("pickupName", p?.name)}
          {text("pickupPhone", p?.phone, { inputMode: "tel" })}
          <div className="sm:col-span-2">{text("pickupAddress", p?.address)}</div>
          {text("pickupCity", p?.city)}
          {text("pickupPincode", p?.pincode, { inputMode: "numeric", maxLength: "6" })}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-forest/12 p-5">
        <legend className="px-1 font-display text-base font-semibold text-forest">{t("greensHeading")}</legend>
        <p className="font-body text-xs text-stone">{t("greensHint")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* 200 is the owner's figure (23 Sep 2026), pre-filled only until
              the first save; after that the stored fee is what shows. */}
          {num("greenRunFee", settings?.greenRunFee ?? 200)}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-forest/12 p-5">
        <legend className="px-1 font-display text-base font-semibold text-forest">{t("packingHeading")}</legend>
        <p className="font-body text-xs text-stone">{t("packingHint")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {num("seedPackingGrams", k?.seedPackingGrams)}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          {pending ? t("saving") : t("save")}
        </button>
        {state.status === "saved" && (
          <span role="status" className="font-body text-sm text-forest">
            {t("saved")}
          </span>
        )}
        {state.status === "error" && !state.field && (
          <span role="alert" className="font-body text-sm text-terracotta">
            {e(state.code, state.values ?? {})}
          </span>
        )}
      </div>
    </form>
  );
}
