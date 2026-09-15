# Variety photography

One folder per variety, named by its content key:

```
public/varieties/radish/hero.jpg
public/varieties/red-amaranth/hero.jpg
```

## Size and shape — shoot to this

| | Value |
|---|---|
| **Aspect ratio** | **3:2 landscape** |
| **Recommended pixels** | **1800 x 1200** (1536 x 1024 minimum) |
| Format | JPEG, quality ~82 |
| Target weight | under 500 KB per file |
| Text in the image | **none** — see below |

The detail page frame is 3:2 and uses `object-contain`, so **nothing is ever
cropped**. Supply something other than 3:2 and it still shows in full, just
letterboxed against `--color-sand` (#f2ebe3) — chosen because the studio
backdrop in the current photographs measures about rgb(240, 231, 225) along its
top and bottom edges, so the bars read as part of the photograph.

Nine of the ten current files are 1536 x 1024. `red-amaranthus/hero.jpg` is
1254 x 1254 and is the one that letterboxes (104px each side at desktop width).
Re-export it at 3:2 and it fills the frame like the rest.

The `/microgreens` grid is deliberately different: square tiles with
`object-cover`, which centre-crops a 3:2 photo. That is normal for a grid of
equal tiles and is not a defect — but it is why baked-in text does not survive
there.

## No text baked into the photograph

The current heroes carry a rendered title — "Broccoli / Microgreens" in the
top-left. It has to come out, for four separate reasons:

1. **It cannot be translated.** `/kn/microgreens/broccoli` renders every word on
   the page in Kannada and then shows an English title inside the image.
2. **It duplicates the `<h1>`**, which sits a few centimetres to the right of it.
3. **It is cropped away** by the square tiles on `/microgreens`, so the same
   asset reads as a titled poster in one place and a headless crop in another.
4. **It cannot be restyled.** A font, colour or wording change means
   re-rendering ten photographs instead of editing one component.

Photographs should be the food only. The page supplies the words.

Filenames are declared in `content/varieties/<key>.json` under `images`, and
resolved by `varietyImageUrl()` in `src/lib/content/varieties.ts`. Nothing
reads this folder by convention, so a photo that is not named in the content
file is simply unused.

**Images are never stored in DynamoDB** — an item caps at 400 KB, you would pay
read capacity for bytes a CDN serves free, and base64 defeats `next/image`
resizing. Reasoning in full in the loader.

At launch these move to S3 + CloudFront (SPEC §2) and
`NEXT_PUBLIC_IMAGE_BASE_URL` points at the distribution. No content file and no
component changes.

A variety with no `images.hero` falls back to the generated `Sprout` placeholder
rather than a broken image, so adding photography is safe to do variety by
variety.
