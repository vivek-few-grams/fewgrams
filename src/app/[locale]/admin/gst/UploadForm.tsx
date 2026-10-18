"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { uploadGstr2b } from "./actions";

/** Upload a GSTR-2B JSON downloaded from the portal. */
export function UploadForm() {
  const t = useTranslations("admin.gst");
  const [state, action, pending] = useActionState<FormState, FormData>(uploadGstr2b, IDLE);
  return (
    <form action={action} noValidate className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("match.file")}
        </span>
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          className="mt-1.5 block font-body text-sm text-forest file:mr-3 file:rounded-full file:border-0 file:bg-forest file:px-4 file:py-2 file:font-body file:text-sm file:font-semibold file:text-cream"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
      >
        {pending ? t("match.uploading") : t("match.upload")}
      </button>
      {state.status === "saved" && !pending && (
        <p role="status" className="w-full font-body text-sm text-forest">
          {t("match.uploaded")}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="w-full font-body text-sm text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </form>
  );
}
