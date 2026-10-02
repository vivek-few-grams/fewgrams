import type { ComponentProps } from "react";
import type { QuickAdd } from "@/components/catalogue/QuickAdd";
import type { Look, TrayFinish } from "@/components/tray-play/kinds";
import type { CartKind } from "@/lib/cart/cart";

/**
 * What the play garden can sell at a step, resolved on the server: the name
 * from the content file, the price from DynamoDB already formatted, and the
 * quick-add labels. `null` wherever the item is not on sale (inactive, no
 * content file, sold out, or its category switched off), and the step then
 * runs without it — the garden never offers what the shop would refuse.
 */
export type GardenProduct = {
  kind: CartKind;
  key: string;
  name: string;
  /** "₹160 a pack" — from the record, never from copy. */
  price: string;
  href: string;
  image: { src: string; alt: string } | null;
  quickAdd: ComponentProps<typeof QuickAdd>;
};

/** Something on sale that is chosen on its own page rather than added in
 *  one press — a rack, whose height, size and colour are picked on its
 *  range page — so it carries no quick add. */
export type GardenLink = {
  name: string;
  href: string;
  image: { src: string; alt: string };
};

export type GardenShelf = {
  trays: Record<TrayFinish, GardenProduct | null>;
  medium: GardenProduct | null;
  seeds: Record<Look, GardenProduct | null>;
  /** The microgreen itself, fresh — the touch step's tags and the
   *  harvest's "or order it fresh". */
  greens: Record<Look, GardenProduct | null>;
  /** The rack range the light step's rack is drawn from (plated shelves),
   *  when racks are on sale and that range has a published model. */
  rack: GardenLink | null;
  /** `/microgreens`, when microgreens are on sale: the touch step's tags. */
  freshHref: string | null;
};
