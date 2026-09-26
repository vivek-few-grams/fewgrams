/** More than this many of one bundle is a wholesale conversation, not a
 *  checkout. Its own module so the client stepper can read it without
 *  pulling in `subscription.ts`, which imports `node:crypto`. */
export const MAX_BOXES_PER_PLAN = 10;
