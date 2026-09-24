/**
 * The courier seam — SPEC §7.
 *
 * Business code talks to this interface and never to a courier. Delhivery is
 * the one adapter today (`delhivery.ts`); a second courier is a second file
 * implementing these methods, not a change to checkout or to the admin board.
 *
 * Everything crossing the seam is normalised: rupees as a number, grams as an
 * integer, PIN codes as six-digit strings, and our own two-value speed. A
 * courier's vocabulary (`md=S`, `is_oda`, zone `D2`) stops at the adapter.
 *
 * Read-only for now: nothing here creates a shipment or spends wallet money.
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
  readonly name: "delhivery";
  readonly mode: "staging" | "production";

  /** Null when the courier does not serve the PIN at all. */
  serviceability(pincode: string): Promise<Serviceability | null>;

  quote(input: QuoteInput): Promise<Quote>;

  expectedDelivery(input: {
    originPin: string;
    destinationPin: string;
    speed: ShippingSpeed;
    pickupAt: Date;
  }): Promise<DeliveryEstimate>;
}
