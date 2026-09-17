import Image from "next/image";
import { Sprout } from "@/components/ui/Sprout";
import type { Category } from "@/lib/types";

/**
 * What sits inside a category tile's media box — on the home page
 * (`OtherProducts`, SPEC §18.3) and on `/shop`.
 *
 * Extracted 17 Sep 2026, when racks became the first category with a
 * photograph. Both surfaces render the same four tiles from the same
 * `CATEGORIES` array, and both had their own copy of the media decision; a
 * third copy would have been a third place to forget the next category that
 * gets shot.
 *
 * **One cut-out so far.** `CUTOUTS` is the whole of the photography, so a
 * category not listed falls back to the generated `Sprout` mark exactly as
 * before. That is the same three-treatment pattern `Tile` uses (SPEC §17.4)
 * and it is what lets photography land one category at a time rather than all
 * at once.
 *
 * A cut-out and not a hero, for the reason given in §17.4: the tile scales and
 * tilts its media over a flat panel with a marquee running behind, so the file
 * has to be transparent. A photograph carrying its own background would sit on
 * the panel as a rectangle and the tilt would read as a skewed picture.
 */
const CUTOUTS: Partial<Record<Category, string>> = {
  /* The plated shelf range, which is the one a buyer pictures when they hear
     "rack" — and the most legible of the three at tile size. The open-frame
     and UPVC ranges are photographed too but have nowhere to go yet: there is
     one tile for the category, not one per range — the other two appear on
     `/shop/racks` (SPEC §19.6). */
  racks: "/racks/shelf/cutout.webp",
};

/**
 * Portrait, unlike the square box a `Sprout` gets.
 *
 * A rack is a tall object — 4 ft in 3 ft of width — and `object-contain` in a
 * square box fits it by its height, so 70% of a portrait tile's *width* would
 * have left it small and floating. At 80% of the tile's height the rack reads
 * as the subject.
 *
 * It still clears the hover: the cut-out is padded to 88% of its own frame, so
 * the subject stands 246px in a 350px tile and the 1.1 scale with the 4° tilt
 * takes its bounding box to 284 x 223 — inside the tile on both axes.
 */
const MEDIA_CLASS: Partial<Record<Category, string>> = {
  racks: "aspect-[4/5] h-[80%]",
};

export function categoryMediaClass(category: Category): string | undefined {
  return MEDIA_CLASS[category];
}

export function CategoryMedia({
  category,
  index,
}: {
  category: Category;
  /** Varies the `Sprout` so four tiles are not four identical drawings. */
  index: number;
}) {
  const cutout = CUTOUTS[category];

  if (cutout) {
    return (
      <Image
        src={cutout}
        /* Empty on purpose. The tile's accessible name is the `aria-label` on
           its link — "Racks — 0 products" — and the photograph adds nothing a
           reader of that label does not already have. Describing the rack here
           would announce the same tile twice.

           It is also the honest reading: this picture illustrates a category,
           it is not the product being described. The rack detail page, when it
           exists, is where a photograph carries information and earns real alt
           text from a content file. */
        alt=""
        width={720}
        height={900}
        /* Two-up on a phone, three-up on /shop and four-up on the home page,
           all inside a 1400px page — so the widest this is ever asked to fill
           is about a quarter of the viewport. */
        sizes="(min-width: 768px) 22vw, 42vw"
        className="h-full w-full object-contain"
      />
    );
  }

  return (
    <Sprout
      className="h-full w-full"
      stroke={category === "seeds" ? "#ABE1CC" : "#033923"}
      seed={index + 2}
    />
  );
}
