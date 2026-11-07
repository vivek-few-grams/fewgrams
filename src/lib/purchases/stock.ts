import { returnToStock as addMedia, takeFromStock as takeMedia } from "@/lib/repo/grow-media";
import { returnToShelf as addSeed, takeFromShelf as takeSeed } from "@/lib/repo/seeds";
import { returnToStock as addTrays, takeFromStock as takeTrays } from "@/lib/repo/trays";
import type { StockKind } from "./bill";

/**
 * Put a stock change on the shelf — a bill's (SPEC §26.6; the owner, 17 Oct
 * 2026: a purchase adds to stock) or a sowing's seed (§26.6.2). `change` is
 * `kind:key` → units to add, negative to take: `stockChange(before, after)`
 * for a bill.
 *
 * Additions are atomic `ADD`s, the same calls a cancelled order uses to put
 * stock back. A reduction — a bill corrected down or deleted, seed sown —
 * takes off what is there and never goes below zero; if part of it has
 * already been sold, the shortfall is returned so the screen can say so, and
 * the count is put right by hand on the stock screen, as a short shelf at
 * payment is.
 *
 * **All or nothing.** The rows are moved one at a time, so a throw part-way
 * would leave some moved and some not — and the caller's record (the bill,
 * the sowing) unable to say which, so that saving again worked out a change
 * of nothing. Instead, what was already moved is put back before the error is
 * passed on, and the caller can leave its record as it was. Only a failure
 * *while putting back* leaves the shelf part-moved; that is logged per row,
 * for a stocktake.
 */
const ADD: Record<StockKind, (key: string, n: number) => Promise<void>> = {
  tray: addTrays,
  media: addMedia,
  seed: addSeed,
};
const TAKE: Record<StockKind, (key: string, n: number) => Promise<number>> = {
  tray: takeTrays,
  media: takeMedia,
  seed: takeSeed,
};

export type StockShortfall = { kind: StockKind; key: string; short: number };

export type StockMoved = {
  /** What actually moved, per `kind:key` — positive put on, negative taken
   *  off. A reduction can move less than asked; see `short`. */
  moved: Map<string, number>;
  short: StockShortfall[];
};

const parse = (id: string) => id.split(":") as [StockKind, string];

export async function applyStockChange(change: Map<string, number>): Promise<StockMoved> {
  const moved = new Map<string, number>();
  const short: StockShortfall[] = [];
  try {
    for (const [id, delta] of change) {
      const [kind, key] = parse(id);
      if (delta > 0) {
        await ADD[kind](key, delta);
        moved.set(id, delta);
      } else if (delta < 0) {
        const taken = await TAKE[kind](key, -delta);
        if (taken > 0) moved.set(id, -taken);
        if (taken < -delta) short.push({ kind, key, short: -delta - taken });
      }
    }
  } catch (e) {
    await undoStockChange(moved);
    throw e;
  }
  return { moved, short };
}

/**
 * Reverse what `applyStockChange` moved — for a record whose own write was
 * then refused or failed. Best effort: a row that cannot be put back (sold in
 * the meantime, or the write fails) is logged and the rest still are.
 */
export async function undoStockChange(moved: Map<string, number>): Promise<void> {
  for (const [id, delta] of [...moved].reverse()) {
    const [kind, key] = parse(id);
    try {
      if (delta < 0) await ADD[kind](key, -delta);
      else if (delta > 0) {
        const taken = await TAKE[kind](key, delta);
        if (taken < delta) {
          console.warn(
            `[stock] ${id}: ${delta - taken} short when undoing a change — count it on the stock screen`,
          );
        }
      }
    } catch (e) {
      console.error(`[stock] ${id}: could not undo a change of ${delta} — count it on the stock screen`, e);
    }
  }
}
