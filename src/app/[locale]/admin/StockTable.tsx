"use client";

import { Fragment, useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Truck } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import type { GrowMedium, Tray } from "@/lib/types";
import { CostCell, OnBills, StockCount } from "./StockCells";
import { SupplierPicker, type VendorChoice } from "./vendors/SupplierPicker";

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
 * Each input column is sized for its longest real figure, and from `lg` the
 * table scrolls sideways inside its box rather than squeezing them. Below
 * `lg` each row is a card instead (`.stack-table` in globals.css, 9 Nov
 * 2026), every cell under its column's heading.
 *
 * **The cost and the count are not inputs** (18 Oct 2026): the cost is the
 * latest purchase bill's, linked to it, and the count moves with bills and
 * orders, with a pencil for a stocktake that posts on its own.
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
/** The row's vendor picker (`SupplierPicker`): who to offer, who is ticked. */
type Picker = { supplyKey: string; vendors: VendorChoice[]; selected: string[] };
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
type PlainAction = (fd: FormData) => Promise<void>;
type Actions = { update: Action; correct: Action; toggle: PlainAction; remove: Action };

/* The number is typed straight into the cell, spreadsheet style: no box of
   its own, no spinner arrows (they sat over the right-aligned digits and cut
   "10" to "1("), a ring only while focused.

   Below `lg` the cell's rule is gone (the row is a card), so the input takes
   the box every other admin field has, left-aligned under its heading. */
const INPUT =
  "block w-full min-w-0 bg-transparent px-3 py-2.5 text-right font-body text-sm tabular-nums text-forest outline-none [appearance:textfield] focus:bg-white focus:ring-2 focus:ring-inset focus:ring-forest/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none max-lg:rounded-lg max-lg:border max-lg:border-forest/25 max-lg:py-2 max-lg:text-left";

/* Every cell ruled, so it reads as a table rather than a list of inputs. */
const CELL = "border border-forest/12";

/* Below `lg` a row's notes row would be a card of its own, as near the next
   item's card as to its own. These join the two, the notes at the foot of
   their item's card; `!` because the card rules in globals.css are
   unlayered. */
const OVER_NOTES = "max-lg:!mb-0 max-lg:!rounded-b-none max-lg:!border-b-0";
const UNDER_ROW = "max-lg:!rounded-t-none max-lg:!border-t-0 max-lg:!pt-0";

