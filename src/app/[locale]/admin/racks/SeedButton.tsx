"use client";

import { useFormStatus } from "react-dom";
import { Download } from "lucide-react";
import { seedRates } from "./actions";

/**
 * Loads the vendor's quoted sheet in one press.
 *
 * A client component only so the button can disable itself while the write is
 * in flight — `useFormStatus` reports on the nearest ancestor form, which is
 * why the form is here rather than in the page. Pressing it twice would be
 * harmless anyway (`seedRateCard` never overwrites an existing row), but a
 * button that looks inert after a click invites the second press that makes
 * the owner doubt the first.
 *
 * The label arrives already translated: `admin` messages are stripped from the
 * public client catalogue, and while this subtree does get them back, passing
 * the string keeps the component free of a namespace it does not otherwise
 * need.
 *
 * Only this screen has one. The open-frame screen deliberately does not: the
 * footprints it needs arrive with `scripts/racks-fill.mjs`, and the owner asked
 * for fewer buttons there, not more.
 */
export function SeedButton({ label }: { label: string }) {
  return (
    <form action={seedRates} className="mt-4">
      <Submit label={label} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-full bg-forest px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest/85 disabled:opacity-60"
    >
      <Download size={14} strokeWidth={2} />
      {label}
    </button>
  );
}
