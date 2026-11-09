import { randomBytes } from "node:crypto";
import type { CartKind } from "@/lib/cart/cart";
import type { HydratedCart } from "@/lib/cart/server";
import { istDateISO } from "@/lib/delivery-date";
import type { SeedSourcing } from "@/lib/seeds/stock";
import type { PaymentAttempt } from "@/lib/payments";
import type { GatewayName, ProviderOrderStatus } from "@/lib/payments/provider";
import type { Buyer, TaxRow } from "@/lib/tax/order-tax";
import type { GstState } from "@/lib/tax/states";
import type { Address, OrderStatus, PackPart } from "@/lib/types";

/**
 * A one-off order — SPEC §4, §9, §13. Pure logic only; storage is
 * `src/lib/repo/orders.ts`, and the payment handshake is `settle.ts`.
 *
 * **An order is a snapshot, a cart is a wish** (SPEC §4.3, §18.6.1). The cart
 * re-reads names, prices and dates on every request; an order freezes all
 * three at the moment it is placed, so a later price edit or a renamed
 * variety cannot rewrite what somebody paid for.
 */

export type OrderLine = {
  kind: CartKind;
  key: string;
  /** In the locale the customer ordered in. */
  name: string;
  units: number;
  unitPrice: number;
  lineTotal: number;
  /** Null for a kind not sold by weight — see `isWeighed`. */
  grams: number | null;
  /** `YYYY-MM-DD`, IST. */
  readyDate: string;
  /** Seeds only: the promise made at checkout. Stock is re-checked when the
   *  shelf is actually drawn down, at payment. */
  sourcing: SeedSourcing | null;
  /**
   * A starter pack's contents, **per pack**, as they were when it was bought
   * (SPEC §29.5); null on every other kind. What payment draws off the shelf,
   * what a cancellation puts back and what the courier is quoted for — read
   * from here rather than the pack's row today, which admin may have changed.
   */
  parts: PackPart[] | null;
};

/** Where it goes, copied off the address book so that editing an address can
 *  never move an order that is already being picked (SPEC §4). */
export type OrderAddress = Pick<
  Address,
  | "label"
  | "recipient"
  | "phone"
  | "line1"
  | "line2"
  | "landmark"
  | "city"
  | "district"
  | "state"
  | "pincode"
  | "notes"
  | "geo"
>;

export type ShippingQuote = {
  /** The account it is booked on. Older orders are all Delhivery. */
  courier: "delhivery" | "ekart" | "shiprocket" | "velocity";
  /** For Shiprocket or Velocity, the carrier the customer chose
   *  (`Xpressbees`) and the aggregator's id for it, which booking the shipment needs. Absent for a
   *  courier that carries its own parcels, and on older orders. */
  carrier?: string;
  serviceId?: string;
  /** Rupees to the paisa, before rounding up into `deliveryCharge`. */
  quotedTotal: number;
  chargedGrams: number;
  zone: string;
};

/**
 * One parcel of an order — SPEC §7 (the owner, 24 Sep 2026). A supplier hands
 * its parcel straight to the courier, so an order is as many shipments as it
 * has pickups, each booked, dated and charged on its own. Empty on orders
 * placed before then, which carry only `shippingQuote`.
 */
export type OrderShipment = {
  /** The pickup's id (`home` for the owner's own) and, snapshotted, where it
   *  is — booking needs the address as it was when the order was placed. */
  origin: { id: string; name: string; city: string; pincode: string };
  method: "own_run" | "courier";
  /** `lineId`s — `kind:key` — of the order lines in this parcel. */
  lines: string[];
  /** Rupees, whole; the shipments' charges add up to `deliveryCharge`. */
  charge: number;
  /** Null for the own run. */
  quote: ShippingQuote | null;
  /** `YYYY-MM-DD`, IST: when this parcel reaches the customer. */
  deliveryDate: string;
  /** The courier's tracking number, once booked. Null until then, and
   *  always for the own run. */
  trackingNumber: string | null;
  /** Set while a booking is with the courier; see `bookingState`. */
  bookingStartedAt: string | null;
  /** The courier's answer, when booked from admin. Null when not booked, or
   *  when the tracking number was typed in by hand. */
  booking: ShipmentBooking | null;
};

export type ShipmentBooking = {
  bookedAt: string;
  courierRef?: string;
  /** `YYYY-MM-DD`, IST. */
  pickupDate: string;
  pickupRequested: boolean;
  pickupError?: string;
  labelUrl?: string;
};

