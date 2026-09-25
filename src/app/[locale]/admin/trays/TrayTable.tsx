"use client";

import type { Tray } from "@/lib/types";
import { StockTable } from "../StockTable";
import { removeTray, toggleTrayActive, updateTray } from "./actions";

/**
 * Trays and drainage cells — price, packs held and courier packing, one row
 * per item with one Save. The table itself is `StockTable`, shared with grow
 * media.
 */
export function TrayTable({ trays }: { trays: Array<{ tray: Tray; name: string | null }> }) {
  return (
    <StockTable
      namespace="admin.trays"
      items={trays.map(({ tray, name }) => ({ item: tray, name }))}
      actions={{ update: updateTray, toggle: toggleTrayActive, remove: removeTray }}
    />
  );
}