export function StockTable({
  namespace,
  items,
  actions,
}: {
  namespace: "admin.trays" | "admin.growMedia";
  items: Array<{ item: Item; name: string | null; bills: number; held: number; picker: Picker }>;
  actions: Actions;
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
      <h2 className="font-display text-lg font-semibold text-forest">
        {t("savedCount", { count: items.length })}
      </h2>
      <p className="font-body text-xs text-stone">{t("packingNote")}</p>
      {/* Cards below `lg` (`.stack-table`, globals.css): each cell's
          `data-label` is the heading it sits under. */}
      <div className="lg:overflow-x-auto lg:rounded-xl lg:border lg:border-forest/15 lg:bg-white">
        <table
          className={`stack-table w-full min-w-[80rem] border-collapse [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0 [&_thead_th]:border-t-0`}
        >
          <thead>
            <tr className="bg-sand text-left">
              <Th className="w-64">{t("colItem")}</Th>
              <Th className="w-32 text-right">{t("colCost")}</Th>
              <Th className="w-20 text-right">{t("colMarkup")}</Th>
              <Th className="w-20 text-right">{t("colRound")}</Th>
              <Th className="w-24 text-right">{t("colPrice")}</Th>
              <Th className="w-28 text-right">{t("colMargin")}</Th>
              <Th className="w-36 text-right">{t("colStock")}</Th>
              {PACKING_FIELDS.map((f) => (
                <Th key={f} className="w-20 text-right">
                  {t(`packingShort.${f}`)}
                </Th>
              ))}
              <Th className="w-52">{t("colActions")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, name, bills, held, picker }) => (
              <Row
                key={item.id}
                namespace={namespace}
                item={item}
                name={name}
                bills={bills}
                held={held}
                picker={picker}
                actions={actions}
              />
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
  bills,
  held,
  picker,
  actions,
}: {
  namespace: "admin.trays" | "admin.growMedia";
  item: Item;
  name: string | null;
  bills: number;
  held: number;
  picker: Picker;
  actions: Actions;
}) {
  const t = useTranslations(namespace);
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(actions.update, IDLE);
  /* A delete can be refused — a starter pack is made with this item — and
     says so on the row under, with the save's messages. */
  const [removeState, removeAction] = useActionState<FormState, FormData>(actions.remove, IDLE);
  const stock = item.stockPacks;
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
    removeState.status === "error" && t(`errors.${removeState.code}`, removeState.values ?? {}),
  ].filter((n): n is string => typeof n === "string");

  return (
    <Fragment>
      {/* The tint is restated `max-lg:!` because the card's own background
          is unlayered and would cover it. */}
      <tr
        className={`align-middle even:bg-cream/40 ${name ? "" : "bg-terracotta/5 max-lg:!bg-terracotta/5"} ${
          notes.length > 0 ? OVER_NOTES : ""
        }`}
      >
        <td className={`${CELL} px-3 py-2`}>
          <p className="font-body text-sm font-semibold leading-snug text-forest">
            {name ?? item.contentKey}
          </p>
          <code className="font-body text-[11px] text-stone">{item.contentKey}</code>
          <SupplierPicker {...picker} item={name ?? item.contentKey} />
          <p className="mt-1 flex items-center gap-1.5 font-body text-[11px] text-stone">
            <Truck aria-hidden size={12} strokeWidth={2} className="shrink-0" />
            {/* Below zero is packs owed to customers (`StockCount`). */}
            {stock < 0
              ? t("stockOwed", { count: -stock })
              : stock === 0
                ? t("stockNone")
                : t("stockLine", { count: stock })}
          </p>
        </td>
        <td data-label={t("colCost")} className={`${CELL} px-3 py-2 text-right`}>
          <CostCell cost={item.cost} source={item.costBill} />
        </td>
        {/* Every row carries its own markup and rounding — the 5 kg and the
            1 kg block (3 Oct 2026), and each tray pack (4 Oct 2026). Either
            may be unset, which prices at cost to the rupee. */}
        <td data-label={t("colMarkup")} className={`${CELL} p-0`}>
          {input("markupPercent", { "aria-label": t("markupPercent"), defaultValue: item.markupPercent })}
        </td>
        <td data-label={t("colRound")} className={`${CELL} p-0`}>
          {input("roundUpToNearest", {
            "aria-label": t("roundUpToNearest"),
            defaultValue: item.roundUpToNearest,
          })}
        </td>
        {/* Worked out from the cost and margin on save, never typed (the owner,
            3 Oct 2026: "sell price is based on cost + margin"). */}
        <td
          data-label={t("colPrice")}
          className={`${CELL} px-3 py-2 text-right font-body text-sm tabular-nums text-forest`}
        >
          {t("priceValue", { amount: item.price })}
        </td>
        {/* From what is stored, not the inputs beside it — the same call the
            rack rows make. */}
        <td
          data-label={t("colMargin")}
          className={`${CELL} px-3 py-2 text-right font-body text-sm tabular-nums text-stone`}
        >
          {item.cost !== undefined
            ? t("marginValue", {
                amount: Math.round(item.price - item.cost),
                percent: Math.round(((item.price - item.cost) / item.cost) * 100),
              })
            : "—"}
        </td>
        {/* `StockCount` sits at the end of its cell, under the right-aligned
            heading; on a card the heading is over its left edge, so the count
            moves there too. */}
        <td
          data-label={t("colStock")}
          className={`${CELL} px-3 py-2 max-lg:[&>form]:items-start max-lg:[&>span]:justify-start`}
        >
          <StockCount id={item.id} value={stock} unit="packs" held={held} correct={actions.correct} />
        </td>
        {PACKING_FIELDS.map((f) => (
          <td key={f} data-label={t(`packingShort.${f}`)} className={`${CELL} p-0`}>
            {input(f, {
              "aria-label": t(`packing.${f}`),
              min: 0,
              step: f === "packPieces" ? 1 : "any",
              defaultValue: item[f],
            })}
          </td>
        ))}
        {/* The card's width, unlabelled: three controls need no heading and
            would not fit in half. */}
        <td className={`${CELL} stack-wide px-3 py-2`}>
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
            {/* Added from a bill not yet saved: priced at 0, so not offered. */}
            {!item.active && item.cost === undefined ? (
              <span className="whitespace-nowrap rounded-full bg-forest/10 px-3 py-1 font-body text-[11px] text-stone">
                {t("needsBill")}
              </span>
            ) : (
              <form action={actions.toggle}>
                <input type="hidden" name="id" value={item.id} />
                {/* Where the press goes, not "flip it" — see `switchTo`. */}
                <input type="hidden" name="to" value={item.active ? "off" : "on"} />
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
            )}
            {bills > 0 ? (
              <OnBills count={bills} />
            ) : (
              <form action={removeAction}>
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
            )}
          </div>
        </td>
      </tr>
      {notes.length > 0 && (
        <tr className={`${UNDER_ROW} ${name ? "" : "max-lg:!bg-terracotta/5"}`}>
          <td
            colSpan={PACKING_FIELDS.length + 8}
            className={`${CELL} bg-terracotta/5 px-3 py-1.5 max-lg:bg-transparent`}
          >
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