/**
 * Where one courier parcel stands for booking — 27 Sep 2026.
 *
 * - `unbooked` — can be booked.
 * - `booked` — has a tracking number, from a booking or typed in.
 * - `stuck` — a booking was started and never finished: the courier may or
 *   may not have created the shipment. Check its dashboard before retrying,
 *   or the parcel is booked (and paid for) twice.
 */
export type BookingState = "unbooked" | "booked" | "stuck";

export function bookingState(x: Pick<OrderShipment, "trackingNumber" | "bookingStartedAt">): BookingState {
  if (x.trackingNumber) return "booked";
  return x.bookingStartedAt ? "stuck" : "unbooked";
}

/** Only a finished, not-yet-dispatched order has parcels to book. */
export function canBook(order: Pick<Order, "status">, x: Pick<OrderShipment, "method" | "quote">): boolean {
  return order.status === "ready_for_delivery" && x.method === "courier" && x.quote !== null;
}

/** What a courier tracking number looks like — AWBs are letters, digits and
 *  the odd hyphen. Loose on purpose: it guards against a pasted sentence, not
 *  against one courier's format. */
export const TRACKING_NUMBER = /^[A-Za-z0-9-]{6,40}$/;

export type CreditNote = { number: string; issuedAt: string };

export type Order = {
  id: string;
  userId: string;
  email: string | null;
  status: OrderStatus;
  lines: OrderLine[];
  /** Rupees: the lines plus `deliveryCharge`. What the gateway is asked for
   *  and what `settleOrder` checks the payment against. */
  total: number;
  /** Rupees, whole, included in `total`. 0 on orders placed while delivery
   *  was free (before 23 Sep 2026). */
  deliveryCharge: number;
  /** `own_run` when the greens' run carries any of it, else `courier`;
   *  null on those older orders. The parcels are `shipments`. */
  deliveryMethod: "own_run" | "courier" | null;
  /** The courier quote behind `deliveryCharge` when the order is exactly
   *  one courier parcel; null otherwise, and for the own run. Kept for the
   *  orders placed before `shipments`, which have only this. */
  shippingQuote: ShippingQuote | null;
  /** Every parcel, with its own pickup, courier and date. */
  shipments: OrderShipment[];
  /** `YYYY-MM-DD`, IST: when the last parcel arrives. */
  deliveryDate: string;
  address: OrderAddress;
  locale: string;
  provider: GatewayName;
  providerOrderId: string | null;
  /** Assigned at payment, so an abandoned checkout leaves no gap in the
   *  sequence (SPEC §9.1). Only on orders paid before GST registration;
   *  later ones carry `invoiceNo`. */
  receiptNo: number | null;
  /** `FG/2627/00001`, drawn at payment (SPEC §26.3). */
  invoiceNo: string | null;
  /** The tax inside `total`, in paise — SPEC §26.2. Null on orders placed
   *  before GST registration. */
  tax: TaxRow[] | null;
  /** Where the goods are delivered, for GST. Null when the state could not
   *  be placed (taxed as inter-state) and on orders from before
   *  registration. */
  placeOfSupply: GstState | null;
  /** A business buyer, when a GSTIN was given at checkout. */
  buyer: Buyer | null;
  /** Issued when the order is marked refunded (SPEC §26.3). It reverses the
   *  whole invoice, so its rows are `tax`. */
  creditNote: CreditNote | null;
  paidAt: string | null;
  /** What payment took off the shelf, one entry per `stockMoves` move, in
   *  that order. Null on orders paid before 31 Oct 2026, which a cancel
   *  restocks from the lines as before. */
  stockTaken: StockTaken[] | null;
  /** The after-payment lease (`finishPaidOrder`): set by the payment write,
   *  renewed by a retry that takes over, and `finishedAt` once the invoice,
   *  stock and email are done. Both null on orders paid before 31 Oct 2026. */
  finishingAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** When the gateway stops accepting payment for it. */
  expiresAt: string;
};

/** One stock move as it actually happened — grams for a seed, packs for a
 *  tray or a block. */
export type StockTaken = { kind: "seed" | "tray" | "media"; key: string; amount: number };

/** How long the gateway keeps an order payable. Short, because the delivery
 *  date and the seed promise were worked out when it was created. */
export const PAYMENT_WINDOW_MINUTES = 30;

/** True once the gateway will no longer take payment for this order. */
export function paymentWindowClosed(order: Pick<Order, "expiresAt">, now: Date = new Date()): boolean {
  return Date.parse(order.expiresAt) < now.getTime();
}

