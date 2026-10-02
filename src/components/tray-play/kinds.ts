/**
 * The names the 3D trays and greens answer to, with no three.js attached —
 * so a page or a client component can list and validate them without pulling
 * the renderer into its bundle. `tray.ts` and `plants.ts` hold what each one
 * looks like.
 */

/** Tray pairs we have a model for, by their content key
 *  (`content/trays/<key>.json`). */
export const TRAY_FINISH_KEYS = ["tray-pair", "tray-pair-food-grade"] as const;
export type TrayFinish = (typeof TRAY_FINISH_KEYS)[number];
export const isTrayFinish = (
  key: string | null | undefined,
): key is TrayFinish =>
  !!key && (TRAY_FINISH_KEYS as readonly string[]).includes(key);

/** Greens we can draw. */
export const LOOK_KEYS = [
  "amaranth",
  "radish",
  "sunflower",
  "mustard",
] as const;
export type Look = (typeof LOOK_KEYS)[number];
/** The three grown on the home page and the garden's first step, in row
 *  order. The garden's seed bench offers every look. */
export const HOME_ROW = [
  "amaranth",
  "radish",
  "sunflower",
] as const satisfies readonly Look[];
export type HomeLook = (typeof HOME_ROW)[number];
export const isLook = (key: string | null | undefined): key is Look =>
  !!key && (LOOK_KEYS as readonly string[]).includes(key);
