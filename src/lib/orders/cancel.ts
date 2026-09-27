import { advanceOrderStatus } from "@/lib/repo/orders";
import { returnToShelf } from "@/lib/repo/seeds";
import { returnToStock as returnTraysToStock } from "@/lib/repo/trays";
import { returnToStock as returnMediaToStock } from "@/lib/repo/grow-media";
import { canCancel, type Order } from "./order";

/**
 * Cancel a paid order before it leaves — the owner's call from admin (27 Sep
 * 2026). The money is returned in the gateway's dashboard, not from here;
 * the order is then marked refunded (`canMarkRefunded`).
 *
 * **Puts back what `settleOrder` took off the shelf**: seed grams, tray and
 * cocopeat packs. Only after the status write succeeds, and that write is
 * conditional on the status the operator saw, so two presses at once restock
 * once. Greens and racks hold no stock count. Returns false when the order
 * had already moved and nothing was done.
 */
export async function cancelOrder(order: Order): Promise<boolean> {
  if (!canCancel(order.status)) return false;
  if (!(await advanceOrderStatus(order, order.status, "cancelled"))) return false;

  for (const line of order.lines) {
    try {
      if (line.kind === "seed" && line.grams !== null) {
        await returnToShelf(line.key, line.grams);
      } else if (line.kind === "tray") {
        await returnTraysToStock(line.key, line.units);
      } else if (line.kind === "media") {
        await returnMediaToStock(line.key, line.units);
      }
    } catch (e) {
      /* The order is cancelled either way; a count left short is fixed by
         hand on the stock screen, as a shortfall at payment is. */
      console.error(`[stock] ${order.id}: could not return ${line.key} to stock`, e);
    }
  }
  return true;
}
