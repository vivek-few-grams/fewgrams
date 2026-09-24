/**
 * The courier seam — SPEC §7.
 *
 * Business code talks to this interface and never to a courier. Three
 * adapters, all asked at once at checkout (the owner, 24 Sep 2026): Delhivery
 * direct (`delhivery.ts`), Ekart direct (`ekart.ts`) and Shiprocket
 * (`shiprocket.ts`), an aggregator that answers with several carriers of its
 * own. A fourth courier is a fourth file implementing `options`, not a change
 * to checkout.
 *
 * Everything crossing the seam is normalised: rupees as a number, grams as an
 * integer, PIN codes as six-digit strings, and our own two-value speed. A
 * courier's vocabulary (`md=S`, `is_oda`, zone `D2`) stops at the adapter.
 *
 * Read-only for now: nothing here creates a shipment or spends wallet money.
 * Delhivery also answers serviceability and delivery-date questions; those
 * stay on `DelhiveryProvider`, since no other courier is asked them.
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
export type CourierName = "delhivery" | "ekart" | "shiprocket";

/**
 * One way to send the parcel, normalised across couriers. Delhivery and Ekart
 * each give one; Shiprocket gives one per carrier it can hand the parcel to.
 */
export type CourierOption = {
  /** Unique within one scan, and the same on the next scan for the same
   *  service: `delhivery`, `ekart`, `shiprocket:55`. Checkout posts it back. */
  id: string;
  courier: CourierName;
  /** The carrier Shiprocket hands the parcel to (`Xpressbees`), or null when
   *  the courier carries it itself. Data from the courier, not copy. */
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

export interface ShippingProvider {
  readonly name: CourierName;
  readonly mode: "staging" | "production";

  /**
   * Every way this courier can carry the parcel, cheapest first. Throws when
   * the courier does not answer or offers nothing — a refusal is never an
   * empty list that could read as "free".
   */
  options(input: QuoteInput): Promise<CourierOption[]>;
}