/**
 * How long after the window closes an authorisation is still taken. A
 * payment finished in the checkout's last seconds can be authorised by the
 * bank a little after; UPI collect requests can be approved much later.
 */
export const LATE_PAYMENT_GRACE_MINUTES = 15;

/**
 * True when a payment authorised now is too late to take (8 Nov 2026). By
 * then the customer's order page says the time to pay ran out and to place it
 * again, so capturing it charged them for an order they were told was gone —
 * twice, if they had re-ordered. Razorpay orders never expire on their own,
 * so this is the only thing that stops it; the uncaptured authorisation is
 * refunded by the gateway. Orders and subscriptions alike.
 */
export function latePaymentRefused(doc: { expiresAt: string }, now: Date = new Date()): boolean {
  return Date.parse(doc.expiresAt) + LATE_PAYMENT_GRACE_MINUTES * 60_000 < now.getTime();
}

/** Crockford base32: no I, L, O or U, so an id read aloud over the phone
 *  cannot be misheard as another. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `FG` and ten random characters — 50 bits, and inside Cashfree's order id
 *  rule (3–45 characters of letters, digits, `_` and `-`). */
export function newOrderId(bytes: Uint8Array = randomBytes(10)): string {
  let id = "FG";
  for (let i = 0; i < 10; i++) id += ALPHABET[bytes[i] % 32];
  return id;
}

export function isOrderId(raw: string): boolean {
  return /^FG[0-9A-HJKMNP-TV-Z]{10}$/.test(raw);
}

/** `FG-000123`. Receipt numbers are sequential; order ids are not. */
export function formatReceiptNo(n: number): string {
  return `FG-${String(n).padStart(6, "0")}`;
}

/**
 * The number a customer and an operator know a paid order or subscription
 * by: its invoice number, or for one paid before GST registration its
 * receipt number. Null while unpaid.
 */
export function documentNo(x: { invoiceNo: string | null; receiptNo: number | null }): string | null {
  return x.invoiceNo ?? (x.receiptNo !== null ? formatReceiptNo(x.receiptNo) : null);
}

export function linesFromCart(cart: HydratedCart): OrderLine[] {
  return cart.items.map((i) => ({
    kind: i.kind,
    key: i.key,
    name: i.name,
    units: i.units,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
    grams: i.grams,
    readyDate: istDateISO(i.readyDate),
    sourcing: i.sourcing,
    parts: i.pack?.parts ?? null,
  }));
}

export function orderTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

export function addressSnapshot(a: Address): OrderAddress {
  return {
    label: a.label,
    recipient: a.recipient,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    district: a.district,
    state: a.state,
    pincode: a.pincode,
    notes: a.notes,
    geo: a.geo,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The delivery date, moved on by however many IST days passed between
 * placing the order and paying for it.
 *
 * Every rule that produced the date counts from *today* — sown tomorrow, off
 * the shelf tomorrow, the supplier's lead time from today — so an order
 * opened at 23:50 and paid at 00:10 is a day later for all of them alike.
 * Without this it would be promised a day nobody can meet.
 */
export function shiftForPaymentDay(deliveryDate: string, createdAt: Date, paidAt: Date): string {
  const days = Math.round((Date.parse(istDateISO(paidAt)) - Date.parse(istDateISO(createdAt))) / DAY_MS);
  if (days <= 0) return deliveryDate;
  return new Date(Date.parse(deliveryDate) + days * DAY_MS).toISOString().slice(0, 10);
}

export type Settlement =
  | { action: "none" }
  | { action: "pay"; attempt: PaymentAttempt }
  /** The gateway reports a success for a different amount than we asked
   *  for. Cannot happen for an order this server created, so it is recorded
   *  and left for a person rather than resolved in either direction. */
  | { action: "mismatch"; attempt: PaymentAttempt };

/**
 * What the gateway's view of an order means for ours.
 *
 * Two independent conditions, both from a server-to-server fetch: the
 * gateway calls the order `PAID`, **and** one of its attempts succeeded for
 * exactly our total in rupees. Either alone is not enough.
 *
 * Only a `pending_payment` order can become paid, which is half of what
 * makes a replayed webhook harmless — the other half is the conditional
 * write in `markOrderPaid`, which settles the race between the webhook and
 * the return page arriving together.
 */
export function settlementFor(
  /* Any payable record — an order, or a subscription (`FS…`), which has
     statuses of its own but starts from the same `pending_payment`. */
  order: Pick<Order, "id" | "total"> & { status: string },
  gateway: { status: ProviderOrderStatus; attempts: PaymentAttempt[] },
): Settlement {
  if (order.status !== "pending_payment" || gateway.status !== "paid") return { action: "none" };
  const { attempts } = gateway;
  const successes = attempts.filter((a) => a.orderId === order.id && a.status === "success");
  const exact = successes.find((a) => a.amount === order.total && a.currency === "INR");
  if (exact) return { action: "pay", attempt: exact };
  if (successes[0]) return { action: "mismatch", attempt: successes[0] };
  return { action: "none" };
}

/**
 * Where an operator may move an order next (SPEC §13) — the forward path,
 * one button per move on the board. Cancelling and refunding sit apart
 * (`canCancel`, `canMarkRefunded`): they are offered on the order page only,
 * behind a confirmation, never as a one-press step on a card.
 */
const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["picked"],
  picked: ["ready_for_delivery"],
  ready_for_delivery: ["out_for_delivery"],
  out_for_delivery: ["delivered", "failed"],
};

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return NEXT[from] ?? [];
}

