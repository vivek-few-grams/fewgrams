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
 *
 * **One form on all three rack screens** (the owner, 3 Oct 2026: the angle and
 * pipe screens showed these read-only behind a link, and the inconsistency
 * read as a form that needed unlocking). It is still one `SETTINGS` row — every
 * screen writes the same record through the same `saveSettings`, so there is
 * no second copy of a bolt price to forget. `show` picks the fields a screen
 * displays; the rest ride along as hidden inputs at their stored value, which
 * is what lets the pipe screen offer only the two fields pipe uses without the
 * action learning about partial saves.
 */
export type SettingsField =
  | "boltSetPrice"
  | "bushPrice"
  | "legsPerRack"
  | "boltSetsPerShelf"
  | "bushesPerRack"
  | "heightsFt"
  | "anglePack"
  | "fixingWeights";

const ALL_FIELDS: readonly SettingsField[] = [
  "boltSetPrice",
  "bushPrice",
  "legsPerRack",
  "boltSetsPerShelf",
  "bushesPerRack",
  "heightsFt",
  "anglePack",
  "fixingWeights",
];

export function RatesForm({
  settings,
  show = ALL_FIELDS,
}: {
  settings: RackSettings | null;
  show?: readonly SettingsField[];
}) {
  const t = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  const shown = (f: SettingsField) => show.includes(f);
  /* An error on a field this screen hides has nowhere inline to go, so it
     joins the form-level message rather than vanishing. */
  const hiddenField = (field: string) =>
    !shown(
      (field === "angleWidthCm" || field === "angleStackCm"
        ? "anglePack"
        : field === "boltSetGrams" || field === "bushGrams"
          ? "fixingWeights"
          : field) as SettingsField,
    );
  const formError =
    state.status === "error" && (!state.field || hiddenField(state.field))
      ? t(`errors.${state.code}`, state.values ?? {})
      : null;

  /* The stored value of every field this screen does not show, so a save here
     writes them back unchanged. */
  const carried: Record<string, string | number | undefined> = {
    ...(shown("boltSetPrice") ? {} : { boltSetPrice: settings?.boltSetPrice }),
    ...(shown("bushPrice") ? {} : { bushPrice: settings?.bushPrice }),
    ...(shown("legsPerRack") ? {} : { legsPerRack: settings?.legsPerRack }),
    ...(shown("boltSetsPerShelf") ? {} : { boltSetsPerShelf: settings?.boltSetsPerShelf }),
    ...(shown("bushesPerRack") ? {} : { bushesPerRack: settings?.bushesPerRack }),
    ...(shown("heightsFt") ? {} : { heightsFt: settings?.heightsFt.join(", ") }),
    ...(shown("anglePack")
      ? {}
      : { angleWidthCm: settings?.angleWidthCm, angleStackCm: settings?.angleStackCm }),
    ...(shown("fixingWeights")
      ? {}
      : { boltSetGrams: settings?.boltSetGrams, bushGrams: settings?.bushGrams }),
  };

  /* Heights are echoed from the saved settings rather than from the input, so
     the readout below always describes what is stored. An unsaved edit showing
     its own consequence would claim a rack exists that cannot be built yet.

     It is worth keeping even though `height − 1` is trivial arithmetic: it is
     the one place the screen states the rule, which is what stops someone
     wondering where the shelf count on a rack row came from. */
  const caps = settings
    ? settings.heightsFt.map((h) => ({ h, shelves: shelvesForHeight(h) }))
    : [];

  const partsRow = shown("boltSetPrice") || shown("bushPrice") || shown("fixingWeights");
  const buildRow =
    shown("legsPerRack") || shown("boltSetsPerShelf") || shown("bushesPerRack") || shown("heightsFt");

  return (
    <form action={action} className="mt-5 space-y-6">
      {Object.entries(carried).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value ?? ""} />
      ))}

      {partsRow && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown("boltSetPrice") && (
            <NumberField
              label={t("boltSetPrice")}
              hint={t("boltSetPriceHint")}
              name="boltSetPrice"
              defaultValue={settings?.boltSetPrice ?? ""}
              error={errorFor("boltSetPrice")}
            />
          )}
          {shown("bushPrice") && (
            <NumberField
              label={t("bushPrice")}
              hint={t("bushPriceHint")}
              name="bushPrice"
              defaultValue={settings?.bushPrice ?? ""}
              error={errorFor("bushPrice")}
            />
          )}
          {/* What the same two parts weigh, beside what they cost — the
              fixings in every steel rack's courier weight (`rackGrams`). */}
          {shown("fixingWeights") && (
            <>
              <NumberField
                label={t("boltSetGrams")}
                hint={t("boltSetGramsHint")}
                name="boltSetGrams"
                defaultValue={settings?.boltSetGrams ?? ""}
                error={errorFor("boltSetGrams")}
              />
              <NumberField
                label={t("bushGrams")}
                hint={t("bushGramsHint")}
                name="bushGrams"
                defaultValue={settings?.bushGrams ?? ""}
                error={errorFor("bushGrams")}
              />
            </>
          )}
        </div>
      )}

      {buildRow && (
        <div
          className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${
            partsRow ? "border-t border-forest/12 pt-6" : ""
          }`}
        >
          {shown("legsPerRack") && (
            <NumberField
              label={t("legsPerRack")}
              hint={t("legsPerRackHint")}
              name="legsPerRack"
              defaultValue={settings?.legsPerRack ?? 4}
              error={errorFor("legsPerRack")}
            />
          )}
          {shown("boltSetsPerShelf") && (
            <NumberField
              label={t("boltSetsPerShelf")}
              hint={t("boltSetsPerShelfHint")}
              name="boltSetsPerShelf"
              defaultValue={settings?.boltSetsPerShelf ?? 8}
              error={errorFor("boltSetsPerShelf")}
            />
          )}
          {shown("bushesPerRack") && (
            <NumberField
              label={t("bushesPerRack")}
              hint={t("bushesPerRackHint")}
              name="bushesPerRack"
              defaultValue={settings?.bushesPerRack ?? 4}
              error={errorFor("bushesPerRack")}
            />
          )}
          {shown("heightsFt") && (
            <TextField
              label={t("heightsFt")}
              hint={t("heightsFtHint")}
              name="heightsFt"
              defaultValue={settings?.heightsFt.join(", ") ?? ""}
              error={errorFor("heightsFt")}
            />
          )}
        </div>
      )}

      {shown("anglePack") && (
        <div className="border-t border-forest/12 pt-6">
          <h3 className="font-display text-sm font-semibold text-forest">{t("anglePackHeading")}</h3>
          <p className="mt-1 max-w-3xl font-body text-xs leading-relaxed text-stone">{t("anglePackHint")}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              label={t("angleWidthCm")}
              name="angleWidthCm"
              defaultValue={settings?.angleWidthCm ?? ""}
              error={errorFor("angleWidthCm") ?? (settings && settings.angleWidthCm === undefined ? t("packMissing") : undefined)}
            />
            <NumberField
              label={t("angleStackCm")}
              name="angleStackCm"
              defaultValue={settings?.angleStackCm ?? ""}
              error={errorFor("angleStackCm") ?? (settings && settings.angleStackCm === undefined ? t("packMissing") : undefined)}
            />
          </div>
        </div>
      )}

      {shown("heightsFt") && caps.length > 0 && (
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
        {formError && <p className="font-body text-xs text-terracotta">{formError}</p>}
      </div>
    </form>
  );
}
