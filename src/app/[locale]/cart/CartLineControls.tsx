"use client";

import { Minus, Plus, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { removeCartLine, updateCartLine } from "./actions";

/**
 * Quantity stepper and remove button for one cart line.
 *
 * **Three separate `<form>`s, not one with three buttons.** Each button sends a
 * different quantity, so a single form would need either three `formAction`s
 * carrying their own hidden values or client state duplicating the server's —
 * and `useFormStatus` reads the *nearest ancestor* form, so one form would make
 * all three buttons report each other's pending state.
 *
 * `-1` and `+1` are computed here and sent as an absolute quantity rather than
 * a delta. A delta plus a double-click is a race; an absolute value applied
 * twice is idempotent.
 *
 * Decrementing to zero removes the line (`setUnits`), so there is no state
 * where the quantity reads 0 and the line is still on the page.
 */
export function CartLineControls({
  contentKey,
  units,
  max,
  labels,
}: {
  contentKey: string;
  units: number;
  max: number;
  labels: {
    decrease: string;
    increase: string;
    remove: string;
    removeShort: string;
  };
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 rounded-full border border-forest/20 p-1">
        <StepForm
          contentKey={contentKey}
          units={units - 1}
          label={labels.decrease}
          icon="minus"
        />
        <span className="min-w-8 text-center font-display text-sm font-semibold tabular-nums text-forest">
          {units}
        </span>
        <StepForm
          contentKey={contentKey}
          units={units + 1}
          label={labels.increase}
          icon="plus"
          disabled={units >= max}
        />
      </div>

      <form action={removeCartLine}>
        <input type="hidden" name="key" value={contentKey} />
        <RemoveButton label={labels.remove} title={labels.removeShort} />
      </form>
    </div>
  );
}

function StepForm({
  contentKey,
  units,
  label,
  icon,
  disabled,
}: {
  contentKey: string;
  units: number;
  label: string;
  icon: "minus" | "plus";
  disabled?: boolean;
}) {
  return (
    <form action={updateCartLine}>
      <input type="hidden" name="key" value={contentKey} />
      <input type="hidden" name="units" value={units} />
      <StepButton label={label} icon={icon} disabled={disabled} />
    </form>
  );
}

/** Split out so `useFormStatus` sees its own form as an ancestor — the hook
 *  reports nothing when called from the component that renders the form. */
function StepButton({
  label,
  icon,
  disabled,
}: {
  label: string;
  icon: "minus" | "plus";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const Icon = icon === "minus" ? Minus : Plus;

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={label}
      className="grid size-8 place-items-center rounded-full text-forest transition-colors hover:bg-sand disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}

function RemoveButton({ label, title }: { label: string; title: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={title}
      className="grid size-8 place-items-center rounded-full text-stone transition-colors hover:bg-terracotta/10 hover:text-terracotta disabled:opacity-40"
    >
      <X size={16} strokeWidth={2} />
    </button>
  );
}
