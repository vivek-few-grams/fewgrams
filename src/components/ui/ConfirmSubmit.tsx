"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * A destructive submit button that asks first, in the app's own dialog.
 *
 * Replaces `window.confirm`, which cannot be styled, renders as
 * "localhost:3005 says", and on some browsers is suppressible by the user —
 * which would silently turn a guarded delete into an unguarded one.
 *
 * Built on the native `<dialog>` element rather than a hand-rolled overlay,
 * which gives four things for free and correctly: the top layer (so no
 * z-index fight with the sticky header), a focus trap, Escape to dismiss, and
 * `::backdrop`.
 *
 * ## How it submits
 *
 * The `<dialog>` is rendered **inside the caller's `<form>`**, so the confirm
 * button is a plain `type="submit"` for that form and needs no JavaScript to
 * do its job — no `form` attribute, no programmatic `requestSubmit`. Only
 * opening and closing the dialog needs the client.
 *
 * Every string arrives as a prop, already translated (CLAUDE.md).
 */
export function ConfirmSubmit({
  label,
  title,
  message,
  confirmLabel,
  cancelLabel,
  className,
}: {
  /** The trigger, e.g. "Delete". */
  label: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Styling for the trigger only; the dialog is deliberately uniform. */
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className}>
        {label}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        /* Clicking the backdrop dismisses. The check compares against the
           dialog itself because a click inside the panel bubbles up to the
           dialog element too, and would otherwise close it. */
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        /* `m-auto` is load-bearing. A modal `<dialog>` is centred by the UA
           stylesheet's `inset: 0; margin: auto`, and Tailwind's preflight
           zeroes margins on every element — so without this the panel pins
           itself to the top-left corner, under the sticky header. Verified by
           measuring: it sat at (0, 0) instead of centred.

           The width pairs with it: `max-w-sm` alone left a 384px panel with
           3px of margin on a 390px phone. */
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-forest/15 bg-cream p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <h2
            id="confirm-title"
            className="font-display text-lg font-bold tracking-tight text-forest"
          >
            {title}
          </h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-stone">{message}</p>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-full border border-forest/25 px-5 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
            >
              {cancelLabel}
            </button>
            <ConfirmButton label={confirmLabel} onSubmit={() => dialog.current?.close()} />
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * Split out so `useFormStatus` can read the enclosing form's pending state —
 * the hook only reports on a form that is an *ancestor* of the component
 * calling it, so it cannot live in the parent that renders the form.
 *
 * Disabling while pending is what stops a double-submit deleting twice, which
 * on a slow connection is otherwise one impatient double-click away.
 */
function ConfirmButton({ label, onSubmit }: { label: string; onSubmit: () => void }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      /* Closes the dialog on the way out. React runs this handler before the
         browser's default submit action, and removing the dialog from the top
         layer does not cancel that action — the button stays in the DOM. */
      onClick={onSubmit}
      className="rounded-full bg-terracotta px-5 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
