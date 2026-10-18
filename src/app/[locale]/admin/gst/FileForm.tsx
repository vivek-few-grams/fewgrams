"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { TextField } from "../fields";
import { markFiled } from "./actions";

/** Mark GSTR-1 or GSTR-3B filed: the date and the ARN the portal gave. */
export function FileForm({
  quarter,
  which,
  today,
}: {
  quarter: string;
  which: "gstr1" | "gstr3b";
  today: string;
}) {
  const t = useTranslations("admin.gst");
  const [state, action, pending] = useActionState<FormState, FormData>(markFiled, IDLE);
  /* Controlled, so a refused save keeps what was typed. */
  const [filedOn, setFiledOn] = useState(today);
  const [arn, setArn] = useState("");
  const errorFor = (f: string) =>
    state.status === "error" && state.field === f ? t(`errors.${state.code}`, state.values ?? {}) : undefined;
  return (
    <form action={action} noValidate className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="quarter" value={quarter} />
      <input type="hidden" name="which" value={which} />
      <label className="block">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("filing.filedOn")}
        </span>
        <input
          type="date"
          name="filedOn"
          max={today}
          value={filedOn}
          onChange={(e) => setFiledOn(e.target.value)}
          className="mt-1.5 block rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm text-forest outline-none focus:border-forest"
        />
        {errorFor("filedOn") && (
          <span className="mt-1 block font-body text-[11px] text-terracotta">{errorFor("filedOn")}</span>
        )}
      </label>
      <div className="w-56">
        <TextField
          label={t("filing.arn")}
          name="arn"
          maxLength={30}
          autoComplete="off"
          value={arn}
          onChange={(e) => setArn(e.target.value)}
          error={errorFor("arn")}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
      >
        {t("filing.mark")}
      </button>
      {state.status === "error" && !state.field && (
        <p role="alert" className="w-full font-body text-sm text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </form>
  );
}
