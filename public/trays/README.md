# Tray and drainage photography

One folder per item, named by its content key:

```
public/trays/tray-pair/cutout.webp     ← the card
public/trays/tray-pair/hero.jpg        ← the gallery
```

Filenames are declared in `content/trays/<key>.json` under `images`, and
resolved by `trayImageUrl()` in `src/lib/content/trays.ts`. Nothing reads this
folder by convention, so a file that is not named in the content file is simply
unused.

## Two files per shot, because the two surfaces want different things

| | `cutout.webp` | `hero.jpg` |
|---|---|---|
| Where it shows | the `/shop/trays` card | the detail page gallery |
| Aspect | **3:2** | **3:2** |
| Pixels | 900 × 600 | 1500 × 1000 |
| Background | **transparent** | flattened onto `--color-sand` (#f2ebe3) |
| Subject fills | 88% of the width | 92% of the width |
| Format | WebP q85 (53–89 KB) | JPEG q82 (106–198 KB) |

The card runs the §17.4 motion, so it needs transparency: the panel colour and
the scrolling spec labels both have to show through, and on these shots the
drain holes are holes in the alpha channel rather than painted dots.

The gallery frame is `object-contain` over `bg-sand`, so flattening the hero
onto that same `#f2ebe3` letterboxes invisibly. It is a third of the bytes of a
WebP carrying alpha and it does not care what the frame is restyled to later —
which is why the transparent file is not simply reused here.

**The two fill figures differ because only one of the two surfaces moves.** The
card scales the media 1.1 and rotates it 4° and then clips, so the subject's own
padding is what keeps its corners off the edge: on the 419 × 279 card at 1440px
the tray is 354px wide at rest and 402px hovered, 8px clear each side. The
gallery never moves, so 92% only has to make the three shots match each other.

## Shoot to 3:2, not square

Everything in this category is a wide flat object — a 60 × 30 cm tray, a
50 × 25 cm mat. The card panel was changed from square to 3:2 to match the
gallery so that **one master serves both surfaces uncropped**; a square frame
around one of these is mostly margin anyway.

## Building them

Both come from the same transparent master, which is what the generator returns
(see `docs/TRAY_PROMPT.md`). Framing is normalised here rather than asked for in
the prompt, because the generator ignores margin instructions — these three came
back at 90, 94 and 96% of the frame width.

```bash
python3 scripts/cutout.py <master.png> public/trays/<key>/cutout.webp \
    --aspect 3:2 --fill 0.88 --width 900

python3 scripts/cutout.py <master.png> public/trays/<key>/hero.jpg \
    --aspect 3:2 --fill 0.92 --width 1500 --bg '#f2ebe3'
```

Needs Pillow and numpy; install them into a throwaway venv rather than adding a
Python dependency to the repo.

## No text baked into the photograph

Same rule as `public/varieties/`: it cannot be translated for `/kn`, it
duplicates the `<h1>`, and it cannot be restyled without re-rendering every
file. The page supplies the words — and on the card the marquee is already
scrolling the spec labels behind the subject.

## What is here

Three items, one shot each, supplied by the owner on 17 Sep 2026. Second angles
are the obvious next thing: `images.gallery` and the thumbnail strip both exist
and are unused (SPEC §23.9).

**Images are never stored in DynamoDB** — an item caps at 400 KB, you would pay
read capacity for bytes a CDN serves free, and base64 defeats `next/image`
resizing. At launch these move to S3 + CloudFront (SPEC §2) and
`NEXT_PUBLIC_IMAGE_BASE_URL` points at the distribution, with no content file
and no component changes.
