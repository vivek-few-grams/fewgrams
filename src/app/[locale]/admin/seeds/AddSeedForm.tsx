"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { IDLE, type FormState } from "@/lib/forms";
import { sanitiseKey } from "@/lib/content/content-key";
import { addSeed } from "./actions";
import { NumberField } from "../fields";

/**
 * Add a seed — a key, a price per 100 g and the grams on the shelf.
 *
 * The key is a **text field with a datalist**, not a select, for the same
 * reason as on `/admin/varieties`: a select could only offer keys that already
 * had a content file, which would mean opening a code editor before a sack of
 * seed could be priced. Typing a new key works; existing content files show up
 * as suggestions so the row and the file end up agreeing.
 *
 * The field **cannot hold an invalid key**: `sanitiseKey` runs on every
 * keystroke, so a–z and hyphens are all that survive. That is a convenience,
 * not the gate — `isValidContentKey` on the server is, because a form field is
 * not a security boundary (SPEC §8). `pattern` is the third layer, for a paste
 * that somehow bypasses both.
 */
export function AddSeedForm({ suggestions }: { suggestions: string[] }) {
  const t = useTranslations("admin.seeds");
  const e = useTranslations("admin.seeds.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(addSeed, IDLE);
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
          list="seed-content-keys"
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
        <datalist id="seed-content-keys">
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
        name="pricePer50g"
        min={1}
        hint={t("priceHint")}
        error={errorFor("pricePer50g")}
      />
      {/* `min={0}` and no default: zero grams is a real answer (it is how sold
          out is stored), but an *empty* field is not — the action rejects it
          rather than reading it as a deliberate zero. */}
      <NumberField
        label={t("stock")}
        name="stockGrams"
        min={0}
        hint={t("stockHint")}
        error={errorFor("stockGrams")}
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
