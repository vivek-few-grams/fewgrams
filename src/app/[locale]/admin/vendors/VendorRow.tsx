"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import type { SupplyOption } from "./load";
import type { Vendor } from "@/lib/purchases/vendor";
import { removeVendor } from "./actions";
import { VendorForm } from "./VendorForm";

/** One vendor in the list, opening into its edit form. Delete is offered
 *  only while it has no bills; after that it can be switched off instead. */
export function VendorRow({
  vendor,
  bills,
  options,
}: {
  vendor: Vendor;
  bills: number;
  options: SupplyOption[];
}) {
  const t = useTranslations("admin.vendors");
  const tc = useTranslations("admin.common");
  const [editing, setEditing] = useState(false);
  /* In the form's order; a key whose product has gone is not shown. */
  const supplies = options.filter((o) => vendor.supplies.includes(o.key)).map((o) => o.label);

  if (editing) {
    return (
      <li className="rounded-2xl border border-forest/25 p-5">
        <VendorForm vendor={vendor} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-forest/15 p-5">
      <div className="min-w-0">
        <p className="font-display text-base font-semibold text-forest">
          {vendor.name}
          {!vendor.active && (
            <span className="ml-2 rounded-full bg-sand px-2 py-0.5 align-middle font-body text-[11px] text-stone">
              {tc("inactive")}
            </span>
          )}
        </p>
        <p className="mt-1 font-body text-sm text-stone">
          {vendor.kind === "registered"
            ? t("registeredLine", { gstin: vendor.gstin ?? "", state: vendor.state?.name ?? "" })
            : t(`kinds.${vendor.kind}`)}
          {vendor.kind === "registered" && ` · ${t(`filings.${vendor.filing}`)}`}
        </p>
        {supplies.length > 0 && (
          <p className="mt-1 font-body text-sm text-forest">
            {t("suppliesLine", { items: supplies.join(" · ") })}
          </p>
        )}
        {(vendor.phone || vendor.email) && (
          <p className="mt-0.5 font-body text-xs text-stone">
            {[vendor.phone, vendor.email].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-0.5 font-body text-xs text-stone">{t("billCount", { count: bills })}</p>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-body text-sm font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
        >
          {tc("edit")}
        </button>
        {bills === 0 && (
          <form action={removeVendor}>
            <input type="hidden" name="id" value={vendor.id} />
            <ConfirmSubmit
              label={tc("delete")}
              title={t("deleteTitle")}
              message={t("deleteConfirm", { name: vendor.name })}
              confirmLabel={tc("confirmDelete")}
              cancelLabel={tc("cancel")}
              className="font-body text-sm text-terracotta underline underline-offset-4 hover:text-terracotta/80"
            />
          </form>
        )}
      </div>
    </li>
  );
}
