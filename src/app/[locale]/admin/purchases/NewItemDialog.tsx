"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { sanitiseKey } from "@/lib/content/content-key";
import { STOCK_KINDS, type StockKind } from "@/lib/purchases/bill";

/** Seed first: it is what is bought most often. */
const KIND_ORDER: readonly StockKind[] = ["seed", ...STOCK_KINDS.filter((k) => k !== "seed")];
import { SelectField, TextField } from "../fields";
import { addStockItem } from "./actions";
import type { ItemOption } from "./BillEditor";

/**
 * "+ New product" on a bill line — a seed, tray or cocopeat row created where
 * it is bought (the owner, 18 Oct 2026), replacing the add forms on the three
 * product screens. A kind and a key; the row starts hidden and unpriced, and
 * the bill it is on sets its cost once saved.
 *
 * Rendered outside the bill's `<form>`, so Enter here adds the product rather
 * than submitting the bill, and its fields are never posted with it.
 */
export function NewItemDialog({
  open,
  vendorId,
  suggestions,
  onAdded,
  onClose,
}: {
  open: boolean;
  vendorId: string;
  suggestions: Record<StockKind, string[]>;
  onAdded: (item: ItemOption) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.purchases.newItem");
  const tc = useTranslations("admin.common");
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<StockKind>("seed");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /* Opened and closed from the bill form's state — the top layer is outside
     React, so this is what an effect is for. */
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  /* Esc, Cancel or a product added: a fresh form next time. */
  const closed = () => {
    setKey("");
    setError(null);
    onClose();
  };

  const add = () =>
    start(async () => {
      const r = await addStockItem(kind, key, vendorId);
      if (r.ok) onAdded(r.item);
      else setError(t(`errors.${r.code}`, { key }));
    });

  return (
    <dialog
      ref={dialog}
      onClose={closed}
      aria-labelledby="new-item-title"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-forest/15 bg-cream p-0 text-left shadow-xl backdrop:bg-forest-deep/40"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="space-y-4 p-6"
      >
        <h2 id="new-item-title" className="font-display text-lg font-bold text-forest">
          {t("title")}
        </h2>
        <p className="font-body text-sm text-stone">{t("hint")}</p>
        <SelectField
          label={t("kind")}
          name="newItemKind"
          value={kind}
          onChange={(e) => setKind(e.target.value as StockKind)}
          options={KIND_ORDER.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
        <TextField
          label={t("key")}
          name="newItemKey"
          value={key}
          onChange={(e) => {
            setKey(sanitiseKey(e.target.value));
            setError(null);
          }}
          list={`new-item-keys-${kind}`}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={60}
          placeholder={t("keyPlaceholder")}
          hint={t("keyHint", { folder: t(`folders.${kind}`) })}
          error={error ?? undefined}
        />
        <datalist id={`new-item-keys-${kind}`}>
          {suggestions[kind].map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={closed}
            className="rounded-full border border-forest/25 px-5 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5"
          >
            {tc("cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-forest px-6 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
          >
            {pending ? t("adding") : t("add")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
