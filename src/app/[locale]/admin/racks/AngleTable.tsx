"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { AngleGrade } from "@/lib/types";
import { addAngle, removeAngle, saveAngle, toggleAngle } from "./actions";
import { ColourSelect } from "./ColourSelect";
import { CheckField, NumberField } from "../fields";

/**
 * Angle grades — the legs, priced by the running foot.
 *
 * Colours are picked from a fixed palette of swatches (`ColourSelect`), not
 * typed: free text let "grey", "Grey" and "gray" become three colours, and a
 * rack built on any of them would then fail the colour check on its own grade.
 *
 * **There is no Finish column.** It was a `painted | powder` select until
 * 17 Sep 2026, when the owner settled on powder coat for every rack. A select
 * with one right answer is not a choice, and this one defaulted to `Painted`,
 * so the easiest thing to do with it was enter a grade Fewgrams does not sell.
 *
 * **Colour lives on the grade, not on the rack**, because the vendor couples
 * them: grey is painted only, and Orange, Green and Purple are powder-coated
 * 1.4 mm only. Holding colour here means the rack form can derive its colour
 * options from the grade the operator picked, so a rack the vendor cannot
 * build is not enterable. Put colour on the rack instead and the screen would
 * happily sell a 1 mm green rack.
 *
 * Structure and the grid-not-table reasoning: see `PlateTable`.
 */
/**
 * Every track has an explicit width, and **not one is `auto`**.
 *
 * The header and the rows are separate grids — they have to be, because each
 * row carries its own border and its own three forms — so they only line up if
 * both resolve their tracks to the same widths. `auto` resolves against
 * content, and the header's action cells are empty spans while a row's hold a
 * Save button, an Active pill and a Delete link. That made the header's `auto`
 * columns narrow, handed the surplus to the `1fr` columns, and every heading
 * drifted right of the input it named. Same reason
 * `varieties/VarietyTable.tsx` declares its widths.
 */
const COLUMNS =
  "minmax(5rem,0.8fr) minmax(9rem,1.6fr) minmax(5rem,0.8fr) 6rem 5.5rem 4rem";
/** Below this the rows scroll sideways inside their own box rather than
 *  widening the page.
 *
 *  Added 17 Sep 2026 with the nav rail, which made the bug visible: the row's
 *  tracks come from an inline `gridTemplateColumns`, so they apply at every
 *  width, and at 414px the Save, Active and Delete controls pushed the whole
 *  document 344px wide — taking the rail with them. Stacking to one column is
 *  not the alternative: a compact row's inputs carry their label only as an
 *  `aria-label`, so it would give an operator three unlabelled boxes. */
const MIN_WIDTH = "min-w-[42rem]";

export function AngleTable({ angles }: { angles: AngleGrade[] }) {
  const t = useTranslations("admin.racks");

  return (
    <div className="mt-5 space-y-3">
      {angles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("anglesEmpty")}
        </p>
      ) : (
        /* The add form sits outside this, so it never slides sideways with
           the rows. */
        <div className="overflow-x-auto">
          <div className={`${MIN_WIDTH} space-y-3`}>
            <div
              style={{ gridTemplateColumns: COLUMNS }}
              className="hidden gap-x-3 px-4 font-body text-[10px] font-medium uppercase tracking-widest text-stone lg:grid"
            >
              <span>{t("colThickness")}</span>
              <span>{t("colColours")}</span>
              <span>{t("colRatePerFt")}</span>
              <span />
              <span />
              <span />
            </div>
            {angles.map((angle) => (
              <AngleRow key={angle.id} angle={angle} />
            ))}
          </div>
        </div>
      )}

      <AddAngleForm />
    </div>
  );
}

/** The colour picker's strings, resolved once. `ColourSelect` is given words
 *  rather than a namespace so the row and the add form share one list and
 *  cannot drift apart. */
