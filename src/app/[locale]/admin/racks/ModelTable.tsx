"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { AngleGrade, RackModel, RackSettings, ShelfPlate } from "@/lib/types";
import { addModel, removeModel, republishModel, saveModel, toggleModel } from "./actions";
import { Swatch } from "./ColourSelect";
import { CheckField, NumberField, SelectField } from "../fields";

/**
 * Racks on sale — the layer whose prices are frozen, and the answer to "I do
 * not want to recalculate the prices again".
 *
 * Each row shows the cost the current rate card produces next to the cost the
 * price was published against. When they differ the row is flagged with both
 * figures and offers to republish. That is the whole mechanism — a bolt going
 * from ₹2 to ₹2.50 becomes a visible flag on the rows it touched, rather than
 * a price list re-derived by hand or, worse, a silent change to what a
 * customer is paying.
 *
 * Nothing on this screen recomputes a price as a side effect of a rate edit.
 * Cost is derived on read; price is written only when the owner says so.
 *
 * **No bulk buttons** (17 Sep 2026, the owner's call: *"do not build too many
 * UI elements to load the different combination or accept the prices"*). There
 * were two — "add every missing combination" and "republish all stale" — and
 * both are gone. Filling out the range is a data job, done by
 * `scripts/racks-fill.mjs`, and accepting a new cost stays one button on the
 * one row it applies to, where the two figures being compared are visible.
 *
 * ## A column per attribute
 *
 * The rack used to be one string — `6 ft · 5 shelves · 1.25 × 3 ft · 1.4 mm
 * Green` — in a single column. It read as a sentence rather than as data: it
 * wrapped to two lines, and it was not comparable down the column, which is
 * the only reason to put racks in a list together. Height, shelves, shelf
 * size, gauge and colour each have their own column now, so two racks that
 * differ in one respect differ in one column.
 *
 * The cost of that is width. The table scrolls horizontally below ~60rem
 * rather than compressing, because a squeezed price column is worse than a
 * scrollbar. The add form sits outside the scrolling area so it never moves
 * sideways with the table.
 *
 * **No sort-order column.** Rows come back shortest-rack-first, derived from
 * the config (`listRackModels`) — height is what racks are compared by, so it
 * is not a decision anyone needs to type.
 *
 * Everything is computed on the server and arrives as `RackModelView`, so this
 * component holds no pricing logic — the one place that does is
 * `src/lib/racks/pricing.ts`, which is pure and tested against the owner's own
 * hand calculation.
 */
export type RackModelView = {
  model: RackModel;
  /** Material cost from the *current* rate card. `null` when the rack's shelf
   *  size or angle grade has been retired, which is a real state and not an
   *  error — the row says so, and offers no republish button because there is
   *  no current cost to adopt. */
  costNow: number | null;
  /** What the markup would price it at today. */
  suggestedPrice: number | null;
  /** Denormalised for display so the row needs no lookup of its own. `null`
   *  where the part has left the rate card. */
  depthFt: number | null;
  lengthFt: number | null;
  thicknessMm: number | null;
  /** The colours the rack's **angle grade** comes in, not a choice this rack
   *  made. Shown so the row says what a buyer can have without the owner
   *  publishing a model per colour. */
  colours: string[];
  /** Vendor capacity × shelf count. There is no companion "trays per shelf"
   *  figure: see the note in `PlateTable`. */
  loadKg: number | null;
};

/**
 * Every track explicit, none `auto` — the header and the rows are separate
 * grids and only line up if both resolve to the same widths. See the note in
 * `PlateTable` for what `auto` did to the alignment.
 */
/**
 * Twelve tracks in about 990px, which is what the admin shell's 1100px
 * measure leaves inside a padded card.
 *
 * Sized deliberately tight. A first pass at comfortable widths with `gap-x-3`
 * came to 1148px and pushed the Live toggle and Delete link off the right
 * edge — primary actions behind a horizontal scroll, which is worse than any
 * amount of narrowness in a numeric column. The five identity columns are the
 * narrow ones because their content is short (`3`, `5`, `1.25 × 3`, `1.4`);
 * money keeps its width because a five-digit price with a rupee sign and a
 * thousands separator is the widest thing on the row.
 */
const COLUMNS =
  "3.5rem 3.5rem 5rem 3.5rem 6rem 4rem 5rem 5.5rem 6rem 5rem 4.5rem 3.5rem";

/** Below this the table scrolls rather than compressing. Matches the track sum
 *  plus gaps and padding, so at the shell's full width there is nothing to
 *  scroll. */
const MIN_WIDTH = "min-w-[62rem]";

export function ModelTable({
  views,
  plates,
  angles,
  settings,
}: {
  views: RackModelView[];
  /** Active grades and sizes only — the add form must not offer a retired
   *  part, even though an existing rack may still reference one. */
  plates: ShelfPlate[];
  angles: AngleGrade[];
  settings: RackSettings | null;
}) {
  const t = useTranslations("admin.racks");

  const ready = settings !== null && plates.length > 0 && angles.length > 0;

  return (
    <div className="mt-5 space-y-3">
      {views.length === 0 ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("modelsEmpty")}
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
              <span>{t("colLoad")}</span>
              <span>{t("colCostNow")}</span>
              <span>{t("colPrice")}</span>
              <span>{t("colMargin")}</span>
              <span />
              <span />
              <span />
            </div>

            {views.map((view) => (
              <ModelRow key={view.model.id} view={view} />
            ))}
          </div>
        </div>
      )}

      {ready ? (
        <AddModelForm plates={plates} angles={angles} settings={settings} />
      ) : (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("needsRates")}
        </p>
      )}
    </div>
  );
}

