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
