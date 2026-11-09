import { GRAMS_PER_UNIT, lineId, type CartKind } from "./cart";
import type { PackPart } from "@/lib/types";
import { roundGrams } from "@/lib/seeds/stock";

/**
 * Which cart lines ask for more seed than the shelf holds — and, when a
 * starter pack shares the shortage, **which line the customer can fix**.
 *
 * Pure, so it is tested without a catalogue; `hydrateCart` hands it the
 * hydrated lines and the seed rows it already read.
 */

/** The parts of a hydrated line this needs. */
export type StockLine = {
  kind: CartKind;
  key: string;
  units: number;
  maxUnits: number;
  grams: number | null;
  pack?: { parts: readonly PackPart[] };
};

/** A seed row: what is held, and the name to say it by. */
export type ShelfSeed = { contentKey: string; stockGrams: number; name: string };

export type OverStock = {
  /** `lineId`s to highlight. Checkout refuses while any is listed. */
  lines: string[];
  /**
   * For a highlighted line whose shortage is a seed a starter pack draws on,
   * the names of the seeds that are short — so the cart can say *which* seed,
   * rather than flag a pack of eight things with "we have less than this".
   * Keyed by `lineId`; every key is also in `lines`.
   *
   * Not set on a seed line that is over the shelf **on its own**: that line's
   * own message is the accurate one. Never says how much is held.
   */
  seeds: Record<string, string[]>;
};

/**
 * Per line as before — a seed line past its 100 g units, a pack past the
 * scarcest of its seeds — and then **across lines for one seed**: a pack holds
 * 100 g of each seed it was filled with, so a separate spinach line and a pack
 * with spinach in it draw on the same shelf.
 *
 * When the two together want more than is held, **the seed line is flagged**,
 * not the pack (the audit, 31 Oct 2026: a pack at quantity 1 was marked
 * "reduce it" while the line that had to go was the 100 g of spinach beside
 * it). Reducing or removing the seed line is the change that fixes it, and it
 * is the smaller one. Only when the packs alone want more than is held — two
 * packs with spinach in them, say — would removing the seed line not be
 * enough, and then the packs are flagged instead.
 */
export function overStockLines(items: readonly StockLine[], seeds: readonly ShelfSeed[]): OverStock {
  const over = new Set(items.filter((i) => i.units > i.maxUnits).map(lineId));
  const named = new Map<string, Set<string>>();
  const packs = items.filter((i) => i.pack);
  if (packs.length === 0) return { lines: [...over], seeds: {} };

  const held = new Map(seeds.map((s) => [s.contentKey, roundGrams(s.stockGrams)]));
  const nameOf = new Map(seeds.map((s) => [s.contentKey, s.name]));
  const add = (into: Map<string, number>, key: string, grams: number) =>
    into.set(key, (into.get(key) ?? 0) + grams);

  /* The packs' grams and the seed lines' grams apart, because which line to
     flag depends on whether the packs fit on their own. */
  const inPacks = new Map<string, number>();
  const inLines = new Map<string, number>();
  for (const i of items) {
    if (i.kind === "seed" && i.grams !== null) add(inLines, i.key, i.grams);
    for (const part of i.pack?.parts ?? []) {
      if (part.kind === "seed") add(inPacks, part.key, part.units * i.units * GRAMS_PER_UNIT);
    }
  }

  const flag = (line: StockLine, seed: string) => {
    const id = lineId(line);
    over.add(id);
    named.set(id, (named.get(id) ?? new Set()).add(seed));
  };

  for (const [seed, packGrams] of inPacks) {
    /* A seed with no row is not on sale, and the pack is already unavailable
       for it; nothing to measure here. */
    const stock = held.get(seed) ?? Infinity;
    if (packGrams + (inLines.get(seed) ?? 0) <= stock) continue;

    const line = items.find((i) => i.kind === "seed" && i.key === seed);
    if (line && packGrams <= stock) {
      flag(line, seed);
    } else {
      for (const p of packs) {
        if (p.pack!.parts.some((part) => part.kind === "seed" && part.key === seed)) flag(p, seed);
      }
    }
  }

  const names: Record<string, string[]> = {};
  for (const item of items) {
    const id = lineId(item);
    const short = named.get(id);
    /* A seed line over the shelf by itself keeps its own message. */
    if (!short || (item.kind === "seed" && item.units > item.maxUnits)) continue;
    names[id] = [...short].map((key) => nameOf.get(key) ?? key);
  }
  return { lines: [...over], seeds: names };
}
