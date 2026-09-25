"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { sanitiseKey } from "@/lib/content/content-key";
import { addGrowMedium } from "./actions";
import { NumberField } from "../fields";

/**
 * Add a grow medium — a key, a block price and a lead time. The tray form
 * (`../trays/AddTrayForm.tsx`) with this category's module; the reasons for
 * the datalist, the keystroke sanitiser and the pre-filled lead time are
 * written out there.
 */
export function AddGrowMediumForm({ suggestions }: { suggestions: string[] }) {
  const t = useTranslations("admin.growMedia");
  const e = useTranslations("admin.growMedia.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(addGrowMedium, IDLE);
  const [key, setKey] = useState("");

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? e(state.code, state.values ?? {})
      : undefined;

  const keyError = errorFor("contentKey");

  return (
    <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block sm:col-span-2 lg:col-span-2">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("pick")}
        </span>
        <input
          name="contentKey"
          required
          value={key}
          onChange={(event) => setKey(sanitiseKey(event.target.value))}
          list="grow-media-content-keys"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          inputMode="text"
          pattern="[a-z]+(-[a-z]+)*"
          maxLength={60}
          placeholder={t("pickPlaceholder")}
          aria-invalid={keyError ? true : undefined}
          className={`mt-1.5 w-full rounded-lg border bg-cream px-3 py-2 font-body text-sm outline-none placeholder:text-stone/50 focus:border-forest ${
            keyError ? "border-terracotta" : "border-forest/25"
          }`}
        />
        <datalist id="grow-media-content-keys">
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <span className="mt-1 block font-body text-[11px] text-stone">{t("pickHint")}</span>
        {suggestions.length > 0 && (
          <span className="mt-0.5 block font-body text-[11px] text-stone/80">
            {t("pickExisting")}
          </span>
        )}
        {keyError && (
          <span className="mt-1 block font-body text-[11px] text-terracotta">{keyError}</span>
        )}
      </label>

      <NumberField
        label={t("price")}
        name="price"
        min={1}
        hint={t("priceHint")}
        error={errorFor("price")}
      />
      <NumberField
        label={t("stockPacks")}
        name="stockPacks"
        min={0}
        step={1}
        defaultValue={0}
        hint={t("stockPacksHint")}
        error={errorFor("stockPacks")}
      />

      <label className="flex items-center gap-2 font-body text-sm text-forest sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="active" defaultChecked className="size-4" />
        {t("activeLabel")}
      </label>

      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream hover:bg-forest-deep disabled:opacity-60"
        >
          {t("saveNew")}
        </button>
        {state.status === "error" && !state.field && (
          <p className="font-body text-sm text-terracotta">
            {e(state.code, state.values ?? {})}
          </p>
        )}
      </div>
    </form>
  );
}
