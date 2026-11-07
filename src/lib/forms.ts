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
  | {
      status: "saved";
      /** Something the save did that the person should know — a key and its
       *  arguments, like an error. */
      notice?: { code: string; values?: Record<string, string> };
    }
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

/**
 * A figure the owner may not have measured yet — packing weights and sizes.
 * Blank is `undefined` (not yet known, and flagged where it matters); present
 * must be above zero; anything else is `"invalid"`. Three answers because
 * "not measured" and "typed nonsense" need different responses.
 */
export function optionalPositive(fd: FormData, key: string): number | undefined | "invalid" {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : "invalid";
}

/** The highest sort order a plan or a pack can have. Their GSI1 sort key pads
 *  it to three digits (src/lib/db/entities.ts), and DynamoDB sorts that key as
 *  a string — so a 1000 would land between 100 and 101. */
export const MAX_SORT_ORDER = 999;

/**
 * A card's place in its row — plans and starter packs. Whole, 0 to
 * `MAX_SORT_ORDER`; blank is 0, as it always was. A fraction or a negative
 * would pad into a key that sorts out of order, which is why this is not
 * `zeroOrMore`.
 */
export function sortOrder(fd: FormData, key = "sortOrder"): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SORT_ORDER ? n : null;
}

/**
 * What an on/off button asks for — `true` for on, `false` for off — posted as
 * a hidden `to` field beside the button, or `null` when it is missing.
 *
 * The button says where it is going rather than "flip whatever is stored": a
 * double click, or a press in a tab opened before someone else switched the
 * row, then lands on the state the button showed instead of undoing itself.
 * The action compares it with the stored state and writes nothing when they
 * already agree.
 */
export function switchTo(fd: FormData): boolean | null {
  const to = fd.get("to");
  return to === "on" ? true : to === "off" ? false : null;
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
export function err(code: string, field?: string, values?: Record<string, string>): FormState {
  return { status: "error", code, ...(field ? { field } : {}), ...(values ? { values } : {}) };
}
