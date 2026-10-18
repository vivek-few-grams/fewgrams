import { startTransition, type FormEvent } from "react";

/**
 * `onSubmit` for a `<form action={…}>` whose fields are all controlled: runs
 * the same action without React resetting the form afterwards.
 *
 * React 19 resets a form once its action has run (`requestFormReset`). It
 * puts a controlled text input back, but not a controlled `<select>`: the
 * dropdown shows the option it first rendered with while state still holds
 * the choice, and the next submit posts the stale one. Found 18 Oct 2026 — a
 * bill refused for its file came back with the vendor showing "Choose a
 * vendor" and every line's "For" showing "Stock to sell".
 *
 * Dispatching from `onSubmit`, inside a transition, keeps `pending` working
 * and skips the reset. `action` stays on the form for a submit made before
 * hydration. Only for forms whose state is the truth: one that relies on the
 * reset to clear uncontrolled inputs must clear its own state instead.
 */
export function keepFields(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
}
