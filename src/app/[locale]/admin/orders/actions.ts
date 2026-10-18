"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { cancelOrder as cancel } from "@/lib/orders/cancel";
import { markOrderRefunded } from "@/lib/orders/refund";
import { TRACKING_NUMBER, canAdvance, canMarkRefunded, isOrderId } from "@/lib/orders/order";
import { advanceOrderStatus, getOrder, setPlaceOfSupply, setShipmentTracking } from "@/lib/repo/orders";
import { listFilings } from "@/lib/repo/gst";
import { monthOf, quarterOf } from "@/lib/gst/period";
import { HOME_STATE, gstStateByCode } from "@/lib/tax/states";
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
 * gateway's dashboard, and issue its credit note (`markOrderRefunded`).
 * Nothing is sent to the gateway from here.
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
  /* Issues the credit note too (SPEC §26.3). False means a second press got
     there first; the refreshed page shows the one note it issued. */
  await markOrderRefunded(order);
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

/**
 * Name the state of a paid order whose address checkout could not place
 * (SPEC §26.2) — GSTR-1 needs a place of supply for every sale. Never
 * Karnataka: an order is placed in Karnataka by its PIN, so one left
 * unplaced is delivered elsewhere and its tax is already IGST. Refused once
 * the quarter's GSTR-1 is marked filed.
 */
export async function setOrderPlaceOfSupply(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isOrderId(id)) throw new Error("Bad request");
  const order = await getOrder(id);
  if (!order || !order.tax || !order.paidAt || order.placeOfSupply) throw new Error("Nothing to set");
  const state = gstStateByCode(String(fd.get("state") ?? ""));
  if (!state || state.code === HOME_STATE.code) throw new Error("Pick a state outside Karnataka");
  const filed = (await listFilings()).find((f) => f.quarter === quarterOf(monthOf(order.paidAt!)));
  if (filed?.gstr1) throw new Error("That quarter's GSTR-1 is filed");
  await setPlaceOfSupply(id, state);
  revalidateOrder(id);
  revalidatePath("/[locale]/admin/gst", "page");
}
