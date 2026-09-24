"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { PipeSize } from "@/lib/types";
import {
  addPipeSize,
  removePipeSize,
  savePipeSize,
  togglePipeSize,
} from "./actions";
import { CheckField, NumberField } from "../fields";

/**
 * Shelf footprints for the pipe range.
 *
 * Two inputs and **two** readouts, where the angle table has one. The extra
 * one is the leg count, and it is here because it is the only place a
 * footprint's length has a consequence an operator cannot see: from 4 ft the
 * shelf gets a middle support, which is two more legs, two more bushes and —
 * the expensive part — two more four-way connectors at *every* level. On a 6 ft
 * rack that is ten extra fittings, over ₹1,000. A number that jumps from 4 to
 * 6 as you type 4 into the length field explains that; a price appearing later
 * on the table below does not.
 *
 * Row layout follows `PlateTable` and `FrameTable` — a CSS grid, not a
 * `<table>`, because three server actions act on one row so it needs three
 * `<form>` elements, and a `<form>` is invalid inside `<tbody>`.
 * `display: contents` lets each form's children join this grid. Every track is
 * explicitly sized for the reason given there: `auto` resolves against
 * content, and the header's action cells are empty where a row's hold buttons,
 * which drifts every heading right of the input it names.
 */
const COLUMNS =
  "minmax(4.5rem, 1fr) minmax(4.5rem, 1fr) minmax(5rem, 1fr) minmax(5.5rem, 1.1fr) minmax(7rem, 1.4fr) 6rem 5.5rem 4rem";

/** Below this the rows scroll sideways inside their own box rather than
 *  widening the page — see the note in `FrameTable`. Wider than that table's
 *  because of the extra readout. */
const MIN_WIDTH = "min-w-[52rem]";

/**
 * Duplicated from `pipeFeetPerShelf` and `pipeRackLegs` rather than imported:
 * pulling the pure pricing module into a client component would ship the
 * vendor seed with it. `pricing.test.ts` owns the authoritative copies.
 *
 * `legsPerRack` and the 4 ft threshold arrive as props for the same reason —
 * they are stored figures, not constants this file gets to decide.
 */
function feetPerShelf(depthFt: number, lengthFt: number): number {
  return 2 * (lengthFt + depthFt);
}

export function PipeSizeTable({
  sizes,
  cornerLegs,
  midSupportFromLengthFt,
  midSupportLegs,
}: {
  sizes: PipeSize[];
  /** `RackSettings.legsPerRack` — the four corners, shared with both steel
   *  ranges. */
  cornerLegs: number;
  midSupportFromLengthFt: number;
  midSupportLegs: number;
}) {
  const t = useTranslations("admin.pipeRacks");

  const legsFor = (lengthFt: number) =>
    cornerLegs + (lengthFt >= midSupportFromLengthFt ? midSupportLegs : 0);

  return (
    <div className="mt-5 space-y-3">
      {sizes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("sizesEmpty")}
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
              <span>{t("colPipeFeet")}</span>
              <span>{t("colLegs")}</span>
              <span />
              <span />
              <span />
            </div>

            {sizes.map((size) => (
              <PipeSizeRow
                key={size.id}
                size={size}
                legs={legsFor(size.lengthFt)}
                cornerLegs={cornerLegs}
              />
            ))}
          </div>
        </div>
      )}

      <AddPipeSizeForm legsFor={legsFor} cornerLegs={cornerLegs} />
    </div>
  );
}

/** The leg count, said two ways: plain when it is just the corners, and named
 *  when the middle support is what pushed it up. The wording is the whole
 *  reason this column exists, so a bare "6" would waste it. */
function LegsCell({ legs, cornerLegs }: { legs: number; cornerLegs: number }) {
  const t = useTranslations("admin.pipeRacks");
  return (
    <span className="font-body text-sm tabular-nums text-stone">
      {legs > cornerLegs ? t("legsWithSupport", { legs }) : t("legsPlain", { legs })}
    </span>
  );
}

