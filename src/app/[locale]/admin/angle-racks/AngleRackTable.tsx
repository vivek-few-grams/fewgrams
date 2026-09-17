"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { AngleGrade, AngleRackModel, FrameSize, RackSettings } from "@/lib/types";
import {
  addAngleRack,
  removeAngleRack,
  republishAngleRack,
  saveAngleRack,
  toggleAngleRack,
} from "./actions";
import { Swatch } from "../racks/ColourSelect";
import { CheckField, NumberField, SelectField } from "../fields";

/**
 * Open-frame racks on sale — the same frozen-price mechanism as the plated
 * range, over a different bill of materials.
 *
 * Each row shows the cost the current rate card produces next to the cost the
 * price was published against; a difference is flagged with both figures and
 * offers to republish. The two screens share `RackSettings` and `AngleGrade`,
 * so one rate edit makes rows stale on both — which is the point, and why
 * neither screen recomputes a price as a side effect of a rate change.
 *
 * **No bulk buttons**, on the owner's instruction (17 Sep 2026): filling out
 * the range is a data job, done by `scripts/racks-fill.mjs`, and accepting a
 * new cost stays one button on the one row it applies to.
 *
 * ## What is different from `ModelTable`
 *
 * - **No load column.** A plated shelf carries the vendor's `capacityKg`; an
 *   open frame has no deck, so what it holds depends on what the buyer rests
 *   on it. Inventing a figure would repeat the "trays per shelf" column
 *   removed on 16 Sep 2026.
 * - **An angle-feet column instead.** Every running foot in the finished rack,
 *   legs plus framing. On a rack that is angle and almost nothing else this is
 *   the figure that checks straight against a vendor invoice, which is the
 *   same job the itemised cost does one level down.
 *
 * Everything is computed on the server and arrives as `AngleRackView`, so this
 * component holds no pricing logic — that lives in `src/lib/racks/pricing.ts`,
 * which is pure and pinned against the owner's own worked example.
 */
export type AngleRackView = {
  model: AngleRackModel;
  /** Material cost from the *current* rate card. `null` when the footprint or
   *  grade has been retired — a real state, not an error. */
  costNow: number | null;
  suggestedPrice: number | null;
  depthFt: number | null;
  lengthFt: number | null;
  thicknessMm: number | null;
  /** The colours the rack's **angle grade** comes in, not a choice this rack
   *  made. */
  colours: string[];
  /** Total running feet of angle — legs plus framing. */
  angleFt: number | null;
};

/**
 * Twelve tracks in about 990px, matching `ModelTable` so the two rack screens
 * read as one system. Every track explicit, none `auto` — the header and the
 * rows are separate grids and only line up if both resolve to the same widths.
 */
const COLUMNS =
  "3.5rem 3.5rem 5rem 3.5rem 6rem 4rem 5rem 5.5rem 6rem 5rem 4.5rem 3.5rem";

/** Below this the table scrolls rather than compressing: a squeezed price
 *  column is worse than a scrollbar. */
const MIN_WIDTH = "min-w-[62rem]";

export function AngleRackTable({
  views,
  frames,
  angles,
  settings,
}: {
  views: AngleRackView[];
  /** Active footprints and grades only — the add form must not offer a retired
   *  part, even though an existing rack may still reference one. */
  frames: FrameSize[];
  angles: AngleGrade[];
  settings: RackSettings | null;
}) {
  const t = useTranslations("admin.angleRacks");

  const ready = settings !== null && frames.length > 0 && angles.length > 0;

  return (
    <div className="mt-5 space-y-3">
      {views.length === 0 ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("racksEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className={`${MIN_WIDTH} space-y-3`}>
            <div
              style={{ gridTemplateColumns: COLUMNS }}
              className="grid gap-x-2 px-3 font-body text-[10px] font-medium uppercase tracking-widest text-stone"
            >
              <span>{t("colHeight")}</span>
              <span>{t("colShelves")}</span>
              <span>{t("colShelfSize")}</span>
              <span>{t("colAngle")}</span>
              <span>{t("colColour")}</span>
              <span>{t("colAngleFt")}</span>
              <span>{t("colCostNow")}</span>
              <span>{t("colPrice")}</span>
              <span>{t("colMargin")}</span>
              <span />
              <span />
              <span />
            </div>

            {views.map((view) => (
              <AngleRackRow key={view.model.id} view={view} />
            ))}
          </div>
        </div>
      )}

      {ready ? (
        <AddAngleRackForm frames={frames} angles={angles} settings={settings} />
      ) : (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("needsRates")}
        </p>
      )}
    </div>
  );
}

