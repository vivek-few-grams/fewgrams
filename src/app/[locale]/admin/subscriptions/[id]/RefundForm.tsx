"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import { keepFields } from "@/lib/keep-fields";
import { NumberField } from "../../fields";
import { recordRefund } from "../actions";

/**
 * Record the refund made in the gateway for a cancelled subscription, and
 * issue its credit note — the amount in rupees, behind `ConfirmSubmit`
 * because the note cannot be taken back. The dialog repeats the amount
 * typed, so a slip of a digit is seen before the number is drawn.
 */
export function RefundForm({
  id,
  gateway,
  hint,
  suggested,
}: {
  id: string;
  gateway: string;
  /** What was paid and what the Saturdays not delivered come to, worded. */
  hint: string;
  /** Rupees for the placeholder: the Saturdays not delivered. */
  suggested: string;
}) {
  const t = useTranslations("admin.subscriptions.detail.refund");
  const [state, action] = useActionState<FormState, FormData>(recordRefund, IDLE);
  /* Controlled, so a refused save keeps what was typed. */
  const [amount, setAmount] = useState("");
  const typed = Number(amount.replace(/[₹,\s]/g, ""));
  const shown = amount.trim() !== "" && Number.isFinite(typed) && typed > 0;
  const fieldError =
    state.status === "error" && state.field === "amount" ? t(`errors.${state.code}`) : undefined;

  return (
    <form
      action={action}
      onSubmit={keepFields(action)}
      noValidate
      className="mt-4 flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <div className="w-44">
        <NumberField
          label={t("amount")}
          name="amount"
          placeholder={suggested}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={fieldError}
        />
      </div>
      <ConfirmSubmit
        label={t("label")}
        title={shown ? t("titleAmount", { amount: typed }) : t("title")}
        message={t("confirm", { gateway })}
        confirmLabel={t("yes")}
        cancelLabel={t("keep")}
        className="rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
      />
      <p className="w-full font-body text-xs text-stone">{hint}</p>
      {state.status === "error" && !state.field && (
        <p role="alert" className="w-full font-body text-sm text-terracotta">
          {t(`errors.${state.code}`)}
        </p>
      )}
    </form>
  );
}
