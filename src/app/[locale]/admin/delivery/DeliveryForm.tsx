"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import type { Origin, ShippingSettings } from "@/lib/repo/shipping";
import { NumberField, TextField } from "../fields";
import { saveShippingSettings } from "./actions";

/**
 * Our pickup, the vendor pickup addresses and the packing figures — one
 * form, one save. Vendors can also be added from a product's own screen,
 * where each product picks its vendor (`VendorPickupPanel`); here they are
 * edited and removed.
 */
export function DeliveryForm({ settings }: { settings: ShippingSettings | null }) {
  const t = useTranslations("admin.delivery");
  const e = useTranslations("admin.delivery.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(saveShippingSettings, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field ? e(state.code, state.values ?? {}) : undefined;

  const p = settings?.pickup;
  const [origins, setOrigins] = useState<Origin[]>(settings?.origins ?? []);
  const addOrigin = () =>
    setOrigins((os) => [
      ...os,
      { id: `loc-${Math.random().toString(36).slice(2, 8)}`, name: "", phone: "", address: "", city: "", pincode: "" },
    ]);
  const removeOrigin = (id: string) => setOrigins((os) => os.filter((o) => o.id !== id));
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
        <legend className="px-1 font-display text-base font-semibold text-forest">{t("originsHeading")}</legend>
        <p className="font-body text-xs leading-relaxed text-stone">{t("originsHint")}</p>
        <div className="mt-4 space-y-4">
          {origins.map((o, i) => (
            <div key={o.id} className="rounded-xl border border-forest/10 bg-cream/60 p-4">
              <input type="hidden" name={`origin.${i}.id`} value={o.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={t("field.originName")}
                  name={`origin.${i}.name`}
                  defaultValue={o.name}
                  error={errorFor(`origin.${i}.name`)}
                  required
                />
                <TextField
                  label={t("field.pickupPhone")}
                  name={`origin.${i}.phone`}
                  defaultValue={o.phone}
                  inputMode="tel"
                  error={errorFor(`origin.${i}.phone`)}
                  required
                />
                <div className="sm:col-span-2">
                  <TextField
                    label={t("field.pickupAddress")}
                    name={`origin.${i}.address`}
                    defaultValue={o.address}
                    error={errorFor(`origin.${i}.address`)}
                    required
                  />
                </div>
                <TextField
                  label={t("field.pickupCity")}
                  name={`origin.${i}.city`}
                  defaultValue={o.city}
                  error={errorFor(`origin.${i}.city`)}
                  required
                />
                <TextField
                  label={t("field.pickupPincode")}
                  name={`origin.${i}.pincode`}
                  defaultValue={o.pincode}
                  inputMode="numeric"
                  maxLength={6}
                  error={errorFor(`origin.${i}.pincode`)}
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => removeOrigin(o.id)}
                className="mt-3 inline-flex items-center gap-1.5 font-body text-xs font-semibold text-stone transition-colors hover:text-terracotta"
              >
                <Trash2 aria-hidden size={14} strokeWidth={1.75} />
                {t("removeOrigin")}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOrigin}
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage/30"
          >
            <Plus aria-hidden size={15} strokeWidth={2} />
            {t("addOrigin")}
          </button>
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