/** A figure, or an em dash where its part has left the rate card, so a retired
 *  footprint shows as a gap rather than a zero that looks like a real price. */
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-sm tabular-nums text-forest">{children ?? "—"}</span>
  );
}

function AngleRackRow({ view }: { view: AngleRackView }) {
  const t = useTranslations("admin.angleRacks");
  const tc = useTranslations("admin.common");
  /* Colour names are not duplicated into this namespace: one palette, one set
     of words, on `admin.racks`. Copying them would be ten strings kept in step
     by hand. */
  const tr = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(saveAngleRack, IDLE);
  const { model, costNow, suggestedPrice } = view;

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  /* Resolved from stored slugs. A slug that has left the palette has no
     message, so it falls back to itself rather than rendering a raw key. */
  const colourName = (slug: string) =>
    tr.has(`colours.${slug}`) ? tr(`colours.${slug}`) : slug;

  const unpriceable = costNow === null;
  const isStale = costNow !== null && costNow !== model.costAtPublish;

  const margin =
    costNow === null
      ? null
      : {
          amount: model.price - costNow,
          percent: costNow === 0 ? 0 : Math.round(((model.price - costNow) / costNow) * 100),
        };

  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className={`grid items-center gap-x-2 gap-y-2 rounded-xl border px-3 py-3 ${
        unpriceable
          ? "border-terracotta/40 bg-terracotta/5"
          : isStale
            ? "border-terracotta/30 bg-sand"
            : "border-forest/12 bg-cream"
      }`}
    >
      <Cell>{model.config.heightFt}</Cell>
      <Cell>{model.config.shelves}</Cell>
      <Cell>
        {view.depthFt !== null && view.lengthFt !== null
          ? t("frameSize", { depth: view.depthFt, length: view.lengthFt })
          : null}
      </Cell>
      <Cell>{view.thicknessMm}</Cell>

      {/* The grade's colours, not the rack's: every rack built on a grade can
          be had in any of them, so publishing one model per colour would be
          three identical rows at one price. Swatches rather than names — at
          three they do not fit the column. Names stay in the `title`. */}
      <span className="flex min-w-0 items-center gap-1">
        {view.colours.length === 0 ? (
          <span className="font-body text-sm text-stone">—</span>
        ) : (
          view.colours.map((slug) => (
            <Swatch key={slug} slug={slug} title={colourName(slug)} />
          ))
        )}
      </span>

      <Cell>{view.angleFt}</Cell>
      <Cell>{costNow === null ? null : t("rupees", { amount: costNow })}</Cell>

      <form action={action} className="contents">
        <input type="hidden" name="id" value={model.id} />
        <NumberField
          compact
          label={t("colPrice")}
          name="price"
          min={0}
          defaultValue={model.price}
          error={errorFor("price")}
        />
        <span className="font-body text-sm tabular-nums text-stone">
          {margin === null ? "—" : t("marginValue", margin)}
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

      <form action={toggleAngleRack} className="contents">
        <input type="hidden" name="id" value={model.id} />
        <button
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            model.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {model.active ? t("live") : tc("inactive")}
        </button>
      </form>

      <form action={removeAngleRack} className="contents">
        <input type="hidden" name="id" value={model.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("rackDeleteTitle")}
          message={t("rackDeleteConfirm")}
          confirmLabel={tc("confirmDelete")}
          cancelLabel={tc("cancel")}
          className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
        />
      </form>

      {/* The banners span the row rather than living in a status column: each
          carries two figures and a sentence, which no column here is wide
          enough for, and they are the one thing on a row that must not be
          scanned past. */}
      {unpriceable && (
        <p className="col-span-full flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("unpriceableDetail")}
        </p>
      )}

      {isStale && (
        <div className="col-span-full flex flex-wrap items-center gap-3">
          <p className="flex items-start gap-1.5 font-body text-[11px] text-forest">
            <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
            {t("staleDetail", { was: model.costAtPublish, now: costNow })}
          </p>
          {suggestedPrice !== null && (
            <form action={republishAngleRack}>
              <input type="hidden" name="id" value={model.id} />
              <button className="flex items-center gap-1.5 rounded-full bg-forest px-3 py-1 font-body text-[11px] font-semibold text-cream transition-colors hover:bg-forest/85">
                <RefreshCw size={11} strokeWidth={2} />
                {/* Rounding means a cost change often leaves the price where
                    it was. Naming a price the row already shows reads as a
                    broken button, so the label says what the press does. */}
                {suggestedPrice === model.price
                  ? t("republishSame", { price: suggestedPrice })
                  : t("republishTo", { price: suggestedPrice })}
              </button>
            </form>
          )}
        </div>
      )}

      {state.status === "error" && !state.field && (
        <p className="col-span-full font-body text-[11px] text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </div>
  );
}

/**
 * Add an open-frame rack: height, footprint, grade. Three choices.
 *
 * Holds state so the **shelf count follows the height** as it changes. It is a
 * readout and not a field — shelves are `height − 1`, so there is nothing to
 * choose, and the server derives the figure rather than trusting anything
 * posted.
 */
function AddAngleRackForm({
  frames,
  angles,
  settings,
}: {
  frames: FrameSize[];
  angles: AngleGrade[];
  settings: RackSettings;
}) {
  const t = useTranslations("admin.angleRacks");
  const [state, action, pending] = useActionState<FormState, FormData>(addAngleRack, IDLE);

  const heights = settings.heightsFt;
  const [heightFt, setHeightFt] = useState(heights[heights.length - 1] ?? 6);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  /* Derived, and duplicated from `shelvesForHeight` rather than imported:
     pulling the pure module into a client component would ship the vendor seed
     with it. */
  const shelves = Math.max(0, Math.floor(heightFt) - 1);

  return (
    <form action={action} className="rounded-xl border border-dashed border-forest/25 p-4">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          label={t("height")}
          name="heightFt"
          value={String(heightFt)}
          onChange={(e) => setHeightFt(Number(e.target.value))}
          options={heights.map((h) => ({ value: String(h), label: String(h) }))}
          error={errorFor("heightFt")}
        />
        {/* Read-only, and posts nothing. Shelves are `height − 1`, so a select
            here would offer choices that are not real. It stays visible
            because the number is part of what is being added. */}
        <label className="block">
          <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
            {t("shelves")}
          </span>
          <output className="mt-1.5 block rounded-lg border border-forest/15 bg-sand px-3 py-2 font-body text-sm tabular-nums text-forest">
            {shelves}
          </output>
        </label>
        <SelectField
          label={t("frame")}
          name="frameId"
          options={frames.map((f) => ({
            value: f.id,
            label: t("frameOption", {
              depth: f.depthFt,
              length: f.lengthFt,
              feet: 3 * f.lengthFt + 2 * f.depthFt,
            }),
          }))}
          error={errorFor("frameId")}
        />
        <SelectField
          label={t("angle")}
          name="angleId"
          options={angles.map((a) => ({
            value: a.id,
            label: t("angleOption", { thickness: a.thicknessMm, rate: a.ratePerFt }),
          }))}
          error={errorFor("angleId")}
        />
        <button
          type="submit"
          disabled={pending}
          /* `text-sm`, not `text-xs`, so the button is the same 38px as the
             fields beside it — at `text-xs` its line-height made it 34px and,
             with `items-end` aligning bottoms, its top sat 4px low. */
          className="rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {t("addRack")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <CheckField label={t("liveLabel")} name="active" defaultChecked />
        {state.status === "error" && !state.field && (
          <p className="font-body text-[11px] text-terracotta">
            {t(`errors.${state.code}`, state.values ?? {})}
          </p>
        )}
      </div>
    </form>
  );
}
