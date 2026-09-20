"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { PipeRackModel, PipeSize, RackSettings } from "@/lib/types";
import {
  addPipeRack,
  removePipeRack,
  republishPipeRack,
  savePipeRack,
  togglePipeRack,
} from "./actions";
import { CheckField, NumberField, SelectField } from "../fields";

/**
 * Pipe racks on sale — the same frozen-price mechanism as the other two
 * ranges, over a third bill of materials.
 *
 * Each row shows the cost the current rates produce next to the cost the price
 * was published against; a difference is flagged with both figures and offers
 * to republish. Unlike the other two screens, a rate edit *here* makes rows
 * stale only here — the pipe rates are this range's own — but a markup or
 * heights change on `/admin/racks` still moves all three.
 *
 * **No bulk buttons**, on the owner's instruction (17 Sep 2026): filling out
 * the range is a data job, done by `scripts/racks-fill.mjs`, and accepting a
 * new cost stays one button on the one row it applies to.
 *
 * ## What is different from the other two tables
 *
 * - **No gauge and no colour column.** There is one pipe spec and it is white,
 *   so a footprint and a height are the whole of a model. That frees two
 *   tracks, which go to the two columns below.
 * - **A fittings column.** Four-way connectors are the largest line in the
 *   bill — more than all the pipe on a 6 ft rack — so the count is on the row
 *   rather than buried in a total. It is also the figure that explains why two
 *   racks of similar size can be ₹1,000 apart: the longer one carries a middle
 *   support, and that support buys two more fittings at *every* level.
 * - **A pipe-feet column**, for the same reason the angle table has one: on a
 *   rack that is pipe and fittings, these two numbers check straight against a
 *   vendor invoice.
 *
 * Everything is computed on the server and arrives as `PipeRackView`, so this
 * component holds no pricing logic — that lives in `src/lib/racks/pricing.ts`,
 * which is pure and pinned against the owner's own rates.
 */
export type PipeRackView = {
  model: PipeRackModel;
  /** Material cost from the *current* rates. `null` when the footprint has
   *  been retired or the pipe rates are absent — both real states. */
  costNow: number | null;
  suggestedPrice: number | null;
  depthFt: number | null;
  lengthFt: number | null;
  /** Total running feet of pipe — uprights plus frames. */
  pipeFt: number | null;
  /** Four-way connectors: one per leg, per shelf level. */
  connectors: number | null;
};

/**
 * Eleven tracks in about 930px. One fewer than the other two rack tables,
 * which is the gauge column this range does not have. Every track explicit,
 * none `auto` — the header and the rows are separate grids and only line up if
 * both resolve to the same widths.
 */
const COLUMNS =
  "3.5rem 3.5rem 5rem 4.5rem 4.5rem 5rem 5.5rem 6rem 5rem 4.5rem 3.5rem";

/** Below this the table scrolls rather than compressing: a squeezed price
 *  column is worse than a scrollbar. */
const MIN_WIDTH = "min-w-[58rem]";

export function PipeRackTable({
  views,
  sizes,
  settings,
  hasRates,
  maxHeightFt,
  midSupportFromLengthFt,
  midSupportLegs,
}: {
  views: PipeRackView[];
  /** Active footprints only — the add form must not offer a retired size,
   *  even though an existing rack may still reference one. */
  sizes: PipeSize[];
  settings: RackSettings | null;
  /** Whether the pipe rates exist. Separate from `settings` because they are
   *  two independent rows and either can be missing on its own. */
  hasRates: boolean;
  maxHeightFt: number;
  midSupportFromLengthFt: number;
  midSupportLegs: number;
}) {
  const t = useTranslations("admin.pipeRacks");

  const ready = settings !== null && hasRates && sizes.length > 0;

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
              <span>{t("colPipeFt")}</span>
              <span>{t("colConnectors")}</span>
              <span>{t("colCostNow")}</span>
              <span>{t("colPrice")}</span>
              <span>{t("colMargin")}</span>
              <span />
              <span />
              <span />
            </div>

            {views.map((view) => (
              <PipeRackRow key={view.model.id} view={view} />
            ))}
          </div>
        </div>
      )}

      {ready ? (
        <AddPipeRackForm
          sizes={sizes}
          settings={settings}
          maxHeightFt={maxHeightFt}
          midSupportFromLengthFt={midSupportFromLengthFt}
          midSupportLegs={midSupportLegs}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("needsRates")}
        </p>
      )}
    </div>
  );
}

/** A figure, or an em dash where its part has left the rates, so a retired
 *  footprint shows as a gap rather than a zero that looks like a real price. */
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-sm tabular-nums text-forest">{children ?? "—"}</span>
  );
}

function PipeRackRow({ view }: { view: PipeRackView }) {
  const t = useTranslations("admin.pipeRacks");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(
    savePipeRack,
    IDLE,
  );
  const { model, costNow, suggestedPrice } = view;

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

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
          ? t("shelfSize", { depth: view.depthFt, length: view.lengthFt })
          : null}
      </Cell>
      <Cell>{view.pipeFt}</Cell>
      <Cell>{view.connectors}</Cell>
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

      <form action={togglePipeRack} className="contents">
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

      <form action={removePipeRack} className="contents">
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
            <form action={republishPipeRack}>
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
 * Add a pipe rack: a height and a footprint. **Two choices**, where the other
 * two ranges need three — there is no gauge to pick.
 *
 * Holds state so the shelf count follows the height as it changes. It is a
 * readout and not a field: shelves are `height − 1`, so there is nothing to
 * choose, and the server derives the figure rather than trusting anything
 * posted.
 */
function AddPipeRackForm({
  sizes,
  settings,
  maxHeightFt,
  midSupportFromLengthFt,
  midSupportLegs,
}: {
  sizes: PipeSize[];
  settings: RackSettings;
  maxHeightFt: number;
  midSupportFromLengthFt: number;
  midSupportLegs: number;
}) {
  const t = useTranslations("admin.pipeRacks");
  const [state, action, pending] = useActionState<FormState, FormData>(addPipeRack, IDLE);

  /* The shared heights list, capped at what pipe can carry. The other two
     ranges offer every height on it; this one stops at `PIPE_MAX_HEIGHT_FT`,
     so a height that is legitimate there is simply not offered here rather
     than being offered and then rejected. The action re-checks it anyway,
     because a server action is reachable without its form. */
  const heights = settings.heightsFt.filter((h) => h <= maxHeightFt);
  const [heightFt, setHeightFt] = useState(heights[heights.length - 1] ?? maxHeightFt);

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
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          label={t("size")}
          name="pipeSizeId"
          options={sizes.map((s) => ({
            value: s.id,
            /* The leg count is in the option label because it is what makes
               two similar-looking footprints price differently. */
            label: t("sizeOption", {
              depth: s.depthFt,
              length: s.lengthFt,
              feet: 2 * (s.lengthFt + s.depthFt),
              legs:
                settings.legsPerRack +
                (s.lengthFt >= midSupportFromLengthFt ? midSupportLegs : 0),
            }),
          }))}
          error={errorFor("pipeSizeId")}
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
