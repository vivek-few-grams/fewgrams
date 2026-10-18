"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { keepFields } from "@/lib/keep-fields";
import { NumberField, SelectField, TextField } from "../fields";
import { recordPayment } from "./actions";

/** Record a challan paid on the portal: which month it is for, when, its
 *  CPIN or CIN, and the amount in each head. */
export function PaymentForm({
  months,
  today,
  suggest,
}: {
  months: { value: string; label: string }[];
  today: string;
  /** Rupees to pre-fill per month, from the figure worked out for it. */
  suggest: Record<string, { igst: string; cgst: string; sgst: string }>;
}) {
  const t = useTranslations("admin.gst");
  const [state, action, pending] = useActionState<FormState, FormData>(recordPayment, IDLE);
  /* Controlled, so a refused save keeps what was typed. */
  const blank = { month: months[0]?.value ?? "", paidOn: today, reference: "", igst: "", cgst: "", sgst: "" };
  const [v, setV] = useState(blank);
  const set = (patch: Partial<typeof blank>) => setV((x) => ({ ...x, ...patch }));
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "saved") setV(blank);
  }
  const month = v.month;
  const errorFor = (f: string) =>
    state.status === "error" && state.field === f ? t(`errors.${state.code}`, state.values ?? {}) : undefined;
  const s = suggest[month];

  return (
    <form
      action={action}
      onSubmit={keepFields(action)}
      noValidate
      className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7 lg:items-end"
    >
      <SelectField
        label={t("payments.month")}
        name="month"
        value={month}
        onChange={(e) => set({ month: e.target.value })}
        options={months}
        error={errorFor("month")}
      />
      <label className="block">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("payments.paidOn")}
        </span>
        <input
          type="date"
          name="paidOn"
          max={today}
          value={v.paidOn}
          onChange={(e) => set({ paidOn: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm text-forest outline-none focus:border-forest"
        />
        {errorFor("paidOn") && (
          <span className="mt-1 block font-body text-[11px] text-terracotta">{errorFor("paidOn")}</span>
        )}
      </label>
      <TextField
        label={t("payments.reference")}
        name="reference"
        maxLength={30}
        value={v.reference}
        onChange={(e) => set({ reference: e.target.value })}
        error={errorFor("reference")}
      />
      <NumberField
        label={t("igst")}
        name="igst"
        placeholder={s?.igst ?? "0.00"}
        value={v.igst}
        onChange={(e) => set({ igst: e.target.value })}
      />
      <NumberField
        label={t("cgst")}
        name="cgst"
        placeholder={s?.cgst ?? "0.00"}
        value={v.cgst}
        onChange={(e) => set({ cgst: e.target.value })}
      />
      <NumberField
        label={t("sgst")}
        name="sgst"
        placeholder={s?.sgst ?? "0.00"}
        value={v.sgst}
        onChange={(e) => set({ sgst: e.target.value })}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
      >
        {t("payments.record")}
      </button>
      <div className="sm:col-span-3 lg:col-span-7">
        {state.status === "saved" && !pending && (
          <p role="status" className="font-body text-sm text-forest">
            {t("payments.saved")}
          </p>
        )}
        {state.status === "error" && !state.field && (
          <p role="alert" className="font-body text-sm text-terracotta">
            {t(`errors.${state.code}`, state.values ?? {})}
          </p>
        )}
      </div>
    </form>
  );
}
