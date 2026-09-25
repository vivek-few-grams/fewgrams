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
  /* The packet line-up, 20 Sep 2026 — a group shot rather than one packet,
     because a seed sale is a shelf of varieties and no single pack stands in
     for the range the way one rack model can. Built with the same
     `scripts/cutout.py --aspect 3:2 --fill 0.88` recipe as the microgreens
     tile's photo, which is the other landscape group shot on this page. */
  seeds: "/shop/seeds-cutout.webp",
  /* The pack line-up, 20 Sep 2026 — cell trays, the black growing tray pair
     and the coloured drainage tray pair, stacked in one shot, the same
     "group rather than one item" call as the seeds photo. Replaced same day
     with a cleaner re-shoot of the same idea — the first version had all
     three groups arranged side by side; this one stacks them vertically,
     which is why the box below is portrait rather than 3:2. */
  trays: "/shop/trays-cutout.webp",
  /* A bare compressed coir block with a heap of loose coir, a coconut shell
     and a wooden scoop — the owner's image, 24 Sep 2026 (it replaced a first
     version the same afternoon, under a new filename so the image optimiser
     cannot serve the old one). A category picture rather than the IFFCO
     pack, so the tile reads as "what we grow in" and a second medium can
     join without it lying. `scripts/cutout.py` at the square defaults. */
  media: "/shop/grow-media-block-cutout.webp",
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
  /* 90% since 25 Sep 2026 ("bit bigger"): measured with the hover transform
     applied, the rack still has ~30px spare across and ~2px top and bottom. */
  racks: "aspect-[4/5] h-[90%]",
  /* Landscape, matching the 3:2 frame the cut-out was built to. Wider than
     90% before; 93% since 25 Sep 2026 (the owner's second "bit bigger").
     That is the ceiling: measured with the hover transform applied it is as
     close to the clip as trays at 88%, which is the tightest tile that has
     shipped without clipping. 96% measurably clipped. */
  seeds: "aspect-[3/2] w-[93%]",
  /* Portrait, matching the 2:3 frame the vertically-stacked cut-out was
     built to — the same reasoning as `racks`: sizing by height rather than
     width is what lets a tall subject read as the subject rather than a
     narrow column floating in the panel. Already at the ceiling: 94% was
     tried on 25 Sep 2026 and overran the clip top and bottom on hover. */
  trays: "aspect-[2/3] h-[88%]",
  /* Square, matching the cut-out's frame, at 92% of the tile's width (82%
     until 25 Sep 2026). The subject is padded to 86% of its box, so scaled
     1.1 and turned 4° on hover it still meets the clip with a pixel to spare,
     measured. */
  media: "aspect-square w-[92%]",
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
