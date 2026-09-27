import { istDateISO } from "@/lib/delivery-date";
import { bookingState, canBook, type Order, type OrderShipment } from "@/lib/orders/order";
import { getOrder, replaceShipment } from "@/lib/repo/orders";
import { allOrigins, getShippingSettings } from "@/lib/repo/shipping";
import { shippingProviders } from "./index";
import type { BookingInput, BookingResult } from "./provider";
import { boxForGrams } from "./weight";

/**
 * Book one courier parcel from the admin order page — the owner, 27 Sep 2026.
 * The parcel goes to the courier the customer chose at checkout (its
 * `quote`), which creates the shipment and is asked to collect it on
 * `pickupDate`.
 *
 * **This spends wallet money, so it is locked.** Before the courier is
 * called, the parcel is marked `bookingStartedAt` with a write conditional on
 * the order being unchanged since it was read (`replaceShipment`); a second
 * press loses that race and never reaches the courier. If the courier
 * refuses, the mark is cleared and the operator may try again. If the process
 * dies between the courier's answer and our write, the mark stays and the
 * parcel reads `stuck` — the courier may hold a shipment we never recorded,
 * so the screen says to check its dashboard before booking again.
 */

export type BookFailure =
  | "disabled"
  | "notBookable"
  | "alreadyBooked"
  | "stuck"
  | "raced"
  | "noCourier"
  | "noPickup"
  | "badDate"
  | "courier";

export type BookOutcome =
  | { ok: true; result: BookingResult }
  | { ok: false; reason: BookFailure; detail?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Booking is off unless the server says `COURIER_BOOKING=on`. Ekart and
 * Shiprocket have no test system, so the credentials that quote in local
 * development are live ones — without this switch, one click on a dev
 * server's admin page would create a real shipment and spend real money.
 */
export function bookingEnabled(): boolean {
  return process.env.COURIER_BOOKING === "on";
}

/** `FGABC…` for an order's first parcel, `FGABC…-2` for its second — unique
 *  per parcel, and the same on a retry so a courier can refuse a repeat. */
export function parcelReference(orderId: string, index: number): string {
  return index === 0 ? orderId : `${orderId}-${index + 1}`;
}

/** The courier's view of one parcel of `order`. Pure, for the tests. */
export function bookingInput(
  order: Order,
  index: number,
  pickup: BookingInput["pickup"],
  pickupDate: string,
): BookingInput {
  const x = order.shipments[index];
  if (!x?.quote) throw new Error(`Parcel ${index} of ${order.id} has no courier quote`);
  const lines = order.lines.filter((l) => x.lines.includes(`${l.kind}:${l.key}`));
  const a = order.address;
  return {
    reference: parcelReference(order.id, index),
    orderDate: order.paidAt ?? order.createdAt,
    pickup,
    drop: {
      name: a.recipient,
      phone: a.phone,
      email: order.email,
      line1: a.line1,
      ...(a.line2 ? { line2: a.line2 } : {}),
      ...(a.landmark ? { landmark: a.landmark } : {}),
      /* `city` only on addresses saved before 23 Sep 2026; district since. */
      city: a.district ?? a.city ?? "",
      state: a.state ?? "",
      pincode: a.pincode,
    },
    items: lines.map((l) => ({
      name: l.name,
      sku: `${l.kind}:${l.key}`,
      units: l.units,
      unitPrice: l.unitPrice,
    })),
    value: lines.reduce((n, l) => n + l.lineTotal, 0),
    grams: x.quote.chargedGrams,
    box: boxForGrams(x.quote.chargedGrams),
    speed: "surface",
    serviceId: x.quote.serviceId ?? null,
    pickupDate,
  };
}

/**
 * Book parcel `index` of order `orderId`. `retry` books a `stuck` parcel
 * again, and is only offered once the operator has been told to check the
 * courier's dashboard first.
 */
export async function bookShipment(
  orderId: string,
  index: number,
  pickupDate: string,
  opts: { retry?: boolean; now?: Date } = {},
): Promise<BookOutcome> {
  const now = opts.now ?? new Date();
  if (!bookingEnabled()) return { ok: false, reason: "disabled" };
  if (!ISO_DATE.test(pickupDate) || pickupDate < istDateISO(now)) return { ok: false, reason: "badDate" };

  const order = await getOrder(orderId);
  const x = order?.shipments[index];
  if (!order || !x || !canBook(order, x)) return { ok: false, reason: "notBookable" };
  const state = bookingState(x);
  if (state === "booked") return { ok: false, reason: "alreadyBooked" };
  if (state === "stuck" && !opts.retry) return { ok: false, reason: "stuck" };

  const provider = shippingProviders().find((p) => p.name === x.quote!.courier);
  if (!provider) return { ok: false, reason: "noCourier" };

  const settings = await getShippingSettings();
  const origin = settings && allOrigins(settings).find((o) => o.id === x.origin.id);
  if (!origin) return { ok: false, reason: "noPickup" };
  const input = bookingInput(order, index, origin, pickupDate);

  const locked = await replaceShipment(order, index, { ...x, bookingStartedAt: now.toISOString() });
  if (!locked) return { ok: false, reason: "raced" };

  let result: BookingResult;
  try {
    result = await provider.book(input);
  } catch (e) {
    /* No shipment was created (the adapter's contract), so release the lock
       for a retry. A release that itself loses a race leaves the parcel
       `stuck`, which is the safe side. */
    await replaceShipment(locked, index, { ...x, bookingStartedAt: null });
    return { ok: false, reason: "courier", detail: e instanceof Error ? e.message : String(e) };
  }

  const booked: OrderShipment = {
    ...x,
    trackingNumber: result.trackingNumber,
    bookingStartedAt: null,
    booking: {
      bookedAt: new Date().toISOString(),
      pickupDate,
      pickupRequested: result.pickupRequested,
      ...(result.courierRef ? { courierRef: result.courierRef } : {}),
      ...(result.pickupError ? { pickupError: result.pickupError.slice(0, 500) } : {}),
      ...(result.labelUrl ? { labelUrl: result.labelUrl } : {}),
    },
  };
  /* The courier has the shipment now, so this write must land. Nothing else
     should have written the order meanwhile, but if something did, re-read
     and write over it rather than lose the tracking number. */
  let current: Order | null = locked;
  for (let attempt = 0; attempt < 3 && current; attempt++) {
    if (await replaceShipment(current, index, booked)) return { ok: true, result };
    current = await getOrder(orderId);
  }
  console.error(
    `[shipping] ${orderId} parcel ${index}: booked with ${provider.name} as ${result.trackingNumber} but not recorded`,
  );
  return { ok: true, result };
}
