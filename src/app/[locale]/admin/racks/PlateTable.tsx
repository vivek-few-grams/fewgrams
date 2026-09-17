"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { ShelfPlate } from "@/lib/types";
import { addPlate, removePlate, savePlate, togglePlate } from "./actions";
import { CheckField, NumberField } from "../fields";

/**
 * Shelf plates — the vendor's size list, editable in place.
 *
 * The row lives in this file rather than its own because all three rack tables
 * are the same shape and splitting each into a table and a row would be six
 * files describing one idea. The reason a row is a CSS grid and not a `<tr>`
 * is the same as on `/admin/varieties`: three server actions act on one row,
 * so it needs three `<form>` elements, and a `<form>` is invalid inside
 * `<tbody>`. `display: contents` on each inner form lets its children
 * participate in this grid so the columns line up with the header.
 *
 * **There is deliberately no "trays per shelf" column.** It was here, computed
 * from a 10 × 20 in tray, and it was removed on 16 Sep 2026: a rack goes to
 * whoever buys it and they use whatever tray they already own, so the figure
 * was an assumption dressed as a specification. Capacity is the vendor's own
 * number and stays. Worth reviving only if Fewgrams sells a rack bundled with
 * a known tray, and then keyed to that tray's real dimensions.
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
  "repeat(5, minmax(4.5rem, 1fr)) 6rem 5.5rem 4rem";
/** Below this the rows scroll sideways inside their own box rather than
 *  widening the page.
 *
 *  Added 17 Sep 2026 with the nav rail, which made the bug visible: the row's
 *  tracks come from an inline `gridTemplateColumns`, so they apply at every
 *  width, and at 414px the Save, Active and Delete controls pushed the whole
 *  document 344px wide — taking the rail with them. Stacking to one column is
 *  not the alternative: a compact row's inputs carry their label only as an
 *  `aria-label`, so it would give an operator three unlabelled boxes. */
const MIN_WIDTH = "min-w-[48rem]";

export function PlateTable({ plates }: { plates: ShelfPlate[] }) {
  const t = useTranslations("admin.racks");

  return (
    <div className="mt-5 space-y-3">
      {plates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("platesEmpty")}
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
              <span>{t("colDepth")}</span>
              <span>{t("colLength")}</span>
              <span>{t("colThickness")}</span>
              <span>{t("colCapacity")}</span>
              <span>{t("colPlatePrice")}</span>
              <span />
              <span />
              <span />
            </div>
            {plates.map((plate) => (
              <PlateRow key={plate.id} plate={plate} />
            ))}
          </div>
        </div>
      )}

      <AddPlateForm />
    </div>
  );
}

function PlateRow({ plate }: { plate: ShelfPlate }) {
  const t = useTranslations("admin.racks");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(savePlate, IDLE);

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
        <input type="hidden" name="id" value={plate.id} />
        {/* Active has its own toggle, so this form carries the current value
            forward rather than clearing it. */}
        <input type="hidden" name="active" value={plate.active ? "on" : "off"} />

        <NumberField compact label={t("colDepth")} name="depthFt" min={0} defaultValue={plate.depthFt} error={errorFor("depthFt")} />
        <NumberField compact label={t("colLength")} name="lengthFt" min={0} defaultValue={plate.lengthFt} error={errorFor("lengthFt")} />
        <NumberField compact label={t("colThickness")} name="thicknessMm" min={0} defaultValue={plate.thicknessMm} error={errorFor("thicknessMm")} />
        <NumberField compact label={t("colCapacity")} name="capacityKg" min={0} defaultValue={plate.capacityKg} error={errorFor("capacityKg")} />
        <NumberField compact label={t("colPlatePrice")} name="price" min={0} defaultValue={plate.price} error={errorFor("price")} />

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={13} strokeWidth={2.5} />}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

      <form action={togglePlate} className="contents">
        <input type="hidden" name="id" value={plate.id} />
        {/* Hover moves in the direction of what the click does: greener when
            it will switch on, plain when off. */}
        <button
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            plate.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {plate.active ? tc("active") : tc("inactive")}
        </button>
      </form>

      <form action={removePlate} className="contents">
        <input type="hidden" name="id" value={plate.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("plateDeleteTitle")}
          message={t("plateDeleteConfirm")}
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

/** Its own form rather than a blank row in the table: an empty row inside a
 *  list of real rates reads as a size priced at zero. */
function AddPlateForm() {
  const t = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(addPlate, IDLE);

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
        <NumberField label={t("colDepth")} name="depthFt" min={0} error={errorFor("depthFt")} />
        <NumberField label={t("colLength")} name="lengthFt" min={0} error={errorFor("lengthFt")} />
        <NumberField label={t("colThickness")} name="thicknessMm" min={0} error={errorFor("thicknessMm")} />
        <NumberField label={t("colCapacity")} name="capacityKg" min={0} error={errorFor("capacityKg")} />
        <NumberField label={t("colPlatePrice")} name="price" min={0} error={errorFor("price")} />
        <button
          type="submit"
          disabled={pending}
          style={{ gridColumn: "span 3" }}
          /* `text-sm`, not `text-xs`, so the button is the same 38px as the
             fields beside it. At `text-xs` its line-height made it 34px and,
             with `items-end` on the row aligning bottoms, its top edge sat
             4px below every input's. */
          className="rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {t("addPlate")}
        </button>
      </div>
      <div className="mt-3">
        <CheckField label={t("activeLabel")} name="active" defaultChecked />
      </div>
    </form>
  );
}
