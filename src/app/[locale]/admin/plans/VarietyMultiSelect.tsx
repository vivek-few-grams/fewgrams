"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { sanitiseKey } from "@/lib/content/content-key";
import type { VarietyChoice } from "./rotation";

/**
 * A searchable multi-select for one rotation week.
 *
 * DECISION (15 Sep 2026): this replaced a flat checkbox list, which replaced a
 * text field taking comma-separated variety keys. The checkbox list was right
 * about the interaction and wrong about the scale: four weeks × every variety
 * means the whole screen grows by four rows per green added, and at twenty
 * varieties the rotation alone is eighty checkboxes on one page.
 *
 * So the list moved behind a trigger and gained a filter. What is kept from
 * the checkbox version, because it was the point of it:
 *
 * - **grow days beside every name.** Week 1 carries the quick crops and week 2
 *   the slower ones sown the same Sunday (SPEC §5.2); the choice cannot be
 *   made without the number in front of you.
 * - **the list is ordered by grow days**, so each week's candidates are at the
 *   top of it.
 * - display names, never keys.
 *
 * ## How the value reaches the server
 *
 * The checkboxes in the popup are **presentation only** — they are controlled
 * by `selected` and post nothing. The value is carried by one
 * `<input type="hidden" name="week-N">` per chosen key, which is what makes
 * `FormData.getAll("week-N")` return exactly the picked varieties whether the
 * popup is open, closed or has a filter applied. Real checkboxes inside a
 * closed popup would work too, until the day the popup unmounts when closed.
 */
export function VarietyMultiSelect({
  name,
  weekLabel,
  choices,
  initial,
  texts,
}: {
  /** Form field name, e.g. `week-1`. */
  name: string;
  /** "Week 1", already translated — the visible label. */
  weekLabel: string;
  choices: VarietyChoice[];
  /** Variety keys selected on load. */
  initial: string[];
  /** Every string, already translated (CLAUDE.md). */
  texts: {
    none: string;
    summary: (count: number) => string;
    search: string;
    searchPlaceholder: string;
    noMatch: (query: string) => string;
    clear: string;
    done: string;
    open: string;
    growDays: (days: number) => string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(initial);
  const wrapper = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  /* Close on a click anywhere else and on Escape. Both are listened for only
     while the popup is open, so a page with four of these is not carrying
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
    search.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    /* Matches the display name and the key, normalising the query the same way
       a key is, so "Red Amaranth" finds `red-amaranth`. */
    const asKey = sanitiseKey(q);
    return choices.filter(
      (c) => c.name.toLowerCase().includes(q) || c.key.includes(asKey),
    );
  }, [choices, query]);

  const picked = new Set(selected);
  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  /* The summary names what is in the week rather than counting it, because
     "Mustard, Red Amaranthus" is the thing being decided and "2 varieties" is
     not. It falls back to the count once the list would no longer fit. */
  const names = selected
    .map((key) => choices.find((c) => c.key === key)?.name ?? key)
    .filter(Boolean);
  const summary =
    names.length === 0
      ? texts.none
      : names.length <= 2
        ? names.join(", ")
        : texts.summary(names.length);

  return (
    <div ref={wrapper} className="relative">
      <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-stone">
        {weekLabel}
      </span>

      {selected.map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={texts.open}
        className={`mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border bg-cream px-3 py-2 text-left font-body text-sm transition-colors ${
          open ? "border-forest" : "border-forest/25 hover:border-forest/50"
        } ${names.length === 0 ? "text-stone" : "text-forest"}`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className={`shrink-0 text-stone transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        /* Absolutely positioned and `z-20`: four of these sit side by side and
           the popup has to cover the week to its right, not push it down. */
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-forest/20 bg-cream shadow-lg">
          <label className="relative block border-b border-forest/10 p-2">
            <span className="sr-only">{texts.search}</span>
            <Search
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone"
            />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={texts.searchPlaceholder}
              className="w-full rounded-lg border border-forest/20 bg-sand py-1.5 pl-8 pr-2 font-body text-sm outline-none placeholder:text-stone/60 focus:border-forest"
            />
          </label>

          <ul className="max-h-56 overflow-y-auto p-1">
            {shown.length === 0 ? (
              <li className="px-2 py-3 font-body text-xs text-stone">
                {texts.noMatch(query.trim())}
              </li>
            ) : (
              shown.map((choice) => (
                <li key={choice.key}>
                  <label className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 font-body text-sm text-forest transition-colors hover:bg-sand">
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={picked.has(choice.key)}
                        onChange={() => toggle(choice.key)}
                        className="size-3.5 shrink-0"
                      />
                      <span className="truncate">{choice.name}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-stone">
                      {texts.growDays(choice.growDays)}
                    </span>
                  </label>
                </li>
              ))
            )}
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
