/**
 * What the customer pays for delivery — SPEC §7.4 (the owner, 4 Oct 2026).
 *
 * - **Free from ₹999 of goods.** It was ₹499 for a day; raised so that
 *   mid-size bulky orders (drain mats, trays with a 5 kg block) pay their
 *   delivery — SPEC §7.4 has the numbers. The whole order, greens' own run
 *   included, so the home-page banner is true as written.
 * - **Under that, the couriers' cost capped at ₹79**, never more than it
 *   actually costs: a ₹36 seed parcel is charged ₹36. The own run, when the
 *   order has greens, keeps its fixed fee from admin → delivery.
 *
 * The courier is still paid its full quote; the gap is ours, and the margins
 * were raised to carry it (the racks' especially). That is a pricing choice,
 * not something the copy claims — nothing says delivery is "included".
 *
 * Here and only here, so checkout, the order and the banner cannot disagree.
 */

/** Goods at or above this ship free. Whole rupees. */
export const FREE_DELIVERY_FROM = 999;

/** The most a customer pays for courier delivery under the threshold. */
export const COURIER_FEE_CAP = 79;

export type CustomerDelivery = {
  /** What the customer pays in all, whole rupees. */
  total: number;
  /** The own run's share; null when the order has none. */
  ownRun: number | null;
  /** Each courier parcel's share, in the order given. Adds up, with
   *  `ownRun`, to `total` — the order keeps that invariant per shipment. */
  parcels: number[];
  /** True when the goods reached `FREE_DELIVERY_FROM`. */
  free: boolean;
};

/**
 * The customer's delivery charge for one order.
 *
 * `courierCosts` are whole rupees per parcel, as charged by the couriers
 * (already rounded up). The capped courier fee is split across parcels in
 * proportion to what each costs, so an order with a shelf rack from its
 * vendor and seeds from us records a share against each; the rounding
 * remainder goes to the last parcel so the shares add up exactly.
 */
export function customerDelivery(
  goods: number,
  ownRunFee: number | null,
  courierCosts: readonly number[],
): CustomerDelivery {
  if (goods >= FREE_DELIVERY_FROM) {
    return { total: 0, ownRun: ownRunFee === null ? null : 0, parcels: courierCosts.map(() => 0), free: true };
  }
  const cost = courierCosts.reduce((sum, c) => sum + c, 0);
  const fee = Math.min(cost, COURIER_FEE_CAP);
  const parcels = courierCosts.map((c) => (cost === 0 ? 0 : Math.floor((fee * c) / cost)));
  if (parcels.length > 0) parcels[parcels.length - 1] += fee - parcels.reduce((sum, p) => sum + p, 0);
  return { total: (ownRunFee ?? 0) + fee, ownRun: ownRunFee, parcels, free: false };
}

/** Rupees more the customer would need to add for free delivery; 0 once
 *  they have. */
export function shortOfFreeDelivery(goods: number): number {
  return Math.max(0, FREE_DELIVERY_FROM - goods);
}
