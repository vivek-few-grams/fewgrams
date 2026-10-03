"use client";

import { Fragment, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Truck } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { GrowMedium, Tray } from "@/lib/types";

/**
 * The admin table for held stock sold by the pack — trays and grow media
 * (`admin/trays`, `admin/grow-media`). A real `<table>`, one row per item
 * (the owner, 25 Sep 2026: the old grid squeezed the inputs until "10" read
 * as "1(").
 *
 * **A row cannot be a `<form>`** — HTML does not allow a form around a `<tr>`
 * — so each row's save form is an empty `<form id>` in its Actions cell and
 * every input names it with the `form` attribute. The active toggle and the
 * delete are their own small forms in the same cell.
 *
 * Each input column is sized for its longest real figure, and the table
 * scrolls sideways inside its box on a narrow screen rather than squeezing
 * them.
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

type Item = Tray | GrowMedium;
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
type PlainAction = (fd: FormData) => Promise<void>;

/* The number is typed straight into the cell, spreadsheet style: no box of
   its own, no spinner arrows (they sat over the right-aligned digits and cut
   "10" to "1("), a ring only while focused. */
const INPUT =
  "block w-full min-w-0 bg-transparent px-3 py-2.5 text-right font-body text-sm tabular-nums text-forest outline-none [appearance:textfield] focus:bg-white focus:ring-2 focus:ring-inset focus:ring-forest/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/* Every cell ruled, so it reads as a table rather than a list of inputs. */
const CELL = "border border-forest/12";

export function StockTable({
  namespace,
  items,
  actions,
  rowMargin = false,
}: {
  namespace: "admin.trays" | "admin.growMedia";
  items: Array<{ item: Item; name: string | null }>;
  actions: { update: Action; toggle: PlainAction; remove: PlainAction };
  /** Both screens (3 Oct 2026) take a buying cost before the price, which is
   *  worked out from it and shown, not typed, and the margin after it. Grow media also sets
   *  the markup and rounding **per row** — the 5 kg and the 1 kg each have
   *  their own; trays use one margin for the screen, set above the table. */
  rowMargin?: boolean;
}) {
  const t = useTranslations(namespace);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
        {t("emptyList")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="font-display text-lg font-semibold text-forest">{t("savedCount", { count: items.length })}</h2>
      <p className="font-body text-xs text-stone">{t("packingNote")}</p>
      <div className="overflow-x-auto rounded-xl border border-forest/15 bg-white">
        <table className={`w-full ${rowMargin ? "min-w-[80rem]" : "min-w-[72rem]"} border-collapse [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0 [&_thead_th]:border-t-0`}>
          <thead>
            <tr className="bg-sand text-left">
              <Th className="w-64">{t("colItem")}</Th>
              <Th className="w-24 text-right">{t("colCost")}</Th>
              {rowMargin && (
                <>
                  <Th className="w-20 text-right">{t("colMarkup")}</Th>
                  <Th className="w-20 text-right">{t("colRound")}</Th>
                </>
              )}
              <Th className="w-24 text-right">{t("colPrice")}</Th>
              <Th className="w-28 text-right">{t("colMargin")}</Th>
              <Th className="w-20 text-right">{t("colStock")}</Th>
              {PACKING_FIELDS.map((f) => (
                <Th key={f} className="w-20 text-right">
                  {t(`packingShort.${f}`)}
                </Th>
              ))}
              <Th className="w-52">{t("colActions")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, name }) => (
              <Row key={item.id} namespace={namespace} item={item} name={name} actions={actions} rowMargin={rowMargin} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={`${CELL} px-3 py-2 align-bottom font-body text-[10px] font-semibold uppercase tracking-wider text-stone ${className}`}
    >
      {children}
    </th>
  );
}

