"use client";

import type { GrowMedium } from "@/lib/types";
import { StockTable } from "../StockTable";
import { removeGrowMedium, toggleGrowMediumActive, updateGrowMedium } from "./actions";

/**
 * Grow media — price, blocks held and courier packing, one row per item
 * with one Save. The table itself is `StockTable`, shared with trays.
 */
export function GrowMediumTable({ media }: { media: Array<{ medium: GrowMedium; name: string | null }> }) {
  return (
    <StockTable
      namespace="admin.growMedia"
      items={media.map(({ medium, name }) => ({ item: medium, name }))}
      actions={{ update: updateGrowMedium, toggle: toggleGrowMediumActive, remove: removeGrowMedium }}
    />
  );
}
