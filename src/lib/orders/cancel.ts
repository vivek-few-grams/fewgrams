import { advanceOrderStatus } from "@/lib/repo/orders";
import { returnToShelf } from "@/lib/repo/seeds";
import { returnToStock as returnTraysToStock } from "@/lib/repo/trays";
import { returnToStock as returnMediaToStock } from "@/lib/repo/grow-media";
import { canCancel, type Order } from "./order";
import { stockMoves } from "./stock-moves";

/**
 * Cancel a paid order before it leaves — the owner's call from admin (27 Sep
 * 2026). The money is returned in the gateway's dashboard, not from here;
 * the order is then marked refunded (`canMarkRefunded`).
 *
 * **Puts back what `settleOrder` took off the shelf**: seed grams, tray and
 * cocopeat packs, a starter pack's parts included (`stockMoves`). Only after the status write succeeds, and that write is
 * conditional on the status the operator saw, so two presses at once restock
 * once. Greens and racks hold no stock count. Returns false when the order
 * had already moved and nothing was done.
 */
export async function cancelOrder(order: Order): Promise<boolean> {
  if (!canCancel(order.status)) return false;
  if (!(await advanceOrderStatus(order, order.status, "cancelled"))) return false;

  for (const move of stockMoves(order.lines)) {
    try {
      if (move.kind === "seed") await returnToShelf(move.key, move.grams);
      else if (move.kind === "tray") await returnTraysToStock(move.key, move.units);
      else await returnMediaToStock(move.key, move.units);
    } catch (e) {
      /* The order is cancelled either way; a count left short is fixed by
         hand on the stock screen, as a shortfall at payment is. */
      console.error(`[stock] ${order.id}: could not return ${move.key} to stock`, e);
    }
  }
  return true;
}
