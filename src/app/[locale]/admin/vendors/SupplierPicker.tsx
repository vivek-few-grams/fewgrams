"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Search, Store } from "lucide-react";
import { setSuppliers } from "./actions";
import { VendorForm } from "./VendorForm";

export type VendorChoice = { id: string; name: string };

/**
 * The vendor picker on a product screen — SPEC §26.6 (the owner, 18 Oct
 * 2026). Shows who the product is bought from and opens a dialog to tick
 * them; a product may have several. "+ New vendor" adds one without leaving
 * the screen, with the vendors page's own form.
 *
 * A native `<dialog>` in the top layer rather than a dropdown: the seed and
 * stock tables scroll sideways, and a scrolling box clips anything hung out
 * of it. The ticks save together on Save, through `setSuppliers`, which
 * writes only the vendors whose list changed.
 */
export function SupplierPicker({
  supplyKey,
  item,
  vendors,
  selected,
}: {
  supplyKey: string;
  /** What the product is called, for the dialog's title. */
  item: string;
  vendors: VendorChoice[];
  selected: string[];
}) {
  const t = useTranslations("admin.suppliers");
  const tc = useTranslations("admin.common");
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<string[]>(selected);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const names = vendors.filter((v) => selected.includes(v.id)).map((v) => v.name);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? vendors.filter((v) => v.name.toLowerCase().includes(q)) : vendors;
  }, [vendors, query]);

  const open = () => {
    setChosen(selected);
    setAdding(false);
    setQuery("");
    setError(null);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const save = () =>
    start(async () => {
      const r = await setSuppliers(supplyKey, chosen);
      if (r.ok) close();
      else setError(t(`errors.${r.code}`));
    });

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`mt-1 flex max-w-full items-start gap-1.5 text-left font-body text-[11px] underline-offset-4 transition-colors hover:underline ${
          names.length ? "text-forest" : "text-stone"
        }`}
      >
        <Store aria-hidden size={12} strokeWidth={2} className="mt-px shrink-0" />
        <span className="min-w-0">{names.length ? names.join(" · ") : t("none")}</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`suppliers-${supplyKey}`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-forest/15 bg-cream p-0 text-left shadow-xl backdrop:bg-forest-deep/40"
      >
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <h2 id={`suppliers-${supplyKey}`} className="font-display text-lg font-bold text-forest">
            {t("title", { item })}
          </h2>

          {adding ? (
            <div className="mt-4">
              <VendorForm onDone={() => setAdding(false)} onAdded={() => setAdding(false)} />
            </div>
          ) : (
            <>
              <p className="mt-1 font-body text-sm text-stone">{t("hint")}</p>
              {vendors.length > 6 && (
                <label className="relative mt-4 block">
                  <span className="sr-only">{t("search")}</span>
                  <Search
                    aria-hidden
                    size={15}
                    strokeWidth={1.75}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("search")}
                    className="w-full rounded-full border border-forest/25 bg-white py-1.5 pl-9 pr-3 font-body text-sm outline-none focus:border-forest"
                  />
                </label>
              )}
              {vendors.length === 0 ? (
                <p className="mt-4 font-body text-sm text-stone">{t("noVendors")}</p>
              ) : (
                <ul className="mt-4 space-y-1">
                  {shown.map((v) => (
                    <li key={v.id}>
                      <label className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 font-body text-sm text-forest hover:bg-sage/30">
                        <input
                          type="checkbox"
                          checked={chosen.includes(v.id)}
                          onChange={(e) =>
                            setChosen((c) => (e.target.checked ? [...c, v.id] : c.filter((x) => x !== v.id)))
                          }
                          className="size-4 shrink-0"
                        />
                        {v.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 font-body text-sm font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
              >
                {t("newVendor")}
              </button>
              {error && (
                <p role="alert" className="mt-3 font-body text-sm text-terracotta">
                  {error}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-forest/25 px-5 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5"
                >
                  {tc("cancel")}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="rounded-full bg-forest px-6 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
                >
                  {pending ? t("saving") : tc("save")}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
