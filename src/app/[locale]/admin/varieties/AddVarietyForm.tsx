"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { sanitiseKey } from "@/lib/content/content-key";
import { addVariety } from "./actions";
import { NumberField } from "../fields";

/**
 * Add a variety.
 *
 * The key is a **text field with a datalist**, not a select. A select could
 * only offer keys that already had a content file, which meant you had to
 * open a code editor before you could add a variety from the admin UI — the
 * wrong order for the person who grows the greens. Typing a new key works;
 * existing content files show up as suggestions so a second variety in the
 * same family is easy to match.
 *
 * The field **cannot hold an invalid key**: `sanitiseKey` runs on every
 * keystroke, so a-z and hyphens are all that survive. That is a convenience,
 * not the gate — `isValidContentKey` on the server is, because a form field
 * is not a security boundary (SPEC §8). `pattern` is the third layer, for a
 * paste that somehow bypasses both.
 */
export function AddVarietyForm({ suggestions }: { suggestions: string[] }) {
  const t = useTranslations("admin.varieties");
  const e = useTranslations("admin.varieties.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(addVariety, IDLE);
  const [key, setKey] = useState("");

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? e(state.code, state.values ?? {})
      : undefined;

  const keyError = errorFor("contentKey");

  /* The five numbers sit on one row from `lg` up, so the form reads as a band
     rather than a column of wide, half-empty inputs. Five rather than four
     since 19 Sep 2026, when the yield became a min/max pair instead of one
     figure. */
  return (
    <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="block sm:col-span-2 lg:col-span-5">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("pick")}
        </span>
        <input
          name="contentKey"
          required
          value={key}
          onChange={(event) => setKey(sanitiseKey(event.target.value))}
          list="variety-content-keys"
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
        <datalist id="variety-content-keys">
          {suggestions.map((key) => (
            <option key={key} value={key} />
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
        label={t("growDays")}
        name="growDays"
        defaultValue="7"
        min={1}
        hint={t("growDaysHint")}
        error={errorFor("growDays")}
      />
      <NumberField
        label={t("yieldMin")}
        name="yieldGramsPerTrayMin"
        defaultValue="250"
        min={1}
        hint={t("yieldHint")}
        error={errorFor("yieldGramsPerTrayMin")}
      />
      <NumberField
        label={t("yieldMax")}
        name="yieldGramsPerTrayMax"
        defaultValue="350"
        min={1}
        error={errorFor("yieldGramsPerTrayMax")}
      />
      <NumberField
        label={t("price")}
        name="pricePerTray"
        defaultValue="200"
        min={1}
        hint={t("priceHint")}
        error={errorFor("pricePerTray")}
      />
      <NumberField
        label={t("seed")}
        name="seedGramsPerTray"
        min={1}
        hint={t("seedHint")}
      />

      <label className="flex items-center gap-2 font-body text-sm text-forest sm:col-span-2 lg:col-span-5">
        <input type="checkbox" name="active" defaultChecked className="size-4" />
        {t("activeLabel")}
      </label>

      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-5">
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
