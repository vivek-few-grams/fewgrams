import { requireRole } from "@/lib/auth/guard";
import { hasRole } from "@/lib/auth/roles";
import { isOrderId, type Order } from "@/lib/orders/order";
import { getOrder } from "@/lib/repo/orders";

/**
 * The order at `/account/orders/<id>` if the visitor may see it, else null.
 * Shared by the page and the `@aside` slot, which render in the same request
 * and must agree on who may see what.
 *
 * Someone else's order is null — a 404, not a 403, because "forbidden" would
 * confirm the id exists. An admin may open any order.
 */
export async function loadVisibleOrder(id: string): Promise<Order | null> {
  const actor = await requireRole("customer");
  if (!isOrderId(id)) return null;
  const order = await getOrder(id);
  if (!order || (order.userId !== actor.userId && !hasRole(actor.role, "admin"))) return null;
  return order;
}
