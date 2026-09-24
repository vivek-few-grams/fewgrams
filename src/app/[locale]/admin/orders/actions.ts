"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { canAdvance, isOrderId } from "@/lib/orders/order";
import { advanceOrderStatus, getOrder } from "@/lib/repo/orders";
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
