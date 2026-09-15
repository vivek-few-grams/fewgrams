"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Crosshair, MapPin } from "lucide-react";
import type { Address, Geo } from "@/lib/types";
import { Field, FormMessage, PrimaryButton, TextareaField } from "../ui";
import { saveAddressAction } from "../actions";
import { IDLE, type FormState } from "@/lib/forms";

type LocateState = "idle" | "locating" | "denied" | "error" | "unsupported";

/**
 * Add or edit one address.
 *
 * The same component does both: an edit is an add that carries `addrId`, and
 * the server action treats a missing id as "create". Two near-identical forms
 * is how field lists drift apart.
 *
 * On validation, the browser attributes here (`required`, `pattern`,
 * `inputMode`) exist to fail fast on a phone keyboard. They are not the gate —
 * `validateAddress` on the server is, and it is the only thing that checks the
 * PIN against the delivery area (SPEC §7, §8).
 */
export function AddressForm({
  address,
  defaultRecipient = "",
  defaultPhone = "",
  defaultCity,
  onDone,
  onCancel,
}: {
  address?: Address;
  defaultRecipient?: string;
  defaultPhone?: string;
  defaultCity: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("account.addresses");
  const e = useTranslations("account.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveAddressAction,
    IDLE,
  );

  /* The pinned location is component state, not an input the customer types,
     so it rides along in hidden fields. Initialised from the saved address so
     editing a landmark does not silently drop the pin. */
  const [geo, setGeo] = useState<Geo | null>(address?.geo ?? null);
  const [locating, setLocating] = useState<LocateState>("idle");

  useEffect(() => {
    if (state.status === "saved") onDone();
    // `onDone` is a fresh closure on every parent render; depending on it
    // would re-run this on renders that changed nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  function locate() {
    if (!("geolocation" in navigator)) {
      setLocating("unsupported");
      return;
    }
    setLocating("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          ...(Number.isFinite(pos.coords.accuracy)
            ? { accuracyM: Math.round(pos.coords.accuracy) }
            : {}),
        });
        setLocating("idle");
      },
      (err) => setLocating(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      // A stale fix from another part of the city is worse than none, so the
      // cached position is refused outright.
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? e(state.code, state.values ?? {})
      : undefined;

  return (
    <form action={action} className="space-y-5">
      {address && <input type="hidden" name="addrId" value={address.addrId} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t("label")}
          name="label"
          maxLength={24}
          defaultValue={address?.label ?? ""}
          placeholder={t("labelPlaceholder")}
          hint={t("labelHint")}
        />
        <Field
          label={t("recipient")}
          name="recipient"
          required
          autoComplete="name"
          defaultValue={address?.recipient ?? defaultRecipient}
          placeholder={t("recipientPlaceholder")}
          error={errorFor("recipient")}
        />
        <Field
          label={t("phone")}
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          defaultValue={address?.phone ?? defaultPhone}
          placeholder={t("phonePlaceholder")}
          error={errorFor("phone")}
        />
        <Field
          label={t("line1")}
          name="line1"
          required
          autoComplete="address-line1"
          defaultValue={address?.line1 ?? ""}
          placeholder={t("line1Placeholder")}
          error={errorFor("line1")}
        />
        <Field
          label={t("line2")}
          name="line2"
          autoComplete="address-line2"
          defaultValue={address?.line2 ?? ""}
          placeholder={t("line2Placeholder")}
        />
        <Field
          label={t("landmark")}
          name="landmark"
          defaultValue={address?.landmark ?? ""}
          placeholder={t("landmarkPlaceholder")}
        />
        <Field
          label={t("city")}
          name="city"
          required
          autoComplete="address-level2"
          defaultValue={address?.city ?? defaultCity}
          error={errorFor("city")}
        />
        <Field
          label={t("pincode")}
          name="pincode"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          autoComplete="postal-code"
          defaultValue={address?.pincode ?? ""}
          hint={t("pincodeHint")}
          error={errorFor("pincode")}
        />
      </div>

      <TextareaField
        label={t("notes")}
        name="notes"
        defaultValue={address?.notes ?? ""}
        placeholder={t("notesPlaceholder")}
        maxLength={200}
      />

      {/* Delivery location — SPEC §7. Browser geolocation rather than a map
          picker on purpose: a map means a keyed, billed provider, and this
          needs neither. It is strictly optional, so every branch below still
          lets the address save. */}
      <fieldset className="rounded-xl border border-forest/15 p-4">
        <legend className="px-1 font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("locationTitle")}
        </legend>

        {geo && (
          <>
            <input type="hidden" name="lat" value={geo.lat} />
            <input type="hidden" name="lng" value={geo.lng} />
            {geo.accuracyM !== undefined && (
              <input type="hidden" name="accuracyM" value={geo.accuracyM} />
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={locate}
            disabled={locating === "locating"}
            className="flex items-center gap-2 rounded-full border border-forest/25 px-4 py-2 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
          >
            <Crosshair size={14} strokeWidth={1.75} />
            {locating === "locating" ? t("locating") : t("useMyLocation")}
          </button>

          {geo && (
            <button
              type="button"
              onClick={() => setGeo(null)}
              className="font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
            >
              {t("clearLocation")}
            </button>
          )}
        </div>

        <p className="mt-3 flex items-start gap-2 font-body text-xs text-stone">
          {geo ? (
            <>
              <MapPin size={14} strokeWidth={1.75} className="mt-px shrink-0 text-forest" />
              {geo.accuracyM !== undefined
                ? t("located", { metres: geo.accuracyM })
                : t("locatedNoAccuracy")}
            </>
          ) : locating === "denied" ? (
            t("locationDenied")
          ) : locating === "unsupported" ? (
            t("locationUnsupported")
          ) : locating === "error" ? (
            t("locationError")
          ) : (
            t("locationHint")
          )}
        </p>
      </fieldset>

      <label className="flex items-center gap-2 font-body text-sm text-forest">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="size-4"
        />
        {t("makeDefault")}
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </PrimaryButton>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
          >
            {t("cancel")}
          </button>
        )}

        {state.status === "error" && !state.field && (
          <FormMessage tone="bad">{e(state.code, state.values ?? {})}</FormMessage>
        )}
      </div>
    </form>
  );
}

