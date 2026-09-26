/** The form field one plan's bundle count travels in. Outside `actions.ts`
 *  because a `"use server"` file may export only async functions. */
export const boxesField = (planKey: string) => `boxes:${planKey}`;
