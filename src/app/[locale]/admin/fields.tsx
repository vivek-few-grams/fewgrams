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
