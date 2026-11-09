"use client";

import type { Tray } from "@/lib/types";
import type { VendorChoice } from "../vendors/SupplierPicker";
import { StockTable } from "../StockTable";
import { correctTrayStock, removeTray, toggleTrayActive, updateTray } from "./actions";

/**
 * Trays and drainage cells — cost, margin, packs held and courier packing,
 * one row per item with one Save. The table itself is `StockTable`, shared with grow
 * media.
 */
export function TrayTable({
  trays,
}: {
  trays: Array<{
    tray: Tray;
    name: string | null;
    /** Bills that name it — none, and it can be deleted. */
    bills: number;
    /** Held for paid orders still here (`heldForOrders`), for the stocktake. */
    held: number;
    picker: { supplyKey: string; vendors: VendorChoice[]; selected: string[] };
  }>;
}) {
  return (
    <StockTable
      namespace="admin.trays"
      items={trays.map(({ tray, name, bills, held, picker }) => ({ item: tray, name, bills, held, picker }))}
      actions={{
        update: updateTray,
        correct: correctTrayStock,
        toggle: toggleTrayActive,
        remove: removeTray,
      }}
    />
  );
}
