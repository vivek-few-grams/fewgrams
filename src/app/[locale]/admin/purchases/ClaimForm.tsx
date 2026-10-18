"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { keepFields } from "@/lib/keep-fields";
import { setClaim } from "./actions";

/**
 * Claim a bill's credit in a month by hand, or withdraw the claim. For a bill
 * the GSTR-2B upload could not match — the vendor typed the number
 * differently — but which the portal's statement does show.
 */
export function ClaimForm({
  billId,
  months,
  current,
}: {
  billId: string;
  /** `{ value: "2026-10", label: "October 2026" }`, open months only. */
  months: { value: string; label: string }[];
  current: string | null;
}) {
  const t = useTranslations("admin.purchases");
  const [state, action, pending] = useActionState<FormState, FormData>(setClaim, IDLE);
  /* Controlled, and submitted without React's form reset (`keepFields`):
     uncontrolled, the reset put the dropdown back to "Not claimed" after a
     claim saved, and a second press would have withdrawn it. Follows the
     stored claim when it changes underneath (an upload, another tab). */
  const [month, setMonth] = useState(current ?? "");
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setMonth(current ?? "");
  }

  return (
    <form action={action} onSubmit={keepFields(action)} noValidate className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={billId} />
      <label className="block">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("claimMonth")}
        </span>
        <select
          name="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="mt-1.5 block rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm text-forest outline-none focus:border-forest"
        >
          <option value="">{t("notClaimed")}</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-forest/25 px-5 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5 disabled:opacity-60"
      >
        {t("saveClaim")}
      </button>
      {state.status === "saved" && !pending && (
        <p role="status" className="font-body text-sm text-forest">
          {t("claimSaved")}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="font-body text-sm text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </form>
  );
}
