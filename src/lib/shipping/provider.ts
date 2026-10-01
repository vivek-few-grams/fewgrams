import type { BoxCm } from "./weight";

/**
 * The courier seam — SPEC §7.
 *
 * Business code talks to this interface and never to a courier. Four
 * adapters, all asked at once at checkout (the owner, 24 Sep and 1 Oct 2026):
 * Delhivery direct (`delhivery.ts`), Ekart direct (`ekart.ts`), and two
 * aggregators that answer with several carriers of their own, Shiprocket
 * (`shiprocket.ts`) and Velocity (`velocity.ts`). Another courier is another
 * file implementing `options`, not a change to checkout.
 *
 * Everything crossing the seam is normalised: rupees as a number, grams as an
 * integer, PIN codes as six-digit strings, and our own two-value speed. A
 * courier's vocabulary (`md=S`, `is_oda`, zone `D2`) stops at the adapter.
 *
 * `options` is read-only. `book` creates a shipment and asks for a pickup,
 * which **spends wallet money** — it is called only from the admin order page
 * (`src/lib/shipping/book.ts`), one parcel at a time, behind a lock. Delhivery
 * also answers serviceability and delivery-date questions; those stay on
 * `DelhiveryProvider`, since no other courier is asked them.
 */

/** Surface is road, and the default; express is air. Within Bengaluru the
 *  two arrive on the same day, so express is only ever an upgrade. */
export type ShippingSpeed = "surface" | "express";

export type Serviceability = {
  pincode: string;
  /** Prepaid delivery accepted. The shop takes no cash on delivery, so this
   *  is the only delivery flag that matters. */
  prepaid: boolean;
  /** The courier collects from this PIN — true of the pickup address. */
  pickup: boolean;
  /** An out-of-delivery-area PIN, which couriers surcharge and deliver late. */
  remote: boolean;
};

export type QuoteInput = {
  originPin: string;
  destinationPin: string;
  /** Chargeable weight — already the larger of dead and volumetric weight;
   *  see `chargeableGrams`. The courier bills the grams it is given. */
  grams: number;
  speed: ShippingSpeed;
  /** Rupees the goods are worth, for couriers that ask for a declared value.
   *  It sets their liability, not the price, on every plan we are on. */
  value?: number;
};

/** Who the shipment is booked with — the account the wallet money leaves. */
export type CourierName = "delhivery" | "ekart" | "shiprocket" | "velocity";

/**
 * One way to send the parcel, normalised across couriers. Delhivery and Ekart
 * each give one; Shiprocket gives one per carrier it can hand the parcel to.
 */
export type CourierOption = {
  /** Unique within one scan, and the same on the next scan for the same
   *  service: `delhivery`, `ekart`, `shiprocket:55`, `velocity:CARADCBTZMQMM`.
   *  Checkout posts it back. */
  id: string;
  courier: CourierName;
  /** The carrier an aggregator hands the parcel to (`Xpressbees`), or null
   *  when the courier carries it itself. Data from the courier, not copy. */
  carrier: string | null;
  /** The aggregator's own id for that carrier, needed to book it later. */
  serviceId: string | null;
  /** Rupees including GST, to the paisa. */
  total: number;
  beforeTax: number;
  chargedGrams: number;
  /** The courier's distance zone, for the admin screen only; "" if none. */
  zone: string;
  /** Days on the road, when the courier says; null when it does not. */
  days: number | null;
};

export type Quote = {
  /** Rupees including GST, to the paisa, as the courier computed it. An
   *  estimate: the final charge follows the courier's own weighing. */
  total: number;
  /** Rupees before GST. */
  beforeTax: number;
  /** The weight the courier priced, which can round up the weight sent. */
  chargedGrams: number;
  /** The courier's distance zone, for the admin screen only. */
  zone: string;
};

export type DeliveryEstimate = {
  /** Days from pickup to delivery. */
  days: number;
  /** `YYYY-MM-DD`, IST. */
  date: string;
};

/** Everything a courier needs to create one prepaid forward shipment. */
export type BookingInput = {
  /** Unique per parcel and stable across retries: the order id, with
   *  `-2`, `-3` for an order's later parcels. Couriers refuse a repeat. */
  reference: string;
  /** ISO timestamp the order was placed. */
  orderDate: string;
  /** Where it is collected. `name` must match the pickup location registered
   *  on the courier's account exactly — that is how every courier finds it. */
  pickup: { name: string; phone: string; address: string; city: string; pincode: string };
  drop: {
    name: string;
    phone: string;
    email: string | null;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: { name: string; sku: string; units: number; unitPrice: number }[];
  /** Rupees, the goods only. Prepaid: nothing is collected at the door. */
  value: number;
  /** The grams the parcel was quoted at, and the box that bills at them
   *  (`boxForGrams`) — booked as quoted, reweighed by the courier. */
  grams: number;
  box: BoxCm;
  speed: ShippingSpeed;
  /** The aggregator's carrier id from the quote (Shiprocket, Velocity);
   *  null for the others. */
  serviceId: string | null;
  /** `YYYY-MM-DD`, IST: the day the courier should collect. */
  pickupDate: string;
};

export type BookingResult = {
  trackingNumber: string;
  /** The courier's own shipment id, when it has one apart from the AWB. */
  courierRef: string | null;
  /** False when the shipment was created but the pickup request failed —
   *  the parcel is booked either way and must not be booked again. */
  pickupRequested: boolean;
  pickupError: string | null;
  labelUrl: string | null;
};

export interface ShippingProvider {
  readonly name: CourierName;
  readonly mode: "staging" | "production";

  /**
   * Every way this courier can carry the parcel, cheapest first. Throws when
   * the courier does not answer or offers nothing — a refusal is never an
   * empty list that could read as "free".
   */
  options(input: QuoteInput): Promise<CourierOption[]>;

  /**
   * Create the shipment and request its pickup. Throws when no shipment was
   * created, so the caller can release its lock and let the operator retry.
   * Once a tracking number exists it **must not throw** — a failed pickup
   * request is reported in the result, not raised, or the retry would book
   * the parcel a second time.
   */
  book(input: BookingInput): Promise<BookingResult>;
}
