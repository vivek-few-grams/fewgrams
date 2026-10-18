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
    picker: { supplyKey: string; vendors: VendorChoice[]; selected: string[] };
  }>;
}) {
  return (
    <StockTable
      namespace="admin.trays"
      items={trays.map(({ tray, name, bills, picker }) => ({ item: tray, name, bills, picker }))}
      actions={{
        update: updateTray,
        correct: correctTrayStock,
        toggle: toggleTrayActive,
        remove: removeTray,
      }}
    />
  );
}
