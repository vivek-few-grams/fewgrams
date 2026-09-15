import type { Category } from "@/lib/types";

/**
 * Panel colours per category — SPEC §17. Shared by the home page tiles and
 * the /shop index so a category keeps the same colour wherever it appears,
 * which is what makes the grid readable at a glance.
 */
export const CATEGORY_PANELS: Record<
  Category,
  { panelClass: string; marqueeClass: string }
> = {
  racks: { panelClass: "bg-sand", marqueeClass: "text-forest/15" },
  seeds: { panelClass: "bg-forest", marqueeClass: "text-mint/25" },
  trays: { panelClass: "bg-sage", marqueeClass: "text-forest/25" },
  snacks: { panelClass: "bg-mint", marqueeClass: "text-forest/20" },
};
