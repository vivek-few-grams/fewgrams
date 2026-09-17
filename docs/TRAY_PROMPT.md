# Tray, drainage and rack image prompts

The `/shop/trays` card runs the §17.4 motion, so it needs the same kind of
asset the varieties need: **a transparent cut-out, not a photograph with a
background.** These prompts produce that.

**Status:** the three tray and drainage shots are done (17 Sep 2026), one each.
The rack prompt is written and unused — see the warning at the bottom.

Written against the owner's own microgreen prompt, which is the house style, and
changed only where the subject forced it:

| Microgreen prompt | Here | Why |
|---|---|---|
| square 1:1 | **3:2 landscape** | the card and the gallery are both 3:2 (SPEC §23.5) |
| pure white seamless background | **transparent** | white fills the panel and the marquee has nothing to show through |
| tray at 80% of frame width, even margin | not specified | `scripts/cutout.py` re-frames it; the generator ignores margin instructions anyway |
| moulded paper pulp | **rigid moulded plastic** | these are plastic products; "paper tray" gets the microgreen punnet |
| planted with greens | **empty** | the tray is the product |

Everything else — 25° elevated three-quarter view, 50 mm equivalent, subject
rotated 30°, level and square to the horizon, soft diffused daylight from the
upper left, no cast shadow, no reflection, no contact shadow, true-to-life
colour, whole subject in focus, nothing else in the frame — is the owner's and
is carried through unchanged.

---

## The shared block

Every prompt below opens with this. It is first because it is the requirement
most often silently dropped.

```
OUTPUT FORMAT — THIS IS THE MOST IMPORTANT REQUIREMENT:
Return a PNG with a real alpha channel and a FULLY TRANSPARENT background.
Transparent means empty pixels — the checkerboard — not a colour. Not white,
not off-white, not cream, not grey, not black, not a gradient, not a studio
backdrop, not a surface of any kind. Every pixel that is not the product must
be transparent. If you cannot output transparency, say so instead of
substituting a colour.
```

and closes with this:

```
Camera: slightly elevated three-quarter view, about 25 degrees above the rim,
lens at 50mm equivalent, the subject rotated 30 degrees so one short edge faces
the camera. It sits perfectly level and square to the horizon — do not tilt or
rotate the image.

Framing: landscape 3:2.

Lighting: soft, even, diffused daylight from the upper left, as from a large
softbox. No hard specular hotspots, no cast shadow on the ground, no
reflection, no contact shadow.

Style: natural, honest product photography. True-to-life colour, crisp detail
on the moulded edges, the whole subject in focus.

Nothing else in the frame: no text, no labels, no logos, no watermark, no
hands, no soil, no seeds, no greens growing in the trays, no cloth, no table
surface, no props of any kind.
```

## Subject blocks

### `tray-pair` — Microgreen trays, pair (₹160)

```
Subject: two shallow rectangular plastic microgreen growing trays, empty and
clean, shown as a set. One has a grid of small round drain holes punched
through its base; the other has a solid unbroken base. Stack them as a pair,
the drained tray resting over the rim of the solid one and offset so both read
as two separate trays. The drain holes must be visible.

Proportions, which matter: each tray is 60 cm long by 30 cm wide and only 3 cm
deep — a 2:1 footprint and a very shallow wall, like a seed flat, not a crate
or a storage box. Wall thickness is 3 mm, so the rim reads as thin. Plain
smooth sides, no ribbing, no handles, a simple rolled edge.

Material: rigid injection-moulded plastic in a matte black finish. Not paper
pulp, not fibre, not cardboard, not glossy.
```

**Black was a guess that the photograph confirmed.** Bazodo's page for this kit
gives the size, the 3 mm wall and the material and never names a colour, so the
prompt used the trade default and flagged the word. The delivered shot is black.

### `tray-pair-food-grade` — the same pair, food grade (₹270)

