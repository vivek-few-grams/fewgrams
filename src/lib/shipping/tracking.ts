import type { CourierName } from "./provider";

/**
 * Each courier's public tracking page for a parcel — 27 Sep 2026. The
 * customer's order page links the tracking number here. Shiprocket's page
 * works whichever carrier it handed the parcel to.
 */
const TRACKING_PAGE: Record<CourierName, (awb: string) => string> = {
  delhivery: (awb) => `https://www.delhivery.com/track-v2/package/${awb}`,
  ekart: (awb) => `https://app.elite.ekartlogistics.in/track/${awb}`,
  shiprocket: (awb) => `https://shiprocket.co/tracking/${awb}`,
};

export function trackingUrl(courier: CourierName, trackingNumber: string): string {
  return TRACKING_PAGE[courier](encodeURIComponent(trackingNumber));
}
