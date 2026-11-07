import { advanceOrderStatus } from "@/lib/repo/orders";
import { returnToShelf } from "@/lib/repo/seeds";
import { returnToStock as returnTraysToStock } from "@/lib/repo/trays";
import { returnToStock as returnMediaToStock } from "@/lib/repo/grow-media";
import { canCancelOrder, type Order, type StockTaken } from "./order";
import { stockMoves } from "./stock-moves";

/**
 * Cancel a paid order before it leaves — the owner's call from admin (27 Sep
 * 2026). The money is returned in the gateway's dashboard, not from here;
 * the order is then marked refunded (`canMarkRefunded`).
 *
 * **Puts back what `settleOrder` took off the shelf** (`restock`): seed
 * grams, tray and cocopeat packs, a starter pack's parts included. Only after
 * the status write succeeds, and that write is conditional on the status the
 * operator saw, so two presses at once restock once. Greens and racks hold no
 * stock count. Refused while a parcel is booked (`cancelBlock`). Returns
 * false when nothing was done.
 */
export async function cancelOrder(order: Order): Promise<boolean> {
  if (!canCancelOrder(order)) return false;
  if (!(await advanceOrderStatus(order, order.status, "cancelled"))) return false;

  for (const back of restock(order)) {
    try {
      if (back.amount <= 0) continue;
      if (back.kind === "seed") await returnToShelf(back.key, back.amount);
      else if (back.kind === "tray") await returnTraysToStock(back.key, back.amount);
      else await returnMediaToStock(back.key, back.amount);
    } catch (e) {
      /* The order is cancelled either way; a count left short is fixed by
         hand on the stock screen, as a shortfall at payment is. */
      console.error(`[stock] ${order.id}: could not return ${back.key} to stock`, e);
    }
  }
  return true;
}

/**
 * What a cancel puts back: exactly what payment recorded taking
 * (`stockTaken`). Returning the ordered quantity instead put three blocks
 * back where one came off (31 Oct 2026). An order paid before the record
 * existed falls back to its lines, as it always did.
 */
export function restock(order: Pick<Order, "lines" | "stockTaken">): StockTaken[] {
  if (order.stockTaken) return order.stockTaken;
  return stockMoves(order.lines).map((m) =>
    m.kind === "seed"
      ? { kind: "seed", key: m.key, amount: m.grams }
      : { kind: m.kind, key: m.key, amount: m.units },
  );
}
