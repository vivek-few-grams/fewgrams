"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { bookParcel, type BookState } from "./actions";

/**
 * "Book with <courier>" for one parcel — the admin order page (27 Sep 2026).
 * A client component only to show what the courier answered, success or
 * refusal, without leaving the page; the booking itself and its lock are on
 * the server (`bookShipment`).
 *
 * Behind `ConfirmSubmit` because it spends wallet money. `retry` is the
 * stuck case: the operator has been told to check the courier's dashboard
 * first, and the dialog says so again.
 */
export function BookParcel({
  orderId,
  index,
  courier,
  defaultDate,
  minDate,
  retry,
}: {
  orderId: string;
  index: number;
  /** Already a display name — "Delhivery", "Xpressbees via Shiprocket". */
  courier: string;
  /** `YYYY-MM-DD`, IST. */
  defaultDate: string;
  minDate: string;
  retry: boolean;
}) {
  const t = useTranslations("admin.orders.book");
  const [state, action] = useActionState<BookState, FormData>(bookParcel, { status: "idle" });

  if (state.status === "booked") {
    return (
      <p role="status" className="mt-2 font-body text-xs font-semibold text-forest">
        {state.pickupRequested
          ? t("done", { tracking: state.trackingNumber })
          : t("doneNoPickup", { tracking: state.trackingNumber })}
      </p>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="index" value={index} />
      {retry && <input type="hidden" name="retry" value="1" />}
      <label className="flex items-center gap-2 font-body text-xs text-stone">
        {t("pickupDate")}
        <input
          type="date"
          name="pickupDate"
          defaultValue={defaultDate}
          min={minDate}
          required
          className="rounded-lg border border-forest/20 bg-cream px-2 py-1 font-body text-xs text-forest"
        />
      </label>
      <ConfirmSubmit
        label={retry ? t("retryLabel", { courier }) : t("label", { courier })}
        title={t("title", { courier })}
        message={retry ? t("retryConfirm", { courier }) : t("confirm", { courier })}
        confirmLabel={t("yes")}
        cancelLabel={t("cancel")}
        className="rounded-full bg-forest px-3 py-1 font-body text-xs font-semibold text-cream transition-colors hover:bg-forest-deep"
      />
      {state.status === "failed" && (
        <p role="alert" className="w-full font-body text-xs text-terracotta">
          {t(`error.${state.reason}`)}
          {state.detail && <span className="block font-mono text-[11px]">{state.detail}</span>}
        </p>
      )}
    </form>
  );
}
