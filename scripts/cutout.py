"""Normalise a generated cut-out into a catalogue media asset.

    # the square variety card asset — the original job, and the defaults
    python3 scripts/cutout.py <source.png> public/varieties/<key>/cutout.webp

    # a 3:2 tray card asset, and its gallery photograph on the frame's ground
    python3 scripts/cutout.py <src.png> public/trays/<key>/cutout.webp --aspect 3:2 --fill 0.88 --width 900
    python3 scripts/cutout.py <src.png> public/trays/<key>/hero.jpg --aspect 3:2 --fill 0.92 --width 1500 --bg '#f2ebe3'

Needs Pillow and numpy; nothing else in the project does, so install them into
a throwaway venv rather than adding a Python dependency to the repo.

## Why framing happens here and not in the prompt

The generator ignores margin instructions — the red amaranthus sample came
back at 96% of the frame width, and the three tray shots at 90, 94 and 96% —
so every asset is re-framed here: crop to the alpha bounding box, then centre
it on a canvas of the requested aspect with the subject at FILL of it.

**The numbers are per surface, because the hover is what sets the ceiling.**
`.mcard` scales the media by 1.1 and rotates it 4 degrees, and the tile clips
with `overflow: hidden`, so a subject padded too loosely looks lost in the
panel and one padded too tightly has its corners shaved. Each value was
settled by rendering at the real card size with the marquee running:

| Surface | Aspect | Fill | Why |
|---|---|---|---|
| variety card | 1:1 | 0.86 | below it the punnet looks lost; above it the tray covers the nutrient type |
| tray card | 3:2 | 0.88 | a flat 2:1 object rotated 4 degrees and scaled 1.1 reaches 0.966 of the tile, leaving ~6px each side of a 379px card |
| tray gallery | 3:2 | 0.92 | not a card and never rotated, so the only thing to satisfy is that the three shots match each other |

The canvas is the **smallest** one of the requested aspect that holds the
subject inside FILL of both axes, which for a square reduces to the original
`max(w, h) / FILL` exactly — so the variety assets are byte-identical to what
the single-purpose version produced.

## Two outputs, because a card and a gallery want different files

Transparent WebP by default. That is what the `.mcard` treatment needs, since
both the panel colour and the marquee scrolling behind have to show through
(SPEC §17.4) — and on these shots the drain holes are holes in the alpha, so
the ground shows through them too.

`--bg` composites onto an opaque ground instead, which is what a `hero` is.
The gallery frame is `object-contain` over `bg-sand`, so a hero flattened onto
that same `#f2ebe3` letterboxes invisibly, costs a fraction of the bytes of a
WebP carrying alpha, and does not care what the frame is restyled to. The
format follows the destination's extension.
"""
import sys, os
from PIL import Image
import numpy as np

QUALITY = {"WEBP": 85, "JPEG": 82}


def arg(flag, default):
    """A flag's value, or the default. Deliberately not argparse: four options
    on a script run by hand a dozen times a release."""
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


src, dest = sys.argv[1], sys.argv[2]
aspect_w, aspect_h = (int(n) for n in arg("--aspect", "1:1").split(":"))
fill = float(arg("--fill", "0.86"))
out_w = int(arg("--width", "800"))
bg = arg("--bg", None)

fmt = "JPEG" if dest.lower().endswith((".jpg", ".jpeg")) else "WEBP"
if fmt == "JPEG" and bg is None:
    sys.exit("a .jpg destination needs --bg: JPEG cannot carry the alpha")

im = Image.open(src).convert("RGBA")
alpha = np.array(im)[:, :, 3]
ys, xs = np.where(alpha > 8)
sub = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
w, h = sub.size

# Smallest canvas of this aspect with the subject inside `fill` of both axes.
canvas_w = int(round(max(w / fill, (h / fill) * aspect_w / aspect_h)))
canvas_h = int(round(canvas_w * aspect_h / aspect_w))

canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
canvas.paste(sub, ((canvas_w - w) // 2, (canvas_h - h) // 2), sub)
out = canvas.resize((out_w, int(round(out_w * aspect_h / aspect_w))), Image.LANCZOS)

if bg is not None:
    ground = Image.new("RGB", out.size, bg)
    ground.paste(out, (0, 0), out)
    out = ground

os.makedirs(os.path.dirname(dest), exist_ok=True)
# `method=6` is WebP's slowest/smallest search; `optimize` is its JPEG analogue.
extra = {"method": 6} if fmt == "WEBP" else {"optimize": True}
out.save(dest, fmt, quality=QUALITY[fmt], **extra)
print(f"{dest}  {out.size[0]}x{out.size[1]}  subject {w}x{h} in {canvas_w}x{canvas_h} "
      f"-> {round(100 * w / canvas_w)}% wide, {round(100 * h / canvas_h)}% tall  "
      f"{os.path.getsize(dest) // 1024} KB")