```
Subject: two shallow rectangular plastic microgreen growing trays, empty and
clean, shown as a set. The tray with a grid of small round drain holes punched
through its base is WHITE. The tray with a solid unbroken base is GREEN. Stack
them as a pair, offset so both colours and both bases read clearly.

Proportions: each tray is 60 cm long by 30 cm wide and 3 cm deep — a 2:1
footprint, a very shallow wall, 3 mm thick.

Material: rigid injection-moulded virgin food-grade plastic. Clean, even,
slightly satin — visibly better finished than a recycled tray, with no speckle,
no swirl and no colour variation in the plastic.
```

The white/green split is the vendor's own and is the whole reason this kit costs
₹110 more, so it has to be unmistakable: a buyer comparing the two cards should
see the difference before reading a word.

### `drain-cell-mat` — Drainage cell mats, pack of five (₹300)

```
Subject: a stack of five identical rectangular drainage mats, squarely on top of
one another with the top mat offset slightly so the open cell structure of its
upper face is fully visible and the edges below read as five distinct layers.

Structure, which is the whole product: each mat is an open cellular grid — a
regular array of hollow cells joined by thin webs, like a moulded egg-crate or
a honeycomb drainage panel, open on top and open underneath so water runs
through freely. Interlocking tabs along the edges.

Proportions: each mat is 50 cm long by 25 cm wide — a 2:1 footprint — and 20 mm
thick. The 20 mm is a selling point, so the stack must read as five substantial
layers, not five thin sheets.

Material: heavy-duty black polypropylene, matte, slightly textured, rigid. Not
glossy, not translucent, not soft.
```

The structure paragraph is doing the work — "drain cell mat" on its own returns
a doormat or a floor tile. Raise the camera to about 30° for this one, high
enough to read the cell pattern on top and low enough to read the 20 mm edge of
each layer, and give the cell walls enough directional light to keep the grid
from flattening into a printed pattern.

## Further angles

Re-run with only the subject block swapped, so the set still looks like one
shoot. None of these exist yet (SPEC §23.9).

| Item | File | Subject |
|---|---|---|
| both kits | `drained.jpg` | a single tray, the drained one, alone and empty, tilted about 40° toward the camera so the grid of holes in its base is the subject |
| both kits | `nested.jpg` | the two trays nested flat inside one another as they ship, one low stack, three-quarter view, the doubled rim visible at the edge |
| mats | `single.jpg` | one mat alone from almost directly above, about 70°, filling the frame so the full grid across all 50 × 25 cm is readable |
| mats | `interlock.jpg` | two mats clipped edge to edge, low three-quarter view across the join, the tabs and the continuous 20 mm depth as the subject |

## Checking and processing

A transparent PNG shows a checkerboard behind the subject. These three came back
correct first time, at 1536 × 1024 with 44–59% of their pixels at alpha 0 — but
ChatGPT flattens to white or black intermittently, so check before processing.
Note that a dark preview backdrop makes a correct cut-out *look* like a black
studio shot; check the alpha, not the thumbnail.

Then build both assets from the one master — commands and reasoning in
`public/trays/README.md` — and name them in `content/trays/<key>.json`:

```json
"images": { "hero": "hero.jpg", "cutout": "cutout.webp" },
```

---

## Racks — done, and in use

**Status:** all three shot on 17 Sep 2026 and live on `/shop/racks`, plus the
`shelf` range on the category tile. Assets and the two caveats are in
`public/racks/README.md`. This section stays for re-shoots and further angles.

When these prompts were written there was nowhere for a rack image to go —
`RackModel` has no `images` field and there is no `content/racks/` folder — so
they were drafted as masters to keep. The owner supplied the shots anyway, and
`/shop/racks` was built to hold them (SPEC §19.6), and `/shop/racks/[range]`
followed within the hour when the owner asked for add-to-cart (§19.7). Both use
the cut-out; neither has a photo gallery, so there is still no `hero.jpg` — one
transparent cut-out per range is the whole set.

**4:5 portrait**, because a rack is 4 ft tall in 3 ft of width. Shoot at
**1600 × 2000** or larger; the shipped assets are 720 × 900.

