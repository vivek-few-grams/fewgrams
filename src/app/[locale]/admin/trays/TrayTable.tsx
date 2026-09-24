"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Truck } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import { TRAY_MAX_LEAD_DAYS, TRAY_MIN_LEAD_DAYS } from "@/lib/trays/lead-time";
import type { Tray } from "@/lib/types";
import { removeTray, toggleTrayActive, updateTray } from "./actions";
import { NumberField } from "../fields";

/**
 * Trays and drainage cells — price, lead time and courier packing, one flat
 * row per item with one Save (the owner's layout, 23 Sep 2026).
 *
 * Built on the same bones as `SeedTable`: one shared `grid-template-columns`
 * between the header and every row, and three `<form>` elements per row with
 * `display: contents` so they can share the row's grid. The reasoning for each
 * of those is written out in `varieties/VarietyRow.tsx`.
 *
 * ## The promise sits under the name, not in a column
 *
 * "Within 7 days" next to a field reading 7 is the sentence a customer will
 * read, live as the operator types — the reason a typo in the days is visible
 * before it is saved. It moved under the item name when the packing figures
 * joined the row, so the row stays one line of inputs.
 *
 * ## No search box, and no stock column
 *
 * Three items, and there will not be many more; and there is no stock
 * (SPEC §23.1).
 */

/** The six courier packing figures, in the order an owner measures them. */
const PACKING_FIELDS = [
  "packPieces",
  "pieceLengthCm",
  "pieceWidthCm",
  "pieceHeightCm",
  "pieceStackCm",
  "pieceGrams",
] as const;

/** Item, price, days, six packing figures, then Save, Active and Delete.
 *  Fixed widths for the figures: price and grams run to four digits, the
 *  rest to two or three, and equal flexible tracks cut the long ones off. */
const COLUMNS =
  "minmax(9rem,1fr) 4.75rem 3.5rem 3.5rem 4.25rem 4.25rem 3.75rem 4.25rem 4.75rem 6rem 5rem 3.5rem";

/**
 * Below this the rows scroll sideways inside their own box rather than
 * widening the page — the same fix the seed and rack tables carry: a row's
 * tracks come from an inline `gridTemplateColumns`, so they apply at every
 * width, and at 414px the cells would push the whole document wide and take
 * the admin nav rail with it.
 */
const MIN_WIDTH = "min-w-[64rem]";

export function TrayTable({
  trays,
}: {
  trays: Array<{ tray: Tray; name: string | null }>;
}) {
  const t = useTranslations("admin.trays");

  const headings = [
    t("colItem"),
    t("colPrice"),
    t("colLead"),
    ...PACKING_FIELDS.map((f) => t(`packingShort.${f}`)),
    "",
    t("colActive"),
    "",
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold text-forest">
        {t("savedCount", { count: trays.length })}
      </h2>

      {trays.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
          {t("emptyList")}
        </p>
      ) : (
        /* The scroll box wraps the header *and* the rows, so they scroll
           together and stay aligned. */
        <div className="overflow-x-auto">
          <div className={`${MIN_WIDTH} space-y-2`}>
            <p className="px-4 font-body text-[11px] text-stone">{t("packingNote")}</p>
            <div style={{ gridTemplateColumns: COLUMNS }} className="grid items-end gap-x-3 px-4">
              {headings.map((heading, i) => (
                <span key={i} className="font-body text-[10px] uppercase tracking-wider text-stone">
                  {heading}
                </span>
              ))}
            </div>

            {trays.map(({ tray, name }) => (
              <TrayRow key={tray.id} tray={tray} name={name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrayRow({ tray, name }: { tray: Tray; name: string | null }) {
  const t = useTranslations("admin.trays");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(updateTray, IDLE);
  /* Live, so typing 10 shows the sentence a customer would read before the row
     is saved — the promise next to the figure being typed. */
  const [leadDays, setLeadDays] = useState(tray.leadDays);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className={`grid items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 ${
        name ? "border-forest/12 bg-cream" : "border-terracotta/40 bg-terracotta/5"
      }`}
    >
      <div className="min-w-0">
        <p className="font-body text-sm font-semibold leading-snug text-forest">{name ?? tray.contentKey}</p>
        <code className="font-body text-[11px] text-stone">{tray.contentKey}</code>
        <PromiseLine days={leadDays} />
      </div>

      <form action={action} className="contents">
        <input type="hidden" name="id" value={tray.id} />
        {/* Active is owned by its own toggle, so the save form carries the
            current value forward rather than clearing it. */}
        <input type="hidden" name="active" value={tray.active ? "on" : "off"} />

        <NumberField
          compact
          label={t("colPrice")}
          name="price"
          min={1}
          defaultValue={tray.price}
          error={errorFor("price")}
        />
        <NumberField
          compact
          label={t("colLead")}
          name="leadDays"
          min={TRAY_MIN_LEAD_DAYS}
          max={TRAY_MAX_LEAD_DAYS}
          step={1}
          value={Number.isFinite(leadDays) ? leadDays : ""}
          onChange={(event) => setLeadDays(Number(event.target.value))}
          error={errorFor("leadDays")}
        />

        {PACKING_FIELDS.map((field) => (
          <NumberField
            key={field}
            compact
            label={t(`packing.${field}`)}
            name={field}
            min={0}
            step={field === "packPieces" ? 1 : "any"}
            defaultValue={tray[field]}
            error={errorFor(field)}
          />
        ))}

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-forest/25 px-3 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && (
            <Check size={13} strokeWidth={2.5} className="text-forest" />
          )}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

      <form action={toggleTrayActive} className="contents">
        <input type="hidden" name="id" value={tray.id} />
        <button
          /* Hover moves in the direction of what the click does: greener when
             it will switch on, plain when off. */
          className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
            tray.active
              ? "bg-sage text-forest hover:bg-forest hover:text-cream"
              : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
          }`}
        >
          {tray.active ? t("colActive") : t("hidden")}
        </button>
      </form>

      <form action={removeTray} className="contents">
        <input type="hidden" name="id" value={tray.id} />
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
          {t("missingContentHint", { key: tray.contentKey })}
        </p>
      )}

      {tray.packPieces === undefined && (
        <p className="col-span-full flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("packingMissing")}
        </p>
      )}

      {/* **Any** error, not just a form-level one: a `compact` field drops its
          message and keeps only a red border, and here the message is the rule
          ("fill in all six, or none"). */}
      {state.status === "error" && (
        <p className="col-span-full font-body text-[11px] text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </div>
  );
}

/**
 * The promise the days figure makes to a customer. Out of range renders
 * nothing rather than a wrong sentence — the field is already flagged and the
 * action will refuse the save.
 */
function PromiseLine({ days }: { days: number }) {
  const t = useTranslations("admin.trays");
  const valid = Number.isInteger(days) && days >= TRAY_MIN_LEAD_DAYS && days <= TRAY_MAX_LEAD_DAYS;
  if (!valid) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 font-body text-[11px] text-stone">
      <Truck size={12} strokeWidth={2} className="shrink-0" />
      {t("promise", { days })}
    </p>
  );
}
