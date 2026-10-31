import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import type { OrderLine } from "./order";

/**
 * What an order takes off the shelf — seed grams, tray and cocopeat packs —
 * as one list, so payment (`settleOrder`) and cancellation (`cancelOrder`)
 * cannot disagree about it.
 *
 * Extracted when starter packs arrived (SPEC §29.5): a pack line is one line
 * but holds a tray stack, a block and 100 g of each seed chosen, frozen on the
 * line as `parts`. Two loops each unpacking that themselves was two places to
 * get a pack's seeds wrong. Greens and racks hold no count and move nothing.
 */
export type StockMove =
  { kind: "seed"; key: string; grams: number } | { kind: "tray" | "media"; key: string; units: number };

export function stockMoves(lines: readonly OrderLine[]): StockMove[] {
  return lines.flatMap((line): StockMove[] => {
    switch (line.kind) {
      case "seed":
        return line.grams !== null ? [{ kind: "seed", key: line.key, grams: line.grams }] : [];
      case "tray":
      case "media":
        return [{ kind: line.kind, key: line.key, units: line.units }];
      case "pack":
        return (line.parts ?? []).flatMap((p): StockMove[] => {
          const units = p.units * line.units;
          if (p.kind === "seed") return [{ kind: "seed", key: p.key, grams: units * GRAMS_PER_UNIT }];
          if (p.kind === "tray" || p.kind === "media") return [{ kind: p.kind, key: p.key, units }];
          return [];
        });
      case "variety":
      case "rack":
        return [];
      default: {
        const never: never = line.kind;
        throw new Error(`No stock rule for kind ${String(never)}`);
      }
    }
  });
}
