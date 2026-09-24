# Grow media photography

One folder per item, named by its content key, with filenames declared in
`content/grow-media/<key>.json` under `images` and resolved by
`growMediumImageUrl()`.

## What is here (24 Sep 2026)

IFFCO Urban Gardens' own product photographs of Horti-Coir, taken from their
store listing and cropped to the **3:2** gallery frame with `cwebp -crop`:

| File | Shot | Source |
|---|---|---|
| `hero.webp` | the block among potted plants, trowel and loose coir in front | `Untitleddesign_8.jpg`, 1080 × 1080, rows 170–890 |
| `on-bench.webp` | the block on a wooden bench, being watered in the background | `Cocopeat_Light_Image.png`, 1254 × 1254, rows 292–1128, resized to 1080 × 720 |

The 5 kg and 10 kg folders hold the same two files: the pack is identical
apart from its weight. The maker's three infographic tiles ("Why pick this?",
"Benefits", "How to use") were not used — English text baked into a picture
cannot be translated, and the how-to is in the content file instead.

**These are the maker's images**, used as a reseller. Written permission
belongs with the reseller agreement (SPEC §24.9).

## No cut-out yet

The card falls back to the photograph laid flat (`object-cover`) because there
is no transparent `cutout.webp`. When one is made, build it the tray way:

```
python3 scripts/cutout.py <master.png> public/grow-media/<key>/cutout.webp --aspect 3:2 --fill 0.88 --width 900
```

and add `"cutout": "cutout.webp"` to the content file's `images`.
