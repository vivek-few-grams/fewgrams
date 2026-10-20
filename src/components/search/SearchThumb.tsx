import Image from "next/image";
import { CalendarDays, type LucideIcon } from "lucide-react";
import { KIND_ICON } from "@/components/cart/KindIcon";
import { placeholderProps } from "@/lib/images/placeholder-props";
import type { SearchImage } from "@/lib/search/entry";
import type { SearchKind } from "@/lib/search/match";

/**
 * The cart's icon per kind, plus a calendar for a weekly plan — the one kind
 * search has that a cart line does not. A `Record`, so a new kind is a type
 * error here until it is given one.
 */
const SEARCH_ICON: Record<SearchKind, LucideIcon> = { ...KIND_ICON, plan: CalendarDays };

/**
 * A result's picture, shared by the header box and `/search` — SPEC §27.
 *
 * Decorative (`alt=""`): the name is printed beside it. A cut-out sits
 * `contain`ed on the sand panel the card grids use; a photo fills the square.
 * With no picture at all — Pick Your Own — the kind's icon stands in, dark
 * green with a cream icon as every icon circle on the site is.
 *
 * `size` is the box in pixels, and it is also the `sizes` hint, so the
 * optimiser sends a 2× thumbnail rather than a card-sized file.
 */
export function SearchThumb({
  kind,
  image,
  size,
}: {
  kind: SearchKind;
  image: SearchImage | null;
  size: number;
}) {
  if (!image) {
    const Icon = SEARCH_ICON[kind];
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-forest text-cream"
      >
        <Icon size={Math.round(size * 0.4)} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="relative block shrink-0 overflow-hidden rounded-xl bg-sand"
    >
      <Image
        src={image.src}
        alt=""
        fill
        sizes={`${size}px`}
        className={image.fit === "contain" ? "object-contain p-0.5" : "object-cover"}
        {...placeholderProps(image.placeholder, image.fit)}
      />
    </span>
  );
}
