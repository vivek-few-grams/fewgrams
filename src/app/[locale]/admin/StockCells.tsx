"use client";

import { useActionState, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, FileText, Pencil, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { IDLE, type FormState } from "@/lib/forms";
import type { CostSource } from "@/lib/purchases/cost";

/**
 * The two read-only figures on a stocked product's row — seeds, trays and
 * cocopeat — since 18 Oct 2026, when the owner took them off the keyboard:
 * the cost comes from the latest purchase bill and the count moves with
 * bills, orders and sowings.
 */

/** What we pay, and the bill that says so — linked, so it can be checked. */
export function CostCell({ cost, source }: { cost: number | undefined; source: CostSource | undefined }) {
  const t = useTranslations("admin.stock");
  const format = useFormatter();
  if (cost === undefined) return <span className="font-body text-sm text-stone">{t("noCost")}</span>;
  return (
    <span className="block font-body text-sm tabular-nums text-forest">
      {t("costValue", { amount: cost })}
      {source ? (
        <Link
          href={`/admin/purchases/${source.billId}`}
          title={t("fromBillTitle", {
            vendor: source.vendor,
            date: format.dateTime(new Date(`${source.date}T00:00:00+05:30`), { dateStyle: "medium" }),
          })}
          className="mt-0.5 flex items-center gap-1 text-[11px] text-stone underline-offset-4 transition-colors hover:text-forest hover:underline"
        >
          <FileText aria-hidden size={11} strokeWidth={2} className="shrink-0" />
          <span className="truncate">{t("fromBill", { number: source.number })}</span>
        </Link>
      ) : (
        <span className="mt-0.5 block text-[11px] text-stone">{t("openingCost")}</span>
      )}
    </span>
  );
}

/**
 * In place of Delete on a product a purchase bill names: deleting it would
 * leave that bill naming nothing, so it could not be opened and saved again.
 */
export function OnBills({ count }: { count: number }) {
  const t = useTranslations("admin.stock");
  return (
    <span title={t("onBillsTitle")} className="whitespace-nowrap font-body text-[11px] text-stone">
      {t("onBills", { count })}
    </span>
  );
}

/**
 * The count on the shelf, with "Correct" for a stocktake — spilt seed, a
 * cracked tray, a recount. Everything else moves it by itself.
 */
export function StockCount({
  id,
  value,
  unit,
  correct,
  align = "end",
}: {
  id: string;
  value: number;
  unit: "grams" | "packs";
  correct: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Which side of its cell it sits on — the side its column heading is. */
  align?: "start" | "end";
}) {
  const t = useTranslations("admin.stock");
  const [state, action, pending] = useActionState<FormState, FormData>(correct, IDLE);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(String(value));

  /* A saved count closes the box — adjusted during render when the result
     lands, rather than in an effect (react.dev, "You might not need an
     effect"), as `SowingEditor` does. */
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "saved") setEditing(false);
  }

  if (!editing) {
    return (
      <span
        className={`flex items-center gap-2 font-body text-sm tabular-nums text-forest ${
          align === "end" ? "justify-end" : ""
        }`}
      >
        {t(unit, { count: value })}
        <button
          type="button"
          onClick={() => {
            setTyped(String(value));
            setEditing(true);
          }}
          aria-label={t("correctLabel")}
          title={t("correctLabel")}
          className="rounded-full p-1 text-stone transition-colors hover:bg-sage/60 hover:text-forest"
        >
          <Pencil aria-hidden size={12} strokeWidth={2} />
        </button>
      </span>
    );
  }

  const error = state.status === "error" ? t(`errors.${state.code}`) : null;
  return (
    <form
      action={action}
      noValidate
      className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}
    >
      <input type="hidden" name="id" value={id} />
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          name="count"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label={t("countLabel")}
          aria-invalid={error ? true : undefined}
          autoFocus
          className={`w-20 rounded-lg border bg-white px-2 py-1 text-right font-body text-sm tabular-nums outline-none focus:border-forest ${
            error ? "border-terracotta" : "border-forest/25"
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          aria-label={t("saveCount")}
          title={t("saveCount")}
          className="rounded-full bg-forest p-1.5 text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          <Check aria-hidden size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label={t("cancel")}
          title={t("cancel")}
          className="rounded-full p-1.5 text-stone transition-colors hover:bg-forest/10 hover:text-forest"
        >
          <X aria-hidden size={12} strokeWidth={2.5} />
        </button>
      </span>
      {error && (
        <span role="alert" className="font-body text-[11px] text-terracotta">
          {error}
        </span>
      )}
    </form>
  );
}