function colourTexts(
  t: (k: string, v?: Record<string, string | number | Date>) => string,
): Parameters<typeof ColourSelect>[0]["texts"] {
  return {
    none: t("coloursNone"),
    summary: (count: number) => t("coloursSummary", { count }),
    name: (slug: string) => t(`colours.${slug}`),
    open: t("coloursOpen"),
    clear: t("coloursClear"),
    done: t("coloursDone"),
  };
}

function AngleRow({ angle }: { angle: AngleGrade }) {
  const t = useTranslations("admin.racks");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(saveAngle, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className="grid items-center gap-x-3 gap-y-2 rounded-xl border border-forest/12 bg-cream px-4 py-3 lg:gap-y-0"
    >
      <form action={action} className="contents">
        <input type="hidden" name="id" value={angle.id} />
        <input type="hidden" name="active" value={angle.active ? "on" : "off"} />

        <NumberField compact label={t("colThickness")} name="thicknessMm" min={0} defaultValue={angle.thicknessMm} error={errorFor("thicknessMm")} />
        <ColourSelect
          compact
          label={t("colColours")}
          initial={angle.colours}
          texts={colourTexts(t)}
        />
        <NumberField compact label={t("colRatePerFt")} name="ratePerFt" min={0} defaultValue={angle.ratePerFt} error={errorFor("ratePerFt")} />

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={13} strokeWidth={2.5} />}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

      <form action={toggleAngle} className="contents">
        <input type="hidden" name="id" value={angle.id} />
        <button
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            angle.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {angle.active ? tc("active") : tc("inactive")}
        </button>
      </form>

      <form action={removeAngle} className="contents">
        <input type="hidden" name="id" value={angle.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("angleDeleteTitle")}
          message={t("angleDeleteConfirm")}
          confirmLabel={tc("confirmDelete")}
          cancelLabel={tc("cancel")}
          className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
        />
      </form>

      {state.status === "error" && !state.field && (
        <p className="col-span-full font-body text-[11px] text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </div>
  );
}

function AddAngleForm() {
  const t = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(addAngle, IDLE);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <form action={action} className="rounded-xl border border-dashed border-forest/25 p-4">
      {/* The add form shares the table's own `COLUMNS`, so a new grade's
          inputs are exactly as wide as the saved rows' above it. Its own
          equal-column grid made the three boxes visibly different widths from
          the row they were about to become, which reads as two unrelated
          forms. The submit button spans the action tracks, which have no
          field to line up with.

          Only from `lg`, where the table itself is unscrolled; below that
          both stack and matching widths would mean matching narrowness. */}
      <div
        style={{ gridTemplateColumns: COLUMNS }}
        className="grid items-end gap-x-3 gap-y-3 max-lg:!grid-cols-1 max-sm:!grid-cols-1 sm:max-lg:!grid-cols-2"
      >
        <NumberField label={t("colThickness")} name="thicknessMm" min={0} error={errorFor("thicknessMm")} />
        {/* No `hint` on this row: `items-end` aligns bottoms, so a hint's
            extra line would ride this field's input up above the other
            three. The swatches carry the meaning anyway. */}
        <ColourSelect label={t("colColours")} initial={[]} texts={colourTexts(t)} />
        <NumberField label={t("colRatePerFt")} name="ratePerFt" min={0} error={errorFor("ratePerFt")} />
        <button
          type="submit"
          disabled={pending}
          /* Spans the three action tracks — Save, Active and Delete have no
             field above them to align with. */
          style={{ gridColumn: "span 3" }}
          /* `text-sm`, not `text-xs`, so the button is the same 38px as the
             fields beside it. At `text-xs` its line-height made it 34px and,
             with `items-end` on the row aligning bottoms, its top edge sat
             4px below every input's. */
          className="rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {t("addAngle")}
        </button>
      </div>
      <div className="mt-3">
        <CheckField label={t("activeLabel")} name="active" defaultChecked />
      </div>
    </form>
  );
}
