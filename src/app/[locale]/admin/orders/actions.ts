"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { TRACKING_NUMBER, canAdvance, isOrderId } from "@/lib/orders/order";
import { advanceOrderStatus, getOrder, setShipmentTracking } from "@/lib/repo/orders";
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
  if (order.shipments[index]?.method !== "courier") throw new Error("Only a courier parcel has a tracking number");
  await setShipmentTracking(order, index, raw === "" ? null : raw);

  revalidatePath(`/[locale]/admin/orders/${id}`, "page");
  revalidatePath(`/[locale]/account/orders/${id}`, "page");
}
