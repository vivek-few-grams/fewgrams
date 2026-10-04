import type { GatewayCheckout } from "@/lib/payments/provider";

/**
 * What the pay button gets back from `startCheckout`. Outside `actions.ts`
 * because a `"use server"` file may export only async functions.
 *
 * `ready` carries what the browser needs to open the gateway's payment screen
 * (`GatewayCheckout`). None of it is a secret — it can only pay this one
 * order, for the amount the server set.
 */
export type CheckoutState =
  | { status: "idle" }
  | { status: "ready"; orderId: string; checkout: GatewayCheckout }
  | { status: "error"; code: string; values?: Record<string, string> };

export const CHECKOUT_IDLE: CheckoutState = { status: "idle" };

/** The courier booked for one parcel — the cheapest the scan found. `id` is
 *  what the pay form posts back for that parcel. Its price is not here: the
 *  customer pays `fee`, not the courier's quote (SPEC §7.4). */
export type ScanOption = {
  id: string;
  courier: "delhivery" | "ekart" | "shiprocket" | "velocity";
  carrier: string | null;
  /** `YYYY-MM-DD` IST: the pickup day plus this courier's days on the road,
   *  or null when it gave none. */
  arrives: string | null;
};

/**
 * What the delivery-partner step gets back from `scanDelivery` — the order
 * as it will travel (SPEC §7): the own run if it has greens, and one courier
 * parcel per pickup, each with the courier booked for it, plus what the
 * customer pays for all of it (`fee`, SPEC §7.4 — free from ₹999 of goods,
 * otherwise the couriers' cost capped at ₹79). Or no price at all.
 * `operatorNote` is resolved only for an admin (CLAUDE.md, "Empty states are
 * role-aware").
 *
 * **No pickup is named** — a parcel is "parcel 2" and the things in it, not
 * the town it leaves from (CLAUDE.md, "No city name in customer copy").
 */
export type DeliveryScan =
  | {
      status: "ready";
      /** `amount` is the customer's share — 0 when delivery is free. */
      ownRun: { amount: number; arrives: string; items: string[] } | null;
      parcels: {
        /** The pickup's id; the pay form posts `delivery:<id>`. */
        id: string;
        /** The names of the lines in it, as the order summary shows them. */
        items: string[];
        /** `YYYY-MM-DD` IST: the day the courier collects it. */
        pickup: string;
        option: ScanOption;
        /** The customer's share of `fee` for this parcel, whole rupees — what
         *  its row shows on the right; 0 when delivery is free. */
        charge: number;
      }[];
      /** What the customer pays for delivery in all; `short` is how much
       *  more of goods would make it free, 0 once it is. */
      fee: { total: number; free: boolean; short: number };
    }
  | { status: "none"; operatorNote: { body: string; cta: string } | null };

/** The form field a parcel's chosen option travels in. */
export const choiceField = (parcelId: string) => `delivery:${parcelId}`;