function PipeSizeRow({
  size,
  legs,
  cornerLegs,
}: {
  size: PipeSize;
  legs: number;
  cornerLegs: number;
}) {
  const t = useTranslations("admin.pipeRacks");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(
    savePipeSize,
    IDLE,
  );

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
        <input type="hidden" name="id" value={size.id} />
        {/* Active has its own toggle, so this form carries the current value
            forward rather than clearing it. */}
        <input type="hidden" name="active" value={size.active ? "on" : "off"} />

        <NumberField compact label={t("colDepth")} name="depthFt" min={0} defaultValue={size.depthFt} error={errorFor("depthFt")} />
        <NumberField compact label={t("colLength")} name="lengthFt" min={0} defaultValue={size.lengthFt} error={errorFor("lengthFt")} />
        <NumberField compact label={t("colGramsPerShelf")} name="gramsPerShelf" min={0} defaultValue={size.gramsPerShelf} error={errorFor("gramsPerShelf") ?? (size.gramsPerShelf === undefined ? t("gramsMissing") : undefined)} />

        {/* Both derived from what is **stored**, not from the inputs beside
            them. An unsaved edit showing its own consequence would state a
            figure the rate card is not using yet. */}
        <span className="font-body text-sm tabular-nums text-stone">
          {t("pipeFeetValue", { feet: feetPerShelf(size.depthFt, size.lengthFt) })}
        </span>
        <LegsCell legs={legs} cornerLegs={cornerLegs} />

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && <Check size={13} strokeWidth={2.5} />}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

      <form action={togglePipeSize} className="contents">
        <input type="hidden" name="id" value={size.id} />
        {/* Hover moves in the direction of what the click does: greener when
            it will switch on, plain when off. */}
        <button
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            size.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {size.active ? tc("active") : tc("inactive")}
        </button>
      </form>

      <form action={removePipeSize} className="contents">
        <input type="hidden" name="id" value={size.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("sizeDeleteTitle")}
          message={t("sizeDeleteConfirm")}
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
 * list of real footprints reads as a shelf measuring nothing.
 *
 * Unlike the rows above, both readouts here are **live**. Typing 4 into the
 * length and watching the leg count go from 4 to 6 is what teaches the rule
 * that costs the most money on this screen.
 */
function AddPipeSizeForm({
  legsFor,
  cornerLegs,
}: {
  legsFor: (lengthFt: number) => number;
  cornerLegs: number;
}) {
  const t = useTranslations("admin.pipeRacks");
  const [state, action, pending] = useActionState<FormState, FormData>(addPipeSize, IDLE);
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
        {/* Read-only and posting nothing — the server derives both. No `hint`
            on either: a hint under one field in an `items-end` row sits on the
            baseline and rides that field's input up. */}
        <Readout label={t("colPipeFeet")}>
          {ready ? t("pipeFeetValue", { feet: feetPerShelf(d, l) }) : "—"}
        </Readout>
        <Readout label={t("colLegs")}>
          {ready
            ? legsFor(l) > cornerLegs
              ? t("legsWithSupport", { legs: legsFor(l) })
              : t("legsPlain", { legs: legsFor(l) })
            : "—"}
        </Readout>
        <button
          type="submit"
          disabled={pending}
          style={{ gridColumn: "span 3" }}
          /* `text-sm`, not `text-xs`, so the button is the same 38px as the
             fields beside it. At `text-xs` its line-height made it 34px and,
             with `items-end` aligning bottoms, its top sat 4px low. */
          className="rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {t("addSize")}
        </button>
      </div>
      <div className="mt-3">
        <CheckField label={t("activeLabel")} name="active" defaultChecked />
      </div>
    </form>
  );
}

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {label}
      </span>
      <output className="mt-1.5 block rounded-lg border border-forest/15 bg-sand px-3 py-2 font-body text-sm tabular-nums text-forest">
        {children}
      </output>
    </label>
  );
}
