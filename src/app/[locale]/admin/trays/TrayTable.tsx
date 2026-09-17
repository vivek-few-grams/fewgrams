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
 * Trays and drainage cells — the pack price and the lead time, editable in
 * place.
 *
 * Built on the same bones as `SeedTable`: one shared `grid-template-columns`
 * between the header and every row, and three `<form>` elements per row with
 * `display: contents` so they can share the row's grid. The reasoning for each
 * of those is written out in `varieties/VarietyRow.tsx`; what follows is what
 * is different here.
 *
 * ## No search box, and no stock column
 *
 * The seed table has a filter because there are eighteen seeds. There are
 * three items here and there will not be many more — this is a small range of
 * equipment, not a catalogue — so a search field would be furniture. It is one
 * `useMemo` and one input to add back if the range ever grows.
 *
 * There is no stock column because there is no stock (SPEC §23.1). The whole
 * question this screen answers is **what a pack costs and how long it takes**,
 * and the second of those is the one an item can be wrong about in a way a
 * customer notices.
 *
 * ## The derived cell restates the promise in words, not a figure
 *
 * "Within 7 days" next to a field reading 7 looks redundant, and it is not:
 * the field is a number an operator types and the cell is **the sentence a
 * customer will read**, live as they type. That is the same job the seed
 * table's packs cell does — grams is what you count, the promise is what you
 * sell — and it is the reason a typo in this field is visible before it is
 * saved rather than after it is quoted.
 */
const COLUMNS =
  "minmax(10rem,1.6fr) minmax(5rem,0.8fr) minmax(5rem,0.8fr) minmax(7rem,1fr) 6rem 5.5rem 4rem";

/**
 * Below this the rows scroll sideways inside their own box rather than
 * widening the page — the same fix the seed and rack tables carry, for the
 * same reason: a row's tracks come from an inline `gridTemplateColumns`, so
 * they apply at *every* width, and at 414px the cells push the whole document
 * wide and take the admin nav rail with it.
 */
const MIN_WIDTH = "min-w-[46rem]";

export function TrayTable({
  trays,
}: {
  trays: Array<{ tray: Tray; name: string | null }>;
}) {
  const t = useTranslations("admin.trays");

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
            {/* Column headings, hidden below `lg` where the table is scrolled
                rather than stacked and every input carries its own label as
                its accessible name instead. */}
            <div
              style={{ gridTemplateColumns: COLUMNS }}
              className="hidden gap-x-3 px-4 lg:grid"
            >
              {[t("colItem"), t("colPrice"), t("colLead"), t("colPromise"), "", t("colActive"), ""].map(
                (heading, i) => (
                  <span
                    key={i}
                    className="font-body text-[10px] uppercase tracking-wider text-stone"
                  >
                    {heading}
                  </span>
                ),
              )}
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
      className={`grid items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 lg:gap-y-0 ${
        name ? "border-forest/12 bg-cream" : "border-terracotta/40 bg-terracotta/5"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-body text-sm font-semibold text-forest">
          {name ?? tray.contentKey}
        </p>
        <code className="font-body text-[11px] text-stone">{tray.contentKey}</code>
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

        <PromiseCell days={leadDays} />

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

      {/* **Any** error, not just a form-level one. `NumberField`'s `compact`
          variant returns a bare input so the row stays aligned with its
          header, which means it drops the message and leaves only a red
          border and `aria-invalid` — and on this screen the message *is* the
          rule ("seven days is the shortest this category can promise"). The
          border still points at the offending input, so the pairing is not
          lost by saying it here. */}
      {state.status === "error" && (
        <p className="col-span-full font-body text-[11px] text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </div>
  );
}

/**
 * The promise the figure in the field makes to a customer.
 *
 * Out of range renders nothing rather than a wrong sentence — the field is
 * already flagged and the action will refuse the save, so inventing a promise
 * for a figure that cannot be saved would be the one misleading thing this
 * cell could do.
 */
function PromiseCell({ days }: { days: number }) {
  const t = useTranslations("admin.trays");
  const valid =
    Number.isInteger(days) && days >= TRAY_MIN_LEAD_DAYS && days <= TRAY_MAX_LEAD_DAYS;

  if (!valid) return <span aria-hidden="true" />;

  return (
    <p className="flex items-center gap-1.5 font-body text-xs text-stone">
      <Truck size={13} strokeWidth={2} className="shrink-0" />
      {t("promise", { days })}
    </p>
  );
}