/** A figure, or an em dash where its part has left the rate card. Every
 *  computed cell goes through this so a retired plate shows as a gap rather
 *  than as a zero that looks like a real price. */
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-sm tabular-nums text-forest">{children ?? "—"}</span>
  );
}

function ModelRow({ view }: { view: RackModelView }) {
  const t = useTranslations("admin.racks");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(saveModel, IDLE);
  const { model, costNow, suggestedPrice } = view;

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  /* Resolved from stored slugs. A slug that has left the palette has no
     message, so it falls back to itself rather than rendering a raw key. */
  const colourName = (slug: string) =>
    t.has(`colours.${slug}`) ? t(`colours.${slug}`) : slug;

  const unpriceable = costNow === null;
  const isStale = costNow !== null && costNow !== model.costAtPublish;

  /* Margin in rupees and as a percentage of cost. Both `null` together, so the
     row has one thing to check rather than two. */
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
          ? t("plateSize", { depth: view.depthFt, length: view.lengthFt })
          : null}
      </Cell>
      <Cell>{view.thicknessMm}</Cell>

      {/* The grade's colours, not the rack's. Every rack built on a grade can
          be had in any of them, so publishing one model per colour was three
          identical rows at one price. Swatches rather than names: at three
          they do not fit a column, and a dot says "orange" faster than the
          word does. Names stay in the `title`. */}
      <span className="flex min-w-0 items-center gap-1">
        {view.colours.length === 0 ? (
          <span className="font-body text-sm text-stone">—</span>
        ) : (
          view.colours.map((slug) => (
            <Swatch key={slug} slug={slug} title={colourName(slug)} />
          ))
        )}
      </span>

      <Cell>{view.loadKg}</Cell>
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

      <form action={toggleModel} className="contents">
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

      <form action={removeModel} className="contents">
        <input type="hidden" name="id" value={model.id} />
        <ConfirmSubmit
          label={tc("delete")}
          title={t("modelDeleteTitle")}
          message={t("modelDeleteConfirm")}
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
            <form action={republishModel}>
              <input type="hidden" name="id" value={model.id} />
              <button className="flex items-center gap-1.5 rounded-full bg-forest px-3 py-1 font-body text-[11px] font-semibold text-cream transition-colors hover:bg-forest/85">
                <RefreshCw size={11} strokeWidth={2} />
                {/* Rounding means a cost change often leaves the price where
                    it was — ₹2,310 and ₹2,330 both round up to ₹2,350. Naming
                    a price the row already shows reads as a broken button, so
                    the label says what the press actually does. */}
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
 * Add a rack.
 *
 * Holds state for one reason: **the shelf count follows the height**, and it
 * is shown as it changes. It is a readout, not a field — shelves are
 * `height − 1`, so there is nothing to choose, and the server derives the
 * figure rather than trusting anything posted.
 *
 * Two real selects have been removed from this form on the way here. Shelves
 * was one, offering counts the vendor does not build; colour was the other,
 * which left `RackConfig` on 17 Sep 2026 because the angle grade already lists
 * what it comes in.
 */
function AddModelForm({
  plates,
  angles,
  settings,
}: {
  plates: ShelfPlate[];
  angles: AngleGrade[];
  settings: RackSettings;
}) {
  const t = useTranslations("admin.racks");
  const [state, action, pending] = useActionState<FormState, FormData>(addModel, IDLE);

  const heights = settings.heightsFt;
  const [heightFt, setHeightFt] = useState(heights[heights.length - 1] ?? 6);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  /* Inches and multiply-before-divide, matching `maxShelves` — a pitch in feet
     makes 6 / 1.2 return 5.000000000000001 and the cap comes out a shelf
     short. Duplicated rather than imported because importing the pure module
     into a client component would ship the vendor seed with it. */
  /* Derived, and duplicated from `shelvesForHeight` rather than imported:
     pulling the pure module into a client component would ship the vendor seed
     with it. Shown read-only so the operator sees what the height produced. */
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
        {/* Read-only, and posts nothing. Shelves are `height − 1` — the
            vendor does not build a 6 ft frame with 2 shelves — so this was a
            select offering choices that were not real, and the server derives
            the figure from the height rather than trusting a field. It stays
            visible because the number is part of what is being added. */}
        <label className="block">
          <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
            {t("shelves")}
          </span>
          <output className="mt-1.5 block rounded-lg border border-forest/15 bg-sand px-3 py-2 font-body text-sm tabular-nums text-forest">
            {shelves}
          </output>
        </label>
        <SelectField
          label={t("plate")}
          name="plateId"
          options={plates.map((p) => ({
            value: p.id,
            label: t("plateOption", { depth: p.depthFt, length: p.lengthFt, price: p.price }),
          }))}
          error={errorFor("plateId")}
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
          {t("addModel")}
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

