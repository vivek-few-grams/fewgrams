import { returnToStock as addMedia, takeFromStock as takeMedia } from "@/lib/repo/grow-media";
import { returnToShelf as addSeed, takeFromShelf as takeSeed } from "@/lib/repo/seeds";
import { returnToStock as addTrays, takeFromStock as takeTrays } from "@/lib/repo/trays";
import type { StockKind } from "./bill";

/**
 * Put a bill's stock change on the shelf — SPEC §26.6 (the owner, 17 Oct
 * 2026: a purchase adds to stock). `change` is `stockChange(before, after)`.
 *
 * Additions are atomic `ADD`s, the same calls a cancelled order uses to put
 * stock back. A reduction — a bill corrected down or deleted — takes off
 * what is there and never goes below zero; if part of it has already been
 * sold, the shortfall is returned so the screen can say so, and the count
 * is put right by hand on the stock screen, as a short shelf at payment is.
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

export async function applyStockChange(change: Map<string, number>): Promise<StockShortfall[]> {
  const short: StockShortfall[] = [];
  for (const [id, delta] of change) {
    const [kind, key] = id.split(":") as [StockKind, string];
    if (delta > 0) await ADD[kind](key, delta);
    else {
      const taken = await TAKE[kind](key, -delta);
      if (taken < -delta) short.push({ kind, key, short: -delta - taken });
    }
  }
  return short;
}
