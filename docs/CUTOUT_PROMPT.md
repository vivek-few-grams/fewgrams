# Variety cut-out prompt — ChatGPT

The card treatment in SPEC §18.4 needs one transparent cut-out per variety at
`public/varieties/<key>/cutout.webp`. Master reference is
`red-amaranthus` — every other variety is generated **from** it so the tray,
camera angle and lighting stay identical across the grid.

**Status:** all five done (16 Sep 2026). This stays for the next variety.

Workflow: open the amaranthus image in ChatGPT, use the selection brush to
mask **only the greens above the tray rim**, then paste the prompt below with
the SUBJECT line swapped. Masked pixels are the only ones regenerated, so the
tray cannot drift. Do all four in one conversation. Generate wheatgrass last —
its blades fight the canopy shape.

Framing is not specified because `scripts/cutout.py` normalises it.

---

## Prompt

```
OUTPUT FORMAT — THIS IS THE MOST IMPORTANT REQUIREMENT:
Return a PNG with a real alpha channel and a FULLY TRANSPARENT background.
Transparent means empty pixels — the checkerboard — not a colour. Do not put
the tray on a white background. Not white, not off-white, not cream, not grey,
not a gradient, not a studio backdrop, not a surface of any kind. Every pixel
that is not the tray or the greens must be transparent. If you cannot output
transparency, say so instead of substituting white.

Now: keep this tray, this camera angle and this lighting exactly as they are.
Replace only the microgreens growing in the tray.

The new greens: SUBJECT

Fill the tray edge to edge at the same density, mound slightly higher in the
centre, and spill just past the left and right rims by the same amount as the
original. Stems rise vertically and the growing medium stays hidden under the
canopy.

Do not change the tray — same moulded unbleached paper-pulp punnet, same
shape, same rounded corners, same wall flare, same thin rolled rim, same
natural kraft tan, same matte fibre texture.

No cast shadow, no contact shadow, no reflection, no props, no text, no
labels, no watermark.

Square image. Transparent background, PNG with alpha channel.
```

## SUBJECT lines

| Variety | SUBJECT |
|---|---|
| `broccoli` | dense mid-green broccoli microgreens, small rounded cotyledons on slender pale green stems, canopy about 6 cm above the rim |
| `mustard` | mustard microgreens, broad rounded bright green leaves on pale ivory stems, canopy about 7 cm above the rim, slightly more open than the original |
| `red-cabbage` | red cabbage microgreens, vivid violet stems with purple-green rounded leaves, canopy about 7 cm above the rim |
| `wheatgrass` | wheatgrass, straight upright bright green blades about 15 cm tall with no leaves, standing vertically rather than mounding, sprouted wheat grain just visible at the base |

## Checking the result

A transparent PNG shows a checkerboard behind the tray. White shows white —
ChatGPT flattens to white intermittently (the amaranthus master came back with
56% of its pixels at alpha 0; the next generation came back RGB on white with
no alpha at all). If one comes back white, re-ask once; if it comes back white
again, send it anyway. Matting is possible but costs edge detail on the fine
stem tips, which is the whole reason transparency is worth insisting on.

## Processing

```
python3 scripts/cutout.py <source.png> public/varieties/<key>/cutout.webp
```

Then add `"cutout": "cutout.webp"` to `images` in
`content/varieties/<key>.json`.

The script grew four optional flags on 17 Sep 2026 so the tray grid could get a
3:2 cut-out and a flattened gallery hero out of one master
(`docs/TRAY_PROMPT.md`, SPEC §23.8). **The command above is unchanged** — the
defaults are the square variety job, and that path is verified byte-identical to
the single-purpose version rather than assumed to be.
