"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { IDLE, type FormState } from "@/lib/forms";
import type { Sowing } from "@/lib/types";
import { addSowing, updateSowing } from "./actions";
import { NumberField, SelectField } from "../fields";

type Row = {
  uid: number;
  varietyKey: string;
  seedGrams: string;
  trays: string;
  harvestGrams: string;
  harvestedOn: string;
};

let nextUid = 0;
const blankRow = (): Row => ({
  uid: nextUid++,
  varietyKey: "",
  seedGrams: "",
  trays: "",
  harvestGrams: "",
  harvestedOn: "",
});

function rowsOf(sowing?: Sowing): Row[] {
  if (!sowing) return [blankRow()];
  return sowing.lines.map((l) => ({
    uid: nextUid++,
    varietyKey: l.varietyKey,
    seedGrams: String(l.seedGrams),
    trays: l.trays !== undefined ? String(l.trays) : "",
    harvestGrams: l.harvestGrams !== undefined ? String(l.harvestGrams) : "",
    harvestedOn: l.harvestedOn ?? "",
  }));
}

/**
 * The sowing form — a date and one row per variety sown.
 *
 * Without `sowing` it is the new-sowing form and has no harvest columns; with
 * one it edits that sowing, harvest included, and calls `onDone` once saved.
 *
 * Every input is **controlled**. React resets a form's uncontrolled fields
 * when its action returns, which would empty a ten-row sowing the moment one
 * row was refused.
 */
export function SowingEditor({
  varieties,
  today,
  sowing,
  onDone,
}: {
  varieties: { value: string; label: string }[];
  /** `YYYY-MM-DD`, IST. */
  today: string;
  sowing?: Sowing;
  onDone?: () => void;
}) {
  const t = useTranslations("admin.sowing");
  const editing = sowing !== undefined;
  const [state, action, pending] = useActionState<FormState, FormData>(
    editing ? updateSowing : addSowing,
    IDLE,
  );
  const [sowDate, setSowDate] = useState(sowing?.sowDate ?? today);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(sowing));

  /* Adjust state during render when a save lands, rather than in an effect
     (react.dev, "You might not need an effect"). */
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "saved") {
      if (editing) onDone?.();
      else {
        setSowDate(today);
        setRows([blankRow()]);
      }
    }
  }

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  const set = (uid: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const options = [{ value: "", label: t("varietyPick") }, ...varieties];
  /* `sm:` grid for the row; below it each row stacks. */
  const columns = editing
    ? "sm:grid-cols-[minmax(10rem,2fr)_repeat(3,minmax(5rem,1fr))_minmax(8.5rem,1.2fr)_2rem]"
    : "sm:grid-cols-[minmax(10rem,2fr)_repeat(2,minmax(5rem,1fr))_2rem]";

  const rowError = rows.map((_, i) =>
    ["varietyKey", "seedGrams", "trays", "harvestGrams", "harvestedOn"]
      .map((f) => errorFor(`${f}.${i}`))
      .find(Boolean),
  );

  return (
    <form action={action} className="space-y-4">
      {sowing && <input type="hidden" name="id" value={sowing.id} />}

      <label className="block max-w-xs">
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("sowDate")}
        </span>
        <input
          type="date"
          name="sowDate"
          required
          max={today}
          value={sowDate}
          onChange={(e) => setSowDate(e.target.value)}
          aria-invalid={errorFor("sowDate") ? true : undefined}
          className={`mt-1.5 w-full rounded-lg border bg-cream px-3 py-2 font-body text-sm text-forest outline-none focus:border-forest ${
            errorFor("sowDate") ? "border-terracotta" : "border-forest/25"
          }`}
        />
        {errorFor("sowDate") && (
          <span className="mt-1 block font-body text-[11px] text-terracotta">{errorFor("sowDate")}</span>
        )}
      </label>

      <div className="space-y-2">
        <div
          className={`hidden gap-3 px-1 font-body text-[11px] font-medium uppercase tracking-wider text-stone sm:grid ${columns}`}
        >
          <span>{t("variety")}</span>
          <span>{t("seedGrams")}</span>
          <span>{t("trays")}</span>
          {editing && <span>{t("harvestGrams")}</span>}
          {editing && <span>{t("harvestedOn")}</span>}
          <span />
        </div>

        {rows.map((row, i) => (
          <div key={row.uid}>
            <div className={`grid grid-cols-2 items-center gap-3 ${columns}`}>
              <div className="col-span-2 sm:col-span-1">
                <SelectField
                  compact
                  label={t("variety")}
                  name="varietyKey"
                  options={options}
                  value={row.varietyKey}
                  onChange={(e) => set(row.uid, { varietyKey: e.target.value })}
                  error={errorFor(`varietyKey.${i}`)}
                />
              </div>
              <NumberField
                compact
                label={t("seedGrams")}
                name="seedGrams"
                placeholder={t("gramsPlaceholder")}
                value={row.seedGrams}
                onChange={(e) => set(row.uid, { seedGrams: e.target.value })}
                error={errorFor(`seedGrams.${i}`)}
              />
              <NumberField
                compact
                label={t("trays")}
                name="trays"
                inputMode="numeric"
                placeholder={t("traysPlaceholder")}
                value={row.trays}
                onChange={(e) => set(row.uid, { trays: e.target.value })}
                error={errorFor(`trays.${i}`)}
              />
              {editing && (
                <NumberField
                  compact
                  label={t("harvestGrams")}
                  name="harvestGrams"
                  placeholder={t("harvestPlaceholder")}
                  value={row.harvestGrams}
                  onChange={(e) => set(row.uid, { harvestGrams: e.target.value })}
                  error={errorFor(`harvestGrams.${i}`)}
                />
              )}
              {editing && (
                <input
                  type="date"
                  name="harvestedOn"
                  aria-label={t("harvestedOn")}
                  min={sowDate}
                  max={today}
                  value={row.harvestedOn}
                  onChange={(e) => set(row.uid, { harvestedOn: e.target.value })}
                  aria-invalid={errorFor(`harvestedOn.${i}`) ? true : undefined}
                  className={`w-full rounded-lg border bg-cream px-3 py-2 font-body text-sm text-forest outline-none focus:border-forest ${
                    errorFor(`harvestedOn.${i}`) ? "border-terracotta" : "border-forest/25"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== row.uid) : [blankRow()]))
                }
                aria-label={t("removeLine", { row: i + 1 })}
                title={t("removeLine", { row: i + 1 })}
                className="flex size-8 items-center justify-center justify-self-end rounded-full text-stone transition-colors hover:bg-terracotta/10 hover:text-terracotta"
              >
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            {rowError[i] && <p className="mt-1 px-1 font-body text-[11px] text-terracotta">{rowError[i]}</p>}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage/60"
        >
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          {t("addLine")}
        </button>
      </div>

      {editing && <p className="font-body text-[11px] text-stone">{t("harvestHint")}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          {editing ? t("save") : t("saveNew")}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5"
          >
            {t("cancel")}
          </button>
        )}
        {!editing && state.status === "saved" && !pending && (
          <p role="status" className="font-body text-sm text-forest">
            {t("savedNew")}
          </p>
        )}
        {state.status === "error" && !state.field && (
          <p role="alert" className="font-body text-sm text-terracotta">
            {t(`errors.${state.code}`, state.values ?? {})}
          </p>
        )}
      </div>
    </form>
  );
}