export function canAdvance(from: OrderStatus, to: OrderStatus): boolean {
  return nextStatuses(from).includes(to);
}

/**
 * Statuses an operator may cancel from: paid, but not yet with the courier or
 * the delivery run. Past that the order is `delivered` or `failed`.
 */
const CANCELLABLE: readonly OrderStatus[] = ["paid", "picked", "ready_for_delivery"];

export function canCancel(from: OrderStatus): boolean {
  return CANCELLABLE.includes(from);
}

/**
 * Why an order in a cancellable status still cannot be cancelled: a parcel
 * is with a courier (a tracking number) or being booked right now. A booked
 * parcel can be collected while the order still reads "ready for delivery"
 * (moving it on is a manual step), and cancelling then put its stock back
 * while the goods were on a van (31 Oct 2026). The owner cancels the
 * shipment in the courier's dashboard and clears the tracking number first.
 */
export function cancelBlock(
  order: Pick<Order, "shipments"> & Partial<Pick<Order, "finishingAt" | "finishedAt">>,
  now: Date = new Date(),
): "booked" | "booking" | "finishing" | null {
  /* The after-payment work — invoice, stock, email — has not finished (8 Nov
     2026). Cancelling then put back only what it had taken so far, and a
     retry that finished later took the rest off the shelf for an order that
     no longer existed. `isUnfinished` says how it gets finished. */
  if (isUnfinished(order)) return "finishing";
  if (order.shipments.some((x) => x.trackingNumber)) return "booked";
  /* Only a booking still in flight. One older than that is "stuck"
     (`bookingState`) — the page already says to check the courier's
     dashboard — and blocking on it would leave the order uncancellable for
     good, since clearing a tracking number typed over it makes it stuck again. */
  const inFlight = (x: Order["shipments"][number]) =>
    x.bookingStartedAt !== null && now.getTime() - Date.parse(x.bookingStartedAt) < BOOKING_IN_FLIGHT_MS;
  if (order.shipments.some(inFlight)) return "booking";
  return null;
}

/** A courier booking call takes seconds; past this it has died. */
export const BOOKING_IN_FLIGHT_MS = 5 * 60 * 1000;

/**
 * Paid, and its after-payment work (invoice, stock, email) started but never
 * finished — the run died part-way. A webhook retry finishes it once the
 * lease is stale (`settleOrder`), and the admin order page offers to. Orders
 * paid before the lease existed (31 Oct 2026) carry neither field and are
 * never unfinished.
 */
export function isUnfinished(order: Partial<Pick<Order, "finishingAt" | "finishedAt">>): boolean {
  return Boolean(order.finishingAt) && !order.finishedAt;
}

/** Cancellable now: the status allows it, no parcel is booked and payment's
 *  own work is done. */
export function canCancelOrder(
  order: Pick<Order, "status" | "shipments"> & Partial<Pick<Order, "finishingAt" | "finishedAt">>,
  now: Date = new Date(),
): boolean {
  return canCancel(order.status) && cancelBlock(order, now) === null;
}

/**
 * The money goes back in the gateway's own dashboard (the owner, 27 Sep
 * 2026) — nothing here calls a refund API. Marking it records that it was
 * done, so the customer's order page says "Refunded" rather than leaving
 * them to wonder.
 */
const REFUNDABLE: readonly OrderStatus[] = ["cancelled", "failed"];

export function canMarkRefunded(from: OrderStatus): boolean {
  return REFUNDABLE.includes(from);
}
