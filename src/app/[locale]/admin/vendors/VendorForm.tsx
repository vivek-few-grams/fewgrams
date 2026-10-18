"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { keepFields } from "@/lib/keep-fields";
import type { Vendor } from "@/lib/purchases/vendor";
import { SelectField, TextField } from "../fields";
import { saveVendor } from "./actions";

/**
 * Add or edit a vendor — `/admin/vendors`. Without `vendor` it is the add
 * form and clears itself once saved; with one it edits that vendor and calls
 * `onDone`.
 *
 * The GSTIN field shows only for a registered vendor: the state is read off
 * its first two digits, so there is no state to pick and no way for the two
 * to disagree.
 *
 * Every input is controlled: React resets a form's uncontrolled fields when
 * its action returns, refused or not, which would wipe the form over one
 * mistyped GSTIN.
 *
 * What a vendor supplies is not here: it is picked on the product screens
 * (`SupplierPicker`), which also open this form to add a vendor on the spot.
 */
export function VendorForm({
  vendor,
  onDone,
  onAdded,
}: {
  vendor?: Vendor;
  /** Edit saved, or Cancel pressed. */
  onDone?: () => void;
  /** A new vendor saved. */
  onAdded?: () => void;
}) {
  const t = useTranslations("admin.vendors");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(saveVendor, IDLE);
  const blank = {
    name: vendor?.name ?? "",
    kind: vendor?.kind ?? "registered",
    gstin: vendor?.gstin ?? "",
    filing: vendor?.filing ?? "unknown",
    address: vendor?.address ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    notes: vendor?.notes ?? "",
    active: vendor?.active ?? true,
  };
  const [v, setV] = useState(blank);
  const set = (patch: Partial<typeof blank>) => setV((x) => ({ ...x, ...patch }));
  const kind = v.kind;

  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "saved" && !vendor) setV(blank);
  }
  /* The parent's state, so after render — not during it. */
  useEffect(() => {
    if (state.status !== "saved") return;
    if (vendor) onDone?.();
    else onAdded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per save, not per new callback
  }, [state]);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field ? t(`errors.${state.code}`) : undefined;

  return (
    <form action={action} onSubmit={keepFields(action)} noValidate className="grid gap-4 sm:grid-cols-2">
      {vendor ? (
        <input type="hidden" name="id" value={vendor.id} />
      ) : (
        <input type="hidden" name="isNew" value="1" />
      )}
      <TextField
        label={t("name")}
        name="name"
        value={v.name}
        onChange={(e) => set({ name: e.target.value })}
        error={errorFor("name")}
      />
      <SelectField
        label={t("kind")}
        name="kind"
        value={kind}
        onChange={(e) => set({ kind: e.target.value as typeof blank.kind })}
        options={[
          { value: "registered", label: t("kinds.registered") },
          { value: "unregistered", label: t("kinds.unregistered") },
          { value: "foreign", label: t("kinds.foreign") },
        ]}
        hint={t(`kindHint.${kind}`)}
        error={errorFor("kind")}
      />
      {kind === "registered" && (
        <>
          <TextField
            label={t("gstin")}
            name="gstin"
            value={v.gstin}
            onChange={(e) => set({ gstin: e.target.value.toUpperCase() })}
            maxLength={15}
            autoComplete="off"
            spellCheck={false}
            hint={t("gstinHint")}
            error={errorFor("gstin")}
          />
          <SelectField
            label={t("filing")}
            name="filing"
            value={v.filing}
            onChange={(e) => set({ filing: e.target.value as typeof blank.filing })}
            options={[
              { value: "unknown", label: t("filings.unknown") },
              { value: "monthly", label: t("filings.monthly") },
              { value: "quarterly", label: t("filings.quarterly") },
            ]}
            hint={t("filingHint")}
          />
        </>
      )}
      <TextField
        label={t("address")}
        name="address"
        value={v.address}
        onChange={(e) => set({ address: e.target.value })}
      />
      <TextField
        label={t("phone")}
        name="phone"
        value={v.phone}
        onChange={(e) => set({ phone: e.target.value })}
        inputMode="tel"
      />
      <TextField
        label={t("email")}
        name="email"
        value={v.email}
        onChange={(e) => set({ email: e.target.value })}
        inputMode="email"
      />
      <TextField
        label={t("notes")}
        name="notes"
        value={v.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />
      {vendor && (
        <label className="flex items-center gap-2 font-body text-sm text-forest">
          <input
            type="checkbox"
            name="active"
            checked={v.active}
            onChange={(e) => set({ active: e.target.checked })}
            className="size-4"
          />
          {t("activeLabel")}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          {vendor ? tc("save") : t("add")}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5"
          >
            {tc("cancel")}
          </button>
        )}
        {!vendor && state.status === "saved" && !pending && (
          <p role="status" className="font-body text-sm text-forest">
            {t("saved")}
          </p>
        )}
        {state.status === "error" && !state.field && (
          <p role="alert" className="font-body text-sm text-terracotta">
            {t(`errors.${state.code}`)}
          </p>
        )}
      </div>
    </form>
  );
}
