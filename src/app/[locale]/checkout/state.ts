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

/** One courier's price for one parcel. `id` is what the pay form posts back
 *  for that parcel; rupees are already rounded up. */
export type ScanOption = {
  id: string;
  courier: "delhivery" | "ekart" | "shiprocket";
  carrier: string | null;
  amount: number;
  /** `YYYY-MM-DD` IST: the pickup day plus this courier's days on the road,
   *  or null when it gave none. */
  arrives: string | null;
};

/**
 * What the delivery-partner step gets back from `scanDelivery` — the order
 * as it will travel (SPEC §7, the owner, 24 Sep 2026): the own run if it has
 * greens, and one courier parcel per pickup, each with every courier's price
 * cheapest first. Or no price at all. `operatorNote` is resolved only for an
 * admin (CLAUDE.md, "Empty states are role-aware").
 *
 * **No pickup is named** — a parcel is "parcel 2" and the things in it, not
 * the town it leaves from (CLAUDE.md, "No city name in customer copy").
 */
export type DeliveryScan =
  | {
      status: "ready";
      ownRun: { amount: number; arrives: string; items: string[] } | null;
      parcels: {
        /** The pickup's id; the pay form posts `delivery:<id>`. */
        id: string;
        /** The names of the lines in it, as the order summary shows them. */
        items: string[];
        /** `YYYY-MM-DD` IST: the day the courier collects it. */
        pickup: string;
        options: ScanOption[];
      }[];
    }
  | { status: "none"; operatorNote: { body: string; cta: string } | null };

/** The form field a parcel's chosen option travels in. */
export const choiceField = (parcelId: string) => `delivery:${parcelId}`;
