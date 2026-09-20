"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import { shelvesForHeight } from "@/lib/racks/pricing";
import type { RackSettings } from "@/lib/types";
import { saveSettings } from "./actions";
import { NumberField, TextField } from "../fields";

/**
 * Rates and build rules — the layer that changes, and the one the whole screen
 * exists for.
 *
 * Two groups, visually separated, because they change at completely different
 * rates: the top row is what the vendor charges and moves whenever they
 * requote; the second is how a rack goes together and moves only if they
 * change how they supply it. Mixing them into one flat grid invited editing a
 * build rule while meaning to edit a price.
 *
 * The shelf-count readout under the heights field is the only live feedback on
 * this form, and it earns its place: `shelfPitchInches` is an abstraction
 * ("clear height per tier") whose effect is a concrete number of shelves per
 * height, and nobody should have to divide by 14 in their head to check they
 * typed the right thing.
 */
export function RatesForm({ settings }: { settings: RackSettings | null }) {
  const t = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  /* Heights are echoed from the saved settings rather than from the input, so
     the readout below always describes what is stored. An unsaved edit showing
     its own consequence would claim a rack exists that cannot be built yet.

     It is worth keeping even though `height − 1` is trivial arithmetic: it is
     the one place the screen states the rule, which is what stops someone
     wondering where the shelf count on a rack row came from. */
  const caps = settings
    ? settings.heightsFt.map((h) => ({ h, shelves: shelvesForHeight(h) }))
    : [];

  return (
    <form action={action} className="mt-5 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label={t("boltSetPrice")}
          hint={t("boltSetPriceHint")}
          name="boltSetPrice"
          min={0}
          defaultValue={settings?.boltSetPrice ?? ""}
          error={errorFor("boltSetPrice")}
        />
        <NumberField
          label={t("bushPrice")}
          hint={t("bushPriceHint")}
          name="bushPrice"
          min={0}
          defaultValue={settings?.bushPrice ?? ""}
          error={errorFor("bushPrice")}
        />
        <NumberField
          label={t("markupPercent")}
          hint={t("markupPercentHint")}
          name="markupPercent"
          min={0}
          defaultValue={settings?.markupPercent ?? 0}
          error={errorFor("markupPercent")}
        />
        <NumberField
          label={t("roundUpToNearest")}
          hint={t("roundUpToNearestHint")}
          name="roundUpToNearest"
          min={1}
          defaultValue={settings?.roundUpToNearest ?? 1}
          error={errorFor("roundUpToNearest")}
        />
      </div>

      <div className="grid gap-4 border-t border-forest/12 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label={t("legsPerRack")}
          hint={t("legsPerRackHint")}
          name="legsPerRack"
          min={1}
          defaultValue={settings?.legsPerRack ?? 4}
          error={errorFor("legsPerRack")}
        />
        <NumberField
          label={t("boltSetsPerShelf")}
          hint={t("boltSetsPerShelfHint")}
          name="boltSetsPerShelf"
          min={1}
          defaultValue={settings?.boltSetsPerShelf ?? 8}
          error={errorFor("boltSetsPerShelf")}
        />
        <NumberField
          label={t("bushesPerRack")}
          hint={t("bushesPerRackHint")}
          name="bushesPerRack"
          min={1}
          defaultValue={settings?.bushesPerRack ?? 4}
          error={errorFor("bushesPerRack")}
        />
        <TextField
          label={t("heightsFt")}
          hint={t("heightsFtHint")}
          name="heightsFt"
          defaultValue={settings?.heightsFt.join(", ") ?? ""}
          error={errorFor("heightsFt")}
        />
      </div>

      {caps.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {caps.map(({ h, shelves }) => (
            <li
              key={h}
              className="rounded-full bg-sage/50 px-3 py-1 font-body text-[11px] text-forest"
            >
              {t("shelfCap", { height: h, shelves })}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest/85 disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={14} strokeWidth={2.5} />}
          {t("save")}
        </button>
        {state.status === "error" && !state.field && (
          <p className="font-body text-xs text-terracotta">
            {t(`errors.${state.code}`, state.values ?? {})}
          </p>
        )}
      </div>
    </form>
  );
}
