"use client";

import { useFormStatus } from "react-dom";

/**
 * One press moves an order a step forward — picked, ready, handed over.
 *
 * No confirmation dialog, deliberately: the owner works through these with
 * an order in hand and asked for them to be immediate. A double press is
 * harmless — `advanceOrderStatus` is conditional on the status the page
 * showed — and the button disables itself while the write is in flight so
 * it does not look inert after the first. "Delivery failed" is the one move
 * that keeps `ConfirmSubmit`, because it is the one a customer is told about
 * as bad news.
 *
 * A client component only for `useFormStatus`, which reports on the nearest
 * ancestor form; the form itself stays in the server page.
 */
export function StepSubmit({ label, primary }: { label: string; primary: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full px-4 py-2 font-body text-sm font-semibold transition-colors disabled:opacity-60 ${
        primary
          ? "bg-forest text-cream hover:bg-forest-deep"
          : "border border-forest/25 text-forest hover:bg-forest/5"
      }`}
    >
      {label}
    </button>
  );
}
