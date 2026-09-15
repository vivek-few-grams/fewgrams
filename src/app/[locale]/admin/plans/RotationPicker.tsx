"use client";

import { useTranslations } from "next-intl";
import { VarietyMultiSelect } from "./VarietyMultiSelect";
import { ROTATION_WEEKS, weekField, type VarietyChoice } from "./rotation";

/**
 * All four weeks of one plan's rotation.
 *
 * Lives in its own component so the four pickers, their strings and the
 * "no varieties yet" state are defined once — the rotation is the part of this
 * screen most likely to grow a fifth field.
 */
export function RotationPicker({
  choices,
  weeks,
}: {
  choices: VarietyChoice[];
  /** week number → variety keys currently stored. */
  weeks: Record<number, string[]>;
}) {
  const t = useTranslations("admin.plans");

  return (
    <fieldset className="rounded-xl bg-sand p-4">
      <legend className="px-1 font-body text-xs font-semibold uppercase tracking-wider text-stone">
        {t("rotationTitle")}
      </legend>
      <p className="mb-3 font-body text-xs text-stone">{t("rotationHint")}</p>

      {choices.length === 0 ? (
        <p className="rounded-xl border border-terracotta/40 bg-terracotta/5 p-3 font-body text-sm text-terracotta">
          {t("noVarieties")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROTATION_WEEKS.map((week) => {
            const label = t("week", { n: week });
            return (
              <VarietyMultiSelect
                key={week}
                name={weekField(week)}
                weekLabel={label}
                choices={choices}
                initial={weeks[week] ?? []}
                texts={{
                  none: t("pickNone"),
                  summary: (count) => t("pickSummary", { count }),
                  search: t("pickSearch"),
                  searchPlaceholder: t("pickSearchPlaceholder"),
                  noMatch: (query) => t("pickNoMatch", { query }),
                  clear: t("pickClear"),
                  done: t("pickDone"),
                  open: t("pickOpen", { week: label }),
                  growDays: (days) => t("growDaysShort", { days }),
                }}
              />
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
