"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { RACK_COLOURS, colourHex } from "@/lib/racks/colours";

/**
 * The colours one angle grade is offered in — a multi-select of swatches.
 *
 * A grade carries *several* colours (the vendor's 1.4 mm powder coat comes in
 * three), so this cannot be a plain `<select>`. It replaced a comma-separated
 * text field, which let "grey", "Grey" and "gray" become three different
 * colours — and a rack referencing any of them would then fail the colour
 * check on its own grade.
 *
 * Swatches rather than words alone because a colour is the one attribute a
 * name is bad at carrying: the vendor's "purple" and the operator's may differ,
 * and a filled circle settles it.
 *
 * Behind a trigger rather than laid out flat, matching
 * `plans/VarietyMultiSelect`, because ten swatches × a row per angle grade
 * would be the tallest thing on the screen. No search box, though — that
 * component needs one at twenty varieties and this one would not earn it at
 * ten fixed colours.
 *
 * ## How the value reaches the server
 *
 * The checkboxes in the popup are **presentation only** — controlled by
 * `selected`, and they post nothing. The value is carried by one
 * `<input type="hidden" name="colours">` per chosen slug, so
 * `FormData.getAll("colours")` returns exactly what is picked whether the
 * popup is open or closed. Real checkboxes would work until the day the popup
 * unmounts while shut.
 */
export function ColourSelect({
  initial,
  compact,
  label,
  texts,
}: {
  /** Slugs selected on load. */
  initial: string[];
  /** Row variant: no visible label, trigger only. */
  compact?: boolean;
  label: string;
  /** Every string, already translated (CLAUDE.md). */
  texts: {
    none: string;
    summary: (count: number) => string;
    name: (slug: string) => string;
    open: string;
    clear: string;
    done: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(initial);
  const wrapper = useRef<HTMLDivElement>(null);

  /* Listened for only while open, so a page with four grades is not carrying
     four permanent document listeners. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const picked = new Set(selected);
  const toggle = (slug: string) =>
    setSelected((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );

  return (
    <div ref={wrapper} className="relative">
      {!compact && (
        <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {label}
        </span>
      )}

      {selected.map((slug) => (
        <input key={slug} type="hidden" name="colours" value={slug} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={texts.open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-cream px-3 py-2 text-left font-body text-sm transition-colors ${
          compact ? "" : "mt-1.5"
        } ${open ? "border-forest" : "border-forest/25 hover:border-forest/50"} ${
          selected.length === 0 ? "text-stone" : "text-forest"
        }`}
      >
        {selected.length === 0 ? (
          <span className="truncate">{texts.none}</span>
        ) : (
          /* Swatches always, then either the names or a count.
             `VarietyMultiSelect` makes the same call and for the same reason:
             at one or two, the colour itself is the thing being decided and
             "Grey" says it; at three the names stop fitting a table cell and
             the dots already carry the set, so the count is the honest
             summary. */
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex shrink-0 items-center gap-1">
              {selected.map((slug) => (
                <Swatch key={slug} slug={slug} title={texts.name(slug)} />
              ))}
            </span>
            <span className="truncate text-xs text-stone">
              {selected.length <= 2
                ? selected.map(texts.name).join(", ")
                : texts.summary(selected.length)}
            </span>
          </span>
        )}
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className={`shrink-0 text-stone transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        /* Absolute and `z-20`: it has to cover the cell to its right rather
           than push the table row's neighbours down. */
        <div className="absolute left-0 z-20 mt-1 w-48 rounded-xl border border-forest/20 bg-cream shadow-lg">
          <ul className="max-h-64 overflow-y-auto p-1">
            {RACK_COLOURS.map(({ slug }) => (
              <li key={slug}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-body text-sm text-forest transition-colors hover:bg-sand">
                  <input
                    type="checkbox"
                    checked={picked.has(slug)}
                    onChange={() => toggle(slug)}
                    className="size-3.5 shrink-0"
                  />
                  <Swatch slug={slug} />
                  <span className="truncate">{texts.name(slug)}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-forest/10 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              className="flex items-center gap-1 font-body text-xs text-stone underline underline-offset-4 transition-colors hover:text-forest disabled:opacity-40 disabled:no-underline"
            >
              <X size={11} strokeWidth={2} aria-hidden="true" />
              {texts.clear}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 font-body text-xs font-semibold text-forest"
            >
              <Check size={12} strokeWidth={2.5} aria-hidden="true" />
              {texts.done}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One filled circle.
 *
 * The ring is on every swatch, not just white: white on cream would otherwise
 * be an invisible dot, and special-casing it would make that one swatch a
 * different shape from the rest.
 *
 * A slug no longer in the palette renders as an outline rather than nothing,
 * so a grade saved before a colour was removed still shows that it has one.
 */
export function Swatch({ slug, title }: { slug: string; title?: string }) {
  const hex = colourHex(slug);
  return (
    <span
      title={title}
      aria-hidden="true"
      className="size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-forest/25"
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}