function Row({
  namespace,
  item,
  name,
  actions,
  rowMargin,
}: {
  namespace: "admin.trays" | "admin.growMedia";
  item: Item;
  name: string | null;
  actions: { update: Action; toggle: PlainAction; remove: PlainAction };
  rowMargin: boolean;
}) {
  const t = useTranslations(namespace);
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(actions.update, IDLE);
  /* Live, so the line under the name follows the figure being typed. */
  const [typed, setTyped] = useState(String(item.stockPacks));
  /* The raw text is the state, so the box shows exactly what was typed; a
     blank must not read as 0, hence the empty check before `Number`. */
  const stock = typed.trim() === "" ? NaN : Number(typed);
  const formId = `stock-${item.id}`;

  const invalid = (field: string) => state.status === "error" && state.field === field;
  const input = (field: string, extra: React.InputHTMLAttributes<HTMLInputElement>) => (
    /* Text, not `type="number"` — see `NumberField` in fields.tsx: a wheel
       over a focused number input changes its value. */
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      form={formId}
      name={field}
      aria-invalid={invalid(field) || undefined}
      className={`${INPUT} ${invalid(field) ? "bg-terracotta/10" : ""}`}
      {...extra}
    />
  );

  const notes = [
    !name && t("missingContentHint", { key: item.contentKey }),
    item.cost === undefined && t("costMissing"),
    item.packPieces === undefined && t("packingMissing"),
    /* Any error, field or form — a table cell has no room for an inline
       message, so it goes on the row under. */
    state.status === "error" && t(`errors.${state.code}`, state.values ?? {}),
  ].filter((n): n is string => typeof n === "string");

  return (
    <Fragment>
      <tr className={`align-middle even:bg-cream/40 ${name ? "" : "bg-terracotta/5"}`}>
        <td className={`${CELL} px-3 py-2`}>
          <p className="font-body text-sm font-semibold leading-snug text-forest">{name ?? item.contentKey}</p>
          <code className="font-body text-[11px] text-stone">{item.contentKey}</code>
          {Number.isInteger(stock) && stock >= 0 && (
            <p className="mt-1 flex items-center gap-1.5 font-body text-[11px] text-stone">
              <Truck aria-hidden size={12} strokeWidth={2} className="shrink-0" />
              {stock === 0 ? t("stockNone") : t("stockLine", { count: stock })}
            </p>
          )}
        </td>
        <td className={`${CELL} p-0`}>
          {input("cost", { "aria-label": t("colCost"), defaultValue: item.cost })}
        </td>
        {rowMargin && (
          /* A grow medium row: its margin fields may be unset, so read them
             off the wider type rather than narrowing on `in`, which would
             drop both cells and shift every column after them. */
          <>
            <td className={`${CELL} p-0`}>
              {input("markupPercent", {
                "aria-label": t("markupPercent"),
                defaultValue: (item as GrowMedium).markupPercent,
              })}
            </td>
            <td className={`${CELL} p-0`}>
              {input("roundUpToNearest", {
                "aria-label": t("roundUpToNearest"),
                defaultValue: (item as GrowMedium).roundUpToNearest,
              })}
            </td>
          </>
        )}
        {/* Worked out from the cost and margin on save, never typed (the owner,
            3 Oct 2026: "sell price is based on cost + margin"). */}
        <td className={`${CELL} px-3 py-2 text-right font-body text-sm tabular-nums text-forest`}>
          {t("priceValue", { amount: item.price })}
        </td>
        {/* From what is stored, not the inputs beside it — the same call the
            rack rows make. */}
        <td className={`${CELL} px-3 py-2 text-right font-body text-sm tabular-nums text-stone`}>
          {item.cost !== undefined
            ? t("marginValue", {
                amount: item.price - item.cost,
                percent: Math.round(((item.price - item.cost) / item.cost) * 100),
              })
            : "—"}
        </td>
        <td className={`${CELL} p-0`}>
          {input("stockPacks", {
            "aria-label": t("colStock"),
            min: 0,
            step: 1,
            value: typed,
            onChange: (e) => setTyped(e.target.value),
          })}
        </td>
        {PACKING_FIELDS.map((f) => (
          <td key={f} className={`${CELL} p-0`}>
            {input(f, {
              "aria-label": t(`packing.${f}`),
              min: 0,
              step: f === "packPieces" ? 1 : "any",
              defaultValue: item[f],
            })}
          </td>
        ))}
        <td className={`${CELL} px-3 py-2`}>
          <div className="flex items-center gap-2">
            <form id={formId} action={action}>
              <input type="hidden" name="id" value={item.id} />
              {/* Active is owned by its own toggle; the save carries it forward. */}
              <input type="hidden" name="active" value={item.active ? "on" : "off"} />
              <button
                type="submit"
                disabled={pending}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-forest px-3 py-1 font-body text-xs font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
              >
                {state.status === "saved" && !pending && <Check aria-hidden size={13} strokeWidth={2.5} />}
                {state.status === "saved" && !pending ? t("savedRow") : t("save")}
              </button>
            </form>
            <form action={actions.toggle}>
              <input type="hidden" name="id" value={item.id} />
              <button
                className={`whitespace-nowrap rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
                  item.active
                    ? "bg-sage text-forest hover:bg-forest hover:text-cream"
                    : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
                }`}
              >
                {item.active ? t("colActive") : t("hidden")}
              </button>
            </form>
            <form action={actions.remove}>
              <input type="hidden" name="id" value={item.id} />
              <ConfirmSubmit
                label={tc("delete")}
                title={t("deleteTitle")}
                message={t("deleteConfirm")}
                confirmLabel={tc("confirmDelete")}
                cancelLabel={tc("cancel")}
                className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
              />
            </form>
          </div>
        </td>
      </tr>
      {notes.length > 0 && (
        <tr>
          <td colSpan={PACKING_FIELDS.length + 6 + (rowMargin ? 2 : 0)} className={`${CELL} bg-terracotta/5 px-3 py-1.5`}>
            {notes.map((n) => (
              <p key={n} className="flex items-start gap-1.5 font-body text-[11px] text-terracotta">
                <AlertTriangle aria-hidden size={12} strokeWidth={1.75} className="mt-px shrink-0" />
                {n}
              </p>
            ))}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
