# Rack photography

One folder per range, named as `/shop/racks` names it:

```
public/racks/shelf/cutout.webp   ← the plated range      (/admin/racks,       SPEC §19)
public/racks/angle/cutout.webp   ← the open-frame range  (/admin/angle-racks, SPEC §20)
public/racks/pipe/cutout.webp    ← the UPVC range        (/admin/pipe-racks,  SPEC §21)
```

Unlike varieties and trays these are **not declared in a content file**, because
racks have none: a rack is computed from a component rate card rather than
entered as a catalogue item (§19), so there is no `content/racks/<key>.json` and
no `images` block to name. `/shop/racks` builds the path from the range key
instead, and `CategoryMedia` hard-codes the one it uses. Both places are listed
above — if a filename changes, they are what to change.

## One file per range, and no hero

| | `cutout.webp` |
|---|---|
| Aspect | **4:5 portrait** |
| Pixels | 720 × 900 |
| Background | **transparent** |
| Subject fills | 88% of the **height** |
| Format | WebP q85 (76–147 KB) |

Portrait, because the subject is: a rack is 4 ft tall in 3 ft of width, and a
landscape frame around one is two bands of empty panel.

**Normalised on height, not width** — the opposite of the variety cut-outs
(§17.4). Those are punnets of roughly one shape, so a common width gives them a
common size. Racks vary in width by range and by model but are all the same kind
of tall object, so a common height is what makes the three read as one set; the
widths then come out at 74%, 79% and 83%, which is the rack rather than the
photography. `scripts/cutout.py` does this automatically: all three subjects are
narrower than 4:5, so the height is what binds.

**There is no `hero.jpg`, deliberately.** A hero is a photograph flattened onto
the ground of the frame it sits in, and the only rack frame that exists is a
cut-out panel. Baking `bg-sand` into a file for a gallery that has not been
designed would be choosing its background before choosing the page.

## Where they show

- **`/shop/racks`** — all three, one card per range, portrait panels with the
  §17.4 hover and six properties scrolling behind each.
- **The `racks` category tile** on the home page and `/shop` — the `shelf`
  range only, via `CategoryMedia`. There is one tile for the category, not one
  per range.

- **`/shop/racks/[range]`** — the same cut-out again, in the detail page's
  gallery frame, beside the height/size/colour options and the buy box.

The cut-out is the only rack asset any of those three surfaces wants, which is
why there is no `hero.jpg` (§19.7, §19.11).

## Building them

```bash
python3 scripts/cutout.py <master.png> public/racks/<range>/cutout.webp \
    --aspect 4:5 --fill 0.88 --width 720
```

Needs Pillow and numpy in a throwaway venv. The prompts are in
`docs/TRAY_PROMPT.md`.

## What is here

Three shots, supplied by the owner on 17 Sep 2026.

**Two things about them worth knowing rather than rediscovering:**

1. **The steel is orange, not the green the prompt asked for.** Orange is a real
   option — the 1.4 mm angle grade comes in orange, green and purple, and the
   colour changes nothing about the cost (see `AngleGrade` in `src/lib/types.ts`)
   — so this is a valid rack and not a mistake. It does mean the range
   photographs do not carry the brand palette; they sit on `bg-sand`, which is
   warm enough to take it.
2. **The `angle` master is clipped at the frame edge.** 751 pixels of solid
   subject run down its left edge, so the far-left upright is sliced lengthwise
   through its bolt heads and the outer flange is missing. `shelf` and `pipe`
   have clear margin on all four sides. The owner chose to ship it as supplied;
   it is barely visible at card size and invisible once the hover tilts it. To
   fix it properly the shot has to be regenerated — cropped pixels cannot be
   padded back — with the framing line in the prompt made explicit.
