"use client";

import type { GrowMedium } from "@/lib/types";
import type { VendorChoice } from "../vendors/SupplierPicker";
import { StockTable } from "../StockTable";
import {
  correctGrowMediumStock,
  removeGrowMedium,
  toggleGrowMediumActive,
  updateGrowMedium,
} from "./actions";

/**
 * Grow media — price, blocks held and courier packing, one row per item
 * with one Save. The table itself is `StockTable`, shared with trays.
 */
export function GrowMediumTable({
  media,
}: {
  media: Array<{
    medium: GrowMedium;
    name: string | null;
    /** Bills that name it — none, and it can be deleted. */
    bills: number;
    picker: { supplyKey: string; vendors: VendorChoice[]; selected: string[] };
  }>;
}) {
  return (
    <StockTable
      namespace="admin.growMedia"
      items={media.map(({ medium, name, bills, picker }) => ({ item: medium, name, bills, picker }))}
      actions={{
        update: updateGrowMedium,
        correct: correctGrowMediumStock,
        toggle: toggleGrowMediumActive,
        remove: removeGrowMedium,
      }}
    />
  );
}