**Leave real margin on all four sides.** The `angle` shot came back with its
left upright sliced lengthwise by the frame — 751 pixels of solid subject on the
edge — and cropped pixels cannot be padded back, so that one has to be
regenerated rather than reprocessed. The framing line below is deliberately more
insistent than the tray prompts' because of it.

Use the shared blocks above with the camera at standing height about 15 degrees
above the top shelf, one of the three subject blocks below, and this framing
line in place of the trays' one:

```
Framing: portrait 4:5. The rack is centred and occupies about 80% of the frame
height. Leave clear empty margin on ALL FOUR sides — no part of the rack may
touch or be cropped by any edge of the frame, including the outermost upright
and the top rail.
```

```
Proportions: the rack is 4 feet tall, 3 feet wide and 1 foot deep, with three
shelf levels evenly spaced, the lowest a few inches clear of the floor. It
reads as a functional light-duty utility rack, not a showroom display unit and
not a heavy industrial pallet rack.

Nothing else in the frame: no text, no labels, no logos, no watermark, no
hands, no trays, no plants, no boxes, no lights or LED tubes fitted, no wall,
no floor surface, no room, no props. The rack is completely empty on every
shelf.
```

**Empty on every shelf, and that is a content decision.** §19.4 deleted the
"trays per shelf" figure because a rack goes to whoever buys it and they use
whatever tray they already own. A photograph with trays on it would put back, as
a picture, the capacity claim the site stopped making.

**On colour:** the blocks below ask for green powder coat and the delivered
shots came back **orange**. That is a valid rack rather than a miss — the 1.4 mm
angle grade comes in orange, green and purple and the colour changes nothing
about the cost — so it was kept. Change the word if a re-shoot should match the
brand palette instead.

### Shelf racks — `/admin/racks`, the plated range

```
Subject: a bolted slotted-angle rack. Four vertical legs of L-section steel
angle, each flange pierced with a regular row of evenly spaced slots and round
holes along its full length. Three shelves, each a single flat pressed
sheet-steel plate resting on and bolted to the angle frame, with a shallow
turned-down lip on all four sides. Visible nuts and bolts at every corner
joint. Finish: even matte powder coat in a mid green, the same colour on the
legs and the plates, with no bare metal except at the bolt heads.
```

### Angle racks — `/admin/angle-racks`, the open-frame range

```
Subject: an open-frame bolted slotted-angle rack with NO solid shelves at all.
Four vertical legs of L-section steel angle, each flange pierced with a regular
row of evenly spaced slots and round holes. Each of the three levels is a bare
rectangle of the same slotted angle — two long rails, two short end rails, and
a third long rail running down the middle of the rectangle as a brace. You can
see straight through every level from above. Visible nuts and bolts at every
joint. Finish: even matte powder coat in a mid green, no bare metal except at
the bolt heads.
```

### Pipe racks — `/admin/pipe-racks`, the UPVC range

```
Subject: a rack built entirely from 1 inch white UPVC plumbing pipe and moulded
white push-fit elbow and tee connectors. Four vertical corner uprights. Each of
the three levels is a bare rectangular perimeter of pipe — two long rails and
two short end rails, with NO rail down the middle. Under each long rail, at its
exact midpoint, a short vertical pipe runs down to the level below as a support
leg, so the span is braced from underneath rather than across the top. Small
white end caps at the base of each upright. Finish: clean matte white plastic
throughout, slightly satin, the connector sockets visibly thicker than the pipe
they join.
```

Those three blocks are the actual engineering difference between the ranges, not
cosmetic variation: the mid-rail on an angle shelf versus the middle support leg
*underneath* a pipe shelf is the distinction the pricing formulas turn on, and
it is the detail an image is most likely to get wrong. If only one gets
generated, generate the pipe rack — it is the range whose shape is hardest to
picture from the admin table.

One constraint to respect if the height changes: **6 ft is the ceiling for pipe
racks** (a 1 inch upright gets springy above it, §21). The steel ranges have no
such limit.
