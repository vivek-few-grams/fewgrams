/**
 * The play garden's running order — SPEC §25. One array, so the order lives
 * in one place (the storybook's rule): the progress dots, Back and Next, the
 * URL and the scene all read it.
 *
 * `touch` is the home page's grown tray, to run a hand over; every step after
 * it is one job on one tray, from an empty one on the bench to a harvest.
 */
export const STEPS = ["touch", "pick", "clean", "soak", "fill", "sow", "dark", "light", "harvest"] as const;
export type StepId = (typeof STEPS)[number];

/** The steps drawn by the garden scene — every one but the first. */
export type BenchStep = Exclude<StepId, "touch">;

export const isStepId = (raw: string | null | undefined): raw is StepId =>
  !!raw && (STEPS as readonly string[]).includes(raw);

/** A step from the URL, or the first one for anything unknown — a stale or
 *  hand-edited link lands at the start rather than on an error. */
export function stepFrom(raw: string | null | undefined): StepId {
  return isStepId(raw) ? raw : STEPS[0];
}

export function nextStep(step: StepId): StepId | null {
  const i = STEPS.indexOf(step);
  return i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

export function previousStep(step: StepId): StepId | null {
  const i = STEPS.indexOf(step);
  return i > 0 ? STEPS[i - 1] : null;
}
