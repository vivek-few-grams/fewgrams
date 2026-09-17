/**
 * The result shape every form gets back from its server action.
 *
 * Shared by the account screens and the admin catalogue screens.
 *
 * In its own module, not in an `actions.ts`, because a file carrying the
 * "use server" directive may export **only async functions** — `IDLE` is a
 * plain object, so exporting it from there fails the build with "A 'use
 * server' file can only export async functions, found object".
 *
 * Errors travel as a message *key* plus its ICU arguments, never as a
 * sentence. These pages render in two languages and a server action has no
 * business choosing the wording (CLAUDE.md); the key resolves against
 * `account.errors` in the component that renders it.
 */
export type FormState =
  | { status: "idle" }
  | { status: "saved" }
  | {
      status: "error";
      code: string;
      /** Which input to point at, for `aria-invalid` and the inline message.
       *  Absent when the failure belongs to the form as a whole. */
      field?: string;
      values?: Record<string, string>;
    };

export const IDLE: FormState = { status: "idle" };

/* ───────────────────────── field readers ───────────────────────────── */

/**
 * Numeric readers shared by the two rack screens.
 *
 * They live here rather than in either `actions.ts` for the reason at the top
 * of this file — a `"use server"` module may export only async functions — and
 * they are shared rather than copied because a plated rack and an open-frame
 * rack validate the same rates. A second copy is a second place for the next
 * rule change to be applied to only half the range.
 *
 * Safe for a client component to import: nothing here touches the request.
 */

/** A price or a rate: must be present and above zero. */
export function money(fd: FormData, key: string): number | null {
  const n = Number(String(fd.get(key) ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A count of parts: whole, and at least one. */
export function count(fd: FormData, key: string): number | null {
  const n = Number(String(fd.get(key) ?? "").trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * A figure where zero is a legitimate answer, such as markup.
 *
 * The empty check is not redundant: `Number("")` is `0`, so without it a blank
 * field reads as a deliberate zero. That is how every rack added with the sort
 * order left empty landed on 0 instead of falling through to a default, and
 * why they all sorted together.
 */
export function zeroOrMore(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Comma-separated free text → a clean list. Used for heights, which have no
 *  fixed set to pick from and so stay typed. */
export function csv(fd: FormData, key: string): string[] {
  return String(fd.get(key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** An error `FormState`, as a message key plus its ICU arguments — never a
 *  sentence. See the note on `FormState`. */
export function err(
  code: string,
  field?: string,
  values?: Record<string, string>,
): FormState {
  return { status: "error", code, ...(field ? { field } : {}), ...(values ? { values } : {}) };
}
