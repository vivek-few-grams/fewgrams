"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { FrameSize } from "@/lib/types";
import { addFrame, removeFrame, saveFrame, toggleFrame } from "./actions";
import { CheckField, NumberField } from "../fields";

/**
 * Shelf footprints for the open-frame range.
 *
 * **Two columns and a readout, where the plated table has five.** There is no
 * price, because a frame is not a bought part — it is `3 × length + 2 × depth`
 * feet of angle at the grade's rate per foot — and no capacity, because there
 * is no deck to load. Both absences are the reason this is a separate screen
 * rather than a column on `PlateTable`.
 *
 * The third column is that sum, shown rather than left implicit. It is the one
 * number that explains why a 1 × 4 ft frame costs more than a 2 × 3 ft one
 * despite covering less floor: the mid-rail runs along the length, so length
 * is counted three times and depth twice.
 *
 * Row layout follows `PlateTable` — a CSS grid, not a `<table>`, because three
 * server actions act on one row so it needs three `<form>` elements, and a
 * `<form>` is invalid inside `<tbody>`. `display: contents` lets each form's
 * children join this grid. Every track is explicitly sized for the reason
 * given there: `auto` resolves against content, and the header's action cells
 * are empty where a row's hold buttons, which drifts every heading right.
 */
const COLUMNS =
  "minmax(4.5rem, 1fr) minmax(4.5rem, 1fr) minmax(5rem, 1fr) minmax(6rem, 1.3fr) 6rem 5.5rem 4rem";

/** Below this the rows scroll sideways inside their own box rather than
 *  widening the page.
 *
 *  Not cosmetic: the row's tracks come from an inline `gridTemplateColumns`,
 *  which applies at every width, and a compact row's inputs carry their label
 *  only as an `aria-label` — so stacking them into one column would give an
 *  operator three unlabelled boxes. Without this wrapper the Save, Active and
 *  Delete controls pushed the whole document 200px wide on a 414px viewport,
 *  taking the nav rail with them. */
const MIN_WIDTH = "min-w-[44rem]";

/** Duplicated from `frameFeetPerShelf` rather than imported: pulling the pure
 *  pricing module into a client component would ship the vendor seed with it.
 *  `pricing.test.ts` owns the authoritative copy. */
function feetPerShelf(depthFt: number, lengthFt: number): number {
  return 3 * lengthFt + 2 * depthFt;
}

export function FrameTable({ frames }: { frames: FrameSize[] }) {
  const t = useTranslations("admin.angleRacks");

  return (
    <div className="mt-5 space-y-3">
      {frames.length === 0 ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("framesEmpty")}
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
              <span>{t("colGramsPerShelf")}</span>
              <span>{t("colFrameFeet")}</span>
              <span />
              <span />
              <span />
            </div>

            {frames.map((frame) => <FrameRow key={frame.id} frame={frame} />)}
          </div>
        </div>
      )}

      <AddFrameForm />
    </div>
  );
}

function FrameRow({ frame }: { frame: FrameSize }) {
  const t = useTranslations("admin.angleRacks");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(saveFrame, IDLE);

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
        <input type="hidden" name="id" value={frame.id} />
        {/* Active has its own toggle, so this form carries the current value
            forward rather than clearing it. */}
        <input type="hidden" name="active" value={frame.active ? "on" : "off"} />

        <NumberField compact label={t("colDepth")} name="depthFt" min={0} defaultValue={frame.depthFt} error={errorFor("depthFt")} />
        <NumberField compact label={t("colLength")} name="lengthFt" min={0} defaultValue={frame.lengthFt} error={errorFor("lengthFt")} />
        <NumberField compact label={t("colGramsPerShelf")} name="gramsPerShelf" min={0} defaultValue={frame.gramsPerShelf} error={errorFor("gramsPerShelf") ?? (frame.gramsPerShelf === undefined ? t("gramsMissing") : undefined)} />

        {/* Derived from what is **stored**, not from the inputs beside it. An
            unsaved edit showing its own consequence would state a figure the
            rate card is not using yet. */}
        <span className="font-body text-sm tabular-nums text-stone">
          {t("frameFeetValue", {
            feet: feetPerShelf(frame.depthFt, frame.lengthFt),
            length: frame.lengthFt,
            depth: frame.depthFt,
          })}
        </span>

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={13} strokeWidth={2.5} />}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

      <form action={toggleFrame} className="contents">
        <input type="hidden" name="id" value={frame.id} />
        {/* Hover moves in the direction of what the click does: greener when
            it will switch on, plain when off. */}
        <button
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            frame.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {frame.active ? tc("active") : tc("inactive")}
        </button>
      </form>

      <form action={removeFrame} className="contents">
        <input type="hidden" name="id" value={frame.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("frameDeleteTitle")}
          message={t("frameDeleteConfirm")}
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

