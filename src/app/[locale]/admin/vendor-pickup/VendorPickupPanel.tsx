"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Truck } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import type { Origin } from "@/lib/repo/shipping";
import { SelectField, TextField } from "../fields";
import { addVendor, saveVendorPickups } from "./actions";

export type VendorItem = { item: string; label: string };

/**
 * The shelf-rack maker's pickup — SPEC §7 (the owner, 25 Sep 2026). Shelf
 * racks always ship from their vendor; everything else ships from ours. Only
 * admin → racks renders this.
 */
export function VendorPickupPanel({
  items,
  vendors,
  vendorOf,
  ready,
}: {
  items: VendorItem[];
  vendors: Origin[];
  vendorOf: Record<string, string>;
  /** False until admin → delivery has been saved once. */
  ready: boolean;
}) {
  const t = useTranslations("admin.vendorPickup");
  const e = useTranslations("admin.vendorPickup.errors");
  const [state, save, saving] = useActionState<FormState, FormData>(saveVendorPickups, IDLE);
  const [added, add, adding] = useActionState<FormState, FormData>(addVendor, IDLE);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>(vendorOf);

  const options = [
    { value: "", label: t("none") },
    ...vendors.map((v) => ({ value: v.id, label: t("vendorOption", { name: v.name, city: v.city, pincode: v.pincode }) })),
  ];
  const addError = (f: string) => (added.status === "error" && added.field === f ? e(added.code) : undefined);

  return (
    <section aria-labelledby="vendor-pickup" className="rounded-2xl border border-forest/15 p-6">
      <h2 id="vendor-pickup" className="flex items-center gap-2 font-display text-lg font-semibold text-forest">
        <Truck aria-hidden size={18} strokeWidth={1.75} />
        {t("heading")}
      </h2>
      <p className="mt-1 max-w-3xl font-body text-xs leading-relaxed text-stone">{t("hint")}</p>

      {!ready ? (
        <p className="mt-4 font-body text-sm text-terracotta">{e("noSettings")}</p>
      ) : (
        <>
          <form action={save} className="mt-4">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[1fr_22rem]">
              {items.map((it) => (
                <div key={it.item} className="contents">
                  <span className="self-center font-body text-sm text-forest">{it.label}</span>
                  <SelectField
                    compact
                    label={t("vendorFor", { item: it.label })}
                    name={`vendor:${it.item}`}
                    options={options}
                    value={chosen[it.item] ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setChosen((c) => ({ ...c, [it.item]: v }));
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
              >
                {saving ? t("saving") : t("save")}
              </button>
              {state.status === "saved" && <span role="status" className="font-body text-sm text-forest">{t("saved")}</span>}
              {state.status === "error" && <span role="alert" className="font-body text-sm text-terracotta">{e(state.code)}</span>}
            </div>
          </form>

          <div className="mt-6 border-t border-forest/10 pt-4">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage/30"
            >
              <Plus aria-hidden size={15} strokeWidth={2} />
              {t("addVendor")}
            </button>
            {open && (
              <form action={add} className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
                <TextField label={t("field.name")} name="name" required error={addError("name")} />
                <TextField label={t("field.phone")} name="phone" inputMode="tel" required error={addError("phone")} />
                <div className="sm:col-span-2">
                  <TextField label={t("field.address")} name="address" required error={addError("address")} />
                </div>
                <TextField label={t("field.city")} name="city" required error={addError("city")} />
                <TextField
                  label={t("field.pincode")}
                  name="pincode"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  error={addError("pincode")}
                />
                <div className="flex items-center gap-4 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={adding}
                    className="rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
                  >
                    {adding ? t("saving") : t("addVendorSave")}
                  </button>
                  {added.status === "saved" && <span role="status" className="font-body text-sm text-forest">{t("vendorAdded")}</span>}
                  {added.status === "error" && !added.field && (
                    <span role="alert" className="font-body text-sm text-terracotta">{e(added.code)}</span>
                  )}
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}
