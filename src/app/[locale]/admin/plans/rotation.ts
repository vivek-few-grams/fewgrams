/**
 * The rotation's shape, in a module of its own.
 *
 * Not in `actions.ts`, because a file carrying "use server" may export **only
 * async functions** — a plain array there fails the build with "A 'use server'
 * file can only export async functions". Not in the page either, since the
 * client form, the row and the action all need the same four weeks and one of
 * them copying the number is how a five-week rotation gets half-built.
 */

/** SPEC §5.2 — a month is four Saturdays, so a rotation is four weeks.
 *  Declared once in `src/lib/subscriptions/weeks.ts`, which the tray plan
 *  and the subscription schedule read too. */
export { ROTATION_WEEKS } from "@/lib/subscriptions/weeks";

/** The field name each week's checkboxes share. Every ticked box posts its
 *  variety key under this name, so the action reads them with `getAll`. */
export const weekField = (week: number) => `week-${week}`;

/** One tickable variety in the week picker. Grow days travel with it because
 *  that is the figure the week assignment turns on (SPEC §5.2), and the
 *  operator should not have to open another screen to see it. */
export type VarietyChoice = { key: string; name: string; growDays: number };
