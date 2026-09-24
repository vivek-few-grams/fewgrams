/**
 * Presentational pieces shared by the account screens.
 *
 * No "use client" and no server-only imports, so the same `Field` renders
 * inside a server page and inside a client form. Nothing here holds state or
 * fetches anything — it exists so the four account pages look like one place
 * rather than four.
 *
 * No string in this file: every label, hint and error arrives as a prop,
 * already translated by the caller (CLAUDE.md).
 */

import { formatPhone, formatPlace } from "@/lib/account/validation";
import type { Address } from "@/lib/types";

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-forest/15 bg-cream p-6 md:p-7">
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          {title && (
            <h2 className="font-display text-lg font-semibold text-forest">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A read-only label/value pair. `value` falls back to a muted placeholder so
 *  an empty profile reads as "not added yet" rather than as a broken row. */
export function Detail({
  label,
  value,
  empty,
}: {
  label: string;
  value?: string | null;
  empty: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-forest/10 py-3 last:border-0">
      <dt className="font-body text-xs uppercase tracking-wider text-stone">{label}</dt>
      <dd
        className={`font-body text-sm ${value ? "text-forest" : "italic text-stone/70"}`}
      >
        {value || empty}
      </dd>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, name, hint, error, className, ...input }: FieldProps) {
  const describedBy = [hint && `${name}-hint`, error && `${name}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={`block ${className ?? ""}`}>
      <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {label}
      </span>
      <input
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`mt-1.5 w-full rounded-lg border bg-cream px-3 py-2.5 font-body text-sm outline-none placeholder:text-stone/50 focus:border-forest ${
          error ? "border-terracotta" : "border-forest/25"
        }`}
        {...input}
      />
      {hint && !error && (
        <span id={`${name}-hint`} className="mt-1 block font-body text-xs text-stone/80">
          {hint}
        </span>
      )}
      {error && (
        <span
          id={`${name}-error`}
          className="mt-1 block font-body text-xs text-terracotta"
        >
          {error}
        </span>
      )}
    </label>
  );
}

/** Used for the delivery-instructions box, which people write a sentence in. */
export function TextareaField({
  label,
  name,
  hint,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {label}
      </span>
      <textarea
        name={name}
        rows={2}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2.5 font-body text-sm outline-none placeholder:text-stone/50 focus:border-forest"
        {...input}
      />
      {hint && (
        <span id={`${name}-hint`} className="mt-1 block font-body text-xs text-stone/80">
          {hint}
        </span>
      )}
    </label>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** Saved / failed feedback under a form. `polite` because it follows the
 *  customer's own action — it should not interrupt what they are reading. */
export function FormMessage({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`font-body text-sm ${tone === "ok" ? "text-forest" : "text-terracotta"}`}
    >
      {children}
    </p>
  );
}

/**
 * One saved address, rendered as the postal lines.
 *
 * The only text here is the customer's own, so there is nothing to translate —
 * an address is not chrome. Blank lines are dropped rather than rendered
 * empty, because most Bengaluru addresses use three of the five.
 */
export function AddressLines({ address }: { address: Address }) {
  const lines = [
    address.recipient,
    address.line1,
    address.line2,
    address.landmark,
    formatPlace(address),
    formatPhone(address.phone),
  ].filter(Boolean);

  return (
    <address className="font-body text-sm not-italic leading-relaxed text-forest">
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
      {address.notes && (
        <span className="mt-2 block text-xs text-stone">“{address.notes}”</span>
      )}
    </address>
  );
}
