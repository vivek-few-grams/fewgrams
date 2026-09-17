import { ChevronDown } from "lucide-react";

/**
 * Form inputs shared by the add form and the per-row edit form.
 *
 * No "use client" — both callers are client components, and keeping these
 * plain means they could also be rendered from a server component later. No
 * string is hardcoded here: every label and hint arrives already translated
 * (CLAUDE.md).
 */

export function NumberField({
  label,
  name,
  hint,
  error,
  compact,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  /** Row variant: a bare input with the label as its accessible name only. */
  compact?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const field = (
    <input
      type="number"
      name={name}
      step="any"
      aria-label={compact ? label : undefined}
      aria-invalid={error ? true : undefined}
      className={`w-full rounded-lg border bg-cream px-3 py-2 font-body text-sm tabular-nums outline-none focus:border-forest ${
        error ? "border-terracotta" : "border-forest/25"
      } ${compact ? "" : "mt-1.5"}`}
      {...input}
    />
  );

  if (compact) return field;

  return (
    <label className="block">
      <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {label}
      </span>
      {field}
      {hint && !error && (
        <span className="mt-1 block font-body text-[11px] text-stone">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block font-body text-[11px] text-terracotta">{error}</span>
      )}
    </label>
  );
}

/** A checkbox with its label to the right. `cursor: pointer` and the focus
 *  ring come from the base rules in globals.css, never a per-element class
 *  (CLAUDE.md). */
export function CheckField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 font-body text-sm text-forest">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  );
}

/**
 * A free-text input, for the two places a table row cannot offer repeating
 * inputs: the heights a rack is sold in, and the colours an angle grade comes
 * in. Both are short comma-separated lists, parsed once on write.
 *
 * Same two variants as `NumberField` so a row and a form can share a label
 * string — `compact` drops the visible label and keeps it as the accessible
 * name, which is what keeps a grid row aligned with its header.
 */
export function TextField({
  label,
  name,
  hint,
  error,
  compact,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  compact?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const field = (
    <input
      type="text"
      name={name}
      aria-label={compact ? label : undefined}
      aria-invalid={error ? true : undefined}
      className={`w-full rounded-lg border bg-cream px-3 py-2 font-body text-sm outline-none focus:border-forest ${
        error ? "border-terracotta" : "border-forest/25"
      } ${compact ? "" : "mt-1.5"}`}
      {...input}
    />
  );

  if (compact) return field;

  return (
    <label className="block">
      <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {label}
      </span>
      {field}
      {hint && !error && (
        <span className="mt-1 block font-body text-[11px] text-stone">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block font-body text-[11px] text-terracotta">{error}</span>
      )}
    </label>
  );
}

/**
 * A `<select>`, styled to match the inputs above.
 *
 * Racks are the first admin screen where a field's valid values come from
 * another row in the same screen — a rack's shelf size is one of the plates
 * listed above it, and its colour is one the chosen angle grade is offered in.
 * Free text there would let an operator enter a rack the vendor cannot build,
 * so the options are passed in already resolved.
 */
export function SelectField({
  label,
  name,
  options,
  hint,
  error,
  compact,
  ...select
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  hint?: string;
  error?: string;
  compact?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  /* `appearance-none` and our own chevron, rather than the platform arrow.
     Not decoration: these selects sit in a row beside `ColourSelect`, whose
     trigger is a styled button with a lucide chevron, and the native control
     draws a different arrow in a different place on every OS — so the row
     looked like two kinds of control rather than one. `pr-8` reserves the
     space the chevron sits in, and the chevron takes `pointer-events-none` so
     a click on it still opens the select. */
  const field = (
    <span className={`relative block ${compact ? "" : "mt-1.5"}`}>
      <select
        name={name}
        aria-label={compact ? label : undefined}
        aria-invalid={error ? true : undefined}
        className={`w-full appearance-none rounded-lg border bg-cream py-2 pl-3 pr-8 font-body text-sm outline-none focus:border-forest ${
          error ? "border-terracotta" : "border-forest/25"
        }`}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-stone"
      />
    </span>
  );

  if (compact) return field;

  return (
    <label className="block">
      <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {label}
      </span>
      {field}
      {hint && !error && (
        <span className="mt-1 block font-body text-[11px] text-stone">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block font-body text-[11px] text-terracotta">{error}</span>
      )}
    </label>
  );
}