/**
 * Its own form rather than a blank row in the table: an empty row inside a
 * list of real footprints reads as a frame measuring nothing.
 *
 * Unlike the row above, the angle readout here is **live**. Typing 4 and 1 and
 * watching 14 ft appear is what teaches the rule; a static figure would only
 * confirm it afterwards.
 */
function AddFrameForm() {
  const t = useTranslations("admin.angleRacks");
  const [state, action, pending] = useActionState<FormState, FormData>(addFrame, IDLE);
  const [depthFt, setDepthFt] = useState("");
  const [lengthFt, setLengthFt] = useState("");

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  const d = Number(depthFt);
  const l = Number(lengthFt);
  const ready = Number.isFinite(d) && d > 0 && Number.isFinite(l) && l > 0;

  return (
    <form action={action} className="rounded-xl border border-dashed border-forest/25 p-4">
      {/* The add form shares the table's own `COLUMNS`, so a new footprint's
          inputs are exactly as wide as the saved rows' above it. Only from
          `lg`, where the table itself is unscrolled; below that both stack and
          matching widths would mean matching narrowness. */}
      <div
        style={{ gridTemplateColumns: COLUMNS }}
        className="grid items-end gap-x-3 gap-y-3 max-lg:!grid-cols-1 max-sm:!grid-cols-1 sm:max-lg:!grid-cols-2"
      >
        <NumberField
          label={t("colDepth")}
          name="depthFt"
          min={0}
          value={depthFt}
          onChange={(e) => setDepthFt(e.target.value)}
          error={errorFor("depthFt")}
        />
        <NumberField
          label={t("colLength")}
          name="lengthFt"
          min={0}
          value={lengthFt}
          onChange={(e) => setLengthFt(e.target.value)}
          error={errorFor("lengthFt")}
        />
        <NumberField label={t("colGramsPerShelf")} name="gramsPerShelf" min={0} error={errorFor("gramsPerShelf")} />
        {/* Read-only and posts nothing — the server derives it. No `hint`
            here: a hint under one field in an `items-end` row sits on the
            baseline and rides that field's input up. */}
        <label className="block">
          <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
            {t("colFrameFeet")}
          </span>
          <output className="mt-1.5 block rounded-lg border border-forest/15 bg-sand px-3 py-2 font-body text-sm tabular-nums text-forest">
            {ready
              ? t("frameFeetValue", { feet: feetPerShelf(d, l), length: l, depth: d })
              : "—"}
          </output>
        </label>
        <button
          type="submit"
          disabled={pending}
          style={{ gridColumn: "span 3" }}
          /* `text-sm`, not `text-xs`, so the button is the same 38px as the
             fields beside it. At `text-xs` its line-height made it 34px and,
             with `items-end` aligning bottoms, its top sat 4px low. */
          className="rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {t("addFrame")}
        </button>
      </div>
      <div className="mt-3">
        <CheckField label={t("activeLabel")} name="active" defaultChecked />
      </div>
    </form>
  );
}
