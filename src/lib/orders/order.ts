import { randomBytes } from "node:crypto";
import type { CartKind } from "@/lib/cart/cart";
import type { HydratedCart } from "@/lib/cart/server";
import { istDateISO } from "@/lib/delivery-date";
import type { SeedSourcing } from "@/lib/seeds/stock";
import type { PaymentAttempt } from "@/lib/payments";
import type { ProviderOrderStatus } from "@/lib/payments/provider";
import type { Address, OrderStatus } from "@/lib/types";

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
  courier: "delhivery" | "ekart" | "shiprocket";
  /** For Shiprocket, the carrier the customer chose (`Xpressbees`) and
   *  Shiprocket's id for it, which booking the shipment needs. Absent for a
   *  courier that carries its own parcels, and on older orders. */
  carrier?: string;
  serviceId?: string;
  /** Rupees to the paisa, before rounding up into `deliveryCharge`. */
  quotedTotal: number;
  chargedGrams: number;
  zone: string;
};

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
  /** The owner's own same-day run (anything with greens) or the courier;
   *  null on those older orders. */
  deliveryMethod: "own_run" | "courier" | null;
  /** The courier quote behind `deliveryCharge`; null for the own run, whose
   *  fee is fixed, and on older orders. */
  shippingQuote: ShippingQuote | null;
  /** `YYYY-MM-DD`, IST: one trip, on the slowest line's date. */
  deliveryDate: string;
  address: OrderAddress;
  locale: string;
  provider: "cashfree";
  providerOrderId: string | null;
  /** Assigned at payment, so an abandoned checkout leaves no gap in the
   *  sequence (SPEC §9.1). */
  receiptNo: number | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** When the gateway stops accepting payment for it. */
  expiresAt: string;
};

/** How long the gateway keeps an order payable. Short, because the delivery
 *  date and the seed promise were worked out when it was created. */
export const PAYMENT_WINDOW_MINUTES = 30;

/** True once the gateway will no longer take payment for this order. */
export function paymentWindowClosed(order: Pick<Order, "expiresAt">, now: Date = new Date()): boolean {
  return Date.parse(order.expiresAt) < now.getTime();
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
  const days = Math.round(
    (Date.parse(istDateISO(paidAt)) - Date.parse(istDateISO(createdAt))) / DAY_MS,
  );
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
  order: Pick<Order, "id" | "status" | "total">,
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
 * Where an operator may move an order next (SPEC §13).
 *
 * `refunded` is not offered: refunds go through the gateway and are not
 * wired up yet, and a status that says "refunded" with no refund behind it
 * is worse than no button.
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
