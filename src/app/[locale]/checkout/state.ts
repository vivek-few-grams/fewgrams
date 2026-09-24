/**
 * What the pay button gets back from `startCheckout`. Outside `actions.ts`
 * because a `"use server"` file may export only async functions.
 *
 * `ready` carries the gateway session for the browser SDK to open. It is not
 * a secret — it can only pay this one order, for the amount the server set.
 */
export type CheckoutState =
  | { status: "idle" }
  | { status: "ready"; orderId: string; sessionId: string; mode: "sandbox" | "production" }
  | { status: "error"; code: string; values?: Record<string, string> };

export const CHECKOUT_IDLE: CheckoutState = { status: "idle" };
