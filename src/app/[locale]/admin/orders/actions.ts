"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { cancelOrder as cancel } from "@/lib/orders/cancel";
import { TRACKING_NUMBER, canAdvance, canMarkRefunded, isOrderId } from "@/lib/orders/order";
import { advanceOrderStatus, getOrder, setShipmentTracking } from "@/lib/repo/orders";
import { bookShipment, type BookFailure } from "@/lib/shipping/book";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

const isStatus = (v: string): v is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(v);

/**
 * Move an order one step along SPEC §13. The allowed moves live in
 * `nextStatuses`; this refuses anything else, including every move out of
 * `pending_payment` — only the gateway can pay an order.
 */
export async function advanceOrder(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  const to = String(fd.get("to") ?? "");
  if (!isOrderId(id) || !isStatus(to)) throw new Error("Bad order status request");

  const order = await getOrder(id);
  if (!order) throw new Error(`No order ${id}`);
  if (!canAdvance(order.status, to)) {
    throw new Error(`An order cannot move from ${order.status} to ${to}`);
  }
  /* False means somebody else moved it first; the refreshed page shows
     where it now stands. */
  await advanceOrderStatus(order, order.status, to);

  revalidatePath("/[locale]/admin/orders", "page");
  revalidatePath(`/[locale]/admin/orders/${id}`, "page");
  revalidatePath(`/[locale]/account/orders/${id}`, "page");
}

function revalidateOrder(id: string) {
  revalidatePath("/[locale]/admin/orders", "page");
  revalidatePath(`/[locale]/admin/orders/${id}`, "page");
  revalidatePath(`/[locale]/account/orders/${id}`, "page");
  revalidatePath("/[locale]/account/orders", "page");
}

/**
 * Cancel a paid order that has not left yet, and put its stock back
 * (`cancelOrder`). The refund itself is done in the gateway's dashboard.
 */
export async function cancelOrder(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isOrderId(id)) throw new Error("Bad cancel request");
  const order = await getOrder(id);
  if (!order) throw new Error(`No order ${id}`);
  /* False means it moved on first — out for delivery, or cancelled by a
     second press; the refreshed page shows which. */
  await cancel(order);
  revalidateOrder(id);
}

/**
 * Record that a cancelled or failed order's money has been returned in the
 * gateway's dashboard. Nothing is sent to the gateway from here.
 */
export async function markRefunded(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isOrderId(id)) throw new Error("Bad refund request");
  const order = await getOrder(id);
  if (!order) throw new Error(`No order ${id}`);
  if (!canMarkRefunded(order.status)) {
    throw new Error(`An order cannot be marked refunded from ${order.status}`);
  }
  await advanceOrderStatus(order, order.status, "refunded");
  revalidateOrder(id);
}

/**
 * Record a courier parcel's tracking number, typed from the courier's
 * dashboard once it is booked (booking from here is not built). Blank clears
 * it. The customer's order page shows it from then on (Shipping policy).
 */
export async function setTracking(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  const index = Number(fd.get("index"));
  const raw = String(fd.get("tracking") ?? "").replace(/\s+/g, "");
  if (!isOrderId(id) || !Number.isInteger(index)) throw new Error("Bad tracking request");
  if (raw !== "" && !TRACKING_NUMBER.test(raw)) throw new Error("That is not a tracking number");

  const order = await getOrder(id);
  if (!order) throw new Error(`No order ${id}`);
  if (order.shipments[index]?.method !== "courier")
    throw new Error("Only a courier parcel has a tracking number");
  await setShipmentTracking(order, index, raw === "" ? null : raw);

  revalidatePath(`/[locale]/admin/orders/${id}`, "page");
  revalidatePath(`/[locale]/account/orders/${id}`, "page");
}

export type BookState =
  | { status: "idle" }
  | { status: "booked"; trackingNumber: string; pickupRequested: boolean }
  | { status: "failed"; reason: BookFailure; detail?: string };

/**
 * Book one courier parcel with the courier the customer chose, and ask it to
 * collect on the date picked (`bookShipment`). Spends wallet money; the lock
 * that stops a double booking is in `bookShipment`, not here.
 */
export async function bookParcel(_prev: BookState, fd: FormData): Promise<BookState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  const index = Number(fd.get("index"));
  const pickupDate = String(fd.get("pickupDate") ?? "");
  const retry = fd.get("retry") === "1";
  if (!isOrderId(id) || !Number.isInteger(index) || index < 0) throw new Error("Bad booking request");

  const outcome = await bookShipment(id, index, pickupDate, { retry });
  revalidatePath(`/[locale]/admin/orders/${id}`, "page");
  revalidatePath(`/[locale]/account/orders/${id}`, "page");
  if (!outcome.ok) return { status: "failed", reason: outcome.reason, detail: outcome.detail };
  return {
    status: "booked",
    trackingNumber: outcome.result.trackingNumber,
    pickupRequested: outcome.result.pickupRequested,
  };
}
