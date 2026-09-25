/**
 * Grow media are held and dated exactly as trays are (the owner, 25 Sep
 * 2026) — see `src/lib/trays/lead-time.ts`. Re-exported so a grow-media page
 * never reaches into the tray module by name.
 */
export { RESTOCK_EXTRA_DAYS, fromShelf, heldReadyDate, isValidStockPacks } from "@/lib/trays/lead-time";
