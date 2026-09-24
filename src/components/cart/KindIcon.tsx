import { Bean, Grid2x2, Leaf, ShelvingUnit, type LucideIcon } from "lucide-react";
import type { CartKind } from "@/lib/cart/cart";

/**
 * One icon per kind of thing in the cart — a leaf for microgreens, a bean for
 * seeds, a grid for trays and drainage mats, a shelving unit for racks.
 *
 * A `Record` over `CartKind` rather than a switch with a default, so a new
 * kind is a type error here until it is given its own icon (CLAUDE.md, "A
 * fourth kind means four branches"). Decorative: the line's name already
 * says what it is, so the icon is `aria-hidden`.
 */
export const KIND_ICON: Record<CartKind, LucideIcon> = {
  variety: Leaf,
  seed: Bean,
  tray: Grid2x2,
  rack: ShelvingUnit,
};

/** `className` sets the size and colours; the circle and centring are fixed. */
export function KindIcon({ kind, className = "size-9" }: { kind: CartKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full ${className}`}>
      <Icon size={17} strokeWidth={1.75} />
    </span>
  );
}
