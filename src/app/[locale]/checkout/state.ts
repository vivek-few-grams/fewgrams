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

/**
 * What the delivery-partner step gets back from `scanDelivery`: the fixed
 * own-run fee, every courier option cheapest first, or no price at all.
 * Rupees are already rounded up, and each option's `id` is what the pay form
 * posts back. `operatorNote` is resolved only for an admin (CLAUDE.md,
 * "Empty states are role-aware").
 */
export type DeliveryScan =
  | { status: "ownRun"; amount: number }
  | {
      status: "options";
      /** `YYYY-MM-DD` IST: the day the courier collects — ready date plus a
       *  day to pack. Null only for a cart with no date at all. */
      pickup: string | null;
      options: {
        id: string;
        courier: "delhivery" | "ekart" | "shiprocket";
        carrier: string | null;
        amount: number;
        /** `YYYY-MM-DD` IST: the pickup day plus this courier's days on
         *  the road, or null when it gave none. */
        arrives: string | null;
      }[];
    }
  | { status: "none"; operatorNote: { body: string; cta: string } | null };
