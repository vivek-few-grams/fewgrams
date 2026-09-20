"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { Variety } from "@/lib/types";
import { removeVariety, toggleVarietyActive, updateVariety } from "./actions";
import { NumberField } from "../fields";

/**
 * One row of the variety table, with its numbers editable in place.
 *
 * ## Why this is a CSS grid and not a `<tr>`
 *
 * Three different server actions act on one row — save, toggle active,
 * delete — so the row needs three `<form>` elements, and a `<form>` may not
 * be nested inside another. A real `<table>` cannot hold them either: a
 * `<form>` is invalid inside `<tbody>`, and the alternative (one hidden form
 * per row plus `form="..."` attributes on every input) breaks `useFormStatus`
 * for the delete button, because the hook only reports on a form that is an
 * *ancestor* of the component calling it.
 *
 * `display: contents` on each inner form solves it: the forms keep working
 * and own their fields, while their children participate directly in this
 * row's grid, so the columns line up with the header. Below `lg` the
 * `contents` is dropped and the row falls back to a stacked card, which is
 * what a phone wants anyway.
 *
 * Editing matters more than it did before variety text moved to content
 * files: the numbers are now the *only* thing this screen owns, and yield in
 * particular is expected to be wrong at first (SPEC §16) and corrected after
 * every few sows.
 */
export function VarietyRow({
  variety,
  name,
  columns,
}: {
  variety: Variety;
  /** From the content file; null when the file does not exist yet. */
  name: string | null;
  /** Shared with the header so the columns agree. */
  columns: string;
}) {
  const t = useTranslations("admin.varieties");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(updateVariety, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <div
      style={{ gridTemplateColumns: columns }}
      className={`grid items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 lg:gap-y-0 ${
        name ? "border-forest/12 bg-cream" : "border-terracotta/40 bg-terracotta/5"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-body text-sm font-semibold text-forest">
          {name ?? variety.contentKey}
        </p>
        <code className="font-body text-[11px] text-stone">{variety.contentKey}</code>
      </div>

      <form action={action} className="contents">
        <input type="hidden" name="id" value={variety.id} />
        {/* Active is owned by its own toggle, so the save form carries the
            current value forward rather than clearing it. */}
        <input type="hidden" name="active" value={variety.active ? "on" : "off"} />

        <NumberField
          compact
          label={t("colGrowDays")}
          name="growDays"
          min={1}
          defaultValue={variety.growDays}
          error={errorFor("growDays")}
        />
        <NumberField
          compact
          label={t("colYieldMin")}
          name="yieldGramsPerTrayMin"
          min={1}
          defaultValue={variety.yieldGramsPerTrayMin}
          error={errorFor("yieldGramsPerTrayMin")}
        />
        <NumberField
          compact
          label={t("colYieldMax")}
          name="yieldGramsPerTrayMax"
          min={1}
          defaultValue={variety.yieldGramsPerTrayMax}
          error={errorFor("yieldGramsPerTrayMax")}
        />
        <NumberField
          compact
          label={t("colPrice")}
          name="pricePerTray"
          min={1}
          defaultValue={variety.pricePerTray}
          error={errorFor("pricePerTray")}
        />
        <NumberField
          compact
          label={t("colSeed")}
          name="seedGramsPerTray"
          min={1}
          defaultValue={variety.seedGramsPerTray ?? ""}
        />

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && (
            <Check size={13} strokeWidth={2.5} className="text-forest" />
          )}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

      <form action={toggleVarietyActive} className="contents">
        <input type="hidden" name="id" value={variety.id} />
        <button
          /* Hover has to move in the direction of what the click does:
             darker/greener when it will switch ON, plain when OFF. */
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            variety.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {variety.active ? t("colActive") : t("hidden")}
        </button>
      </form>

      <form action={removeVariety} className="contents">
        <input type="hidden" name="id" value={variety.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("deleteTitle")}
          message={t("deleteConfirm")}
          confirmLabel={tc("confirmDelete")}
          cancelLabel={tc("cancel")}
          className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
        />
      </form>

      {!name && (
        <p className="col-span-full flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("missingContentHint", { key: variety.contentKey })}
        </p>
      )}

      {state.status === "error" && !state.field && (
        <p className="col-span-full font-body text-[11px] text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </div>
  );
}
