# Storybook illustrations — `public/story/`

The thirteen pictures for `/how-we-grow`. One file per page, named for its page key in
`content/story/book.json`. SPEC §18.5.

## The paper is cream, and the whole picture is shown

Every page is `cream`, and the illustration renders at its own natural size — never cropped, never
stretched, and with nothing added to its edge.

Two consequences for new artwork:

- **Any aspect ratio is fine.** The current set runs 1.34 (`cover`) to 3.0 (`closing`), and
  the page measures each file's real dimensions from its header rather than assuming a shape.
- **The master's own background is what meets the paper, so check it against cream rather than
  against white.** A hard pure-white rectangle reads as a bright panel sitting on the page rather
  than as part of it. The existing set works because its backgrounds are warm rooms that fall away
  softly at the edges — that softness has to be in the artwork, because nothing in CSS adds it.

Green paper, a spiral binding and a soft mask over the plate edges were all tried on 22 Sep 2026
and all reverted the same day. The mask went through two tunings before being dropped: it read as
a blur over the outside of each picture rather than as torn paper.

## The pipeline

Not `scripts/cutout.py`. That script makes **cut-outs** — a transparent product on no ground, for
the tilting card treatment in §17.4. A storybook illustration is the opposite: a whole scene with
its own background, filling a whole leaf, never scaled or rotated. So it is a plain resize:

```sh
cwebp -quiet -q 80 -resize 1200 0 -metadata none "<master>.png" -o public/story/<key>.webp
```

1200px wide is a leaf at 2× on a large desktop and the full column at 3× on a phone. `-metadata
none` because these come out of an image generator carrying a few KB of provenance nobody reads.

**Do not commit the PNG masters.** They are 2–3 MB each and the webp is 60–270 KB.

### Replacing a picture is just overwriting the file

Same filename, `cwebp` over the top, done — the page reads the new dimensions out of the header,
so a different shape needs no other edit. Update `imageAlt` in `content/story/book.json` if the
scene changed, in **both** languages; it describes the picture, so a swap makes it wrong.

You do **not** need to clear a cache or hard-reload. `storyImageUrl` puts the file's modification
time on the URL as `?v=`, which is what makes a replacement visible at all: `next/image` answers
the browser's revalidation with a `304` built from an ETag that does not track the source file, so
without the version the old picture stays on screen indefinitely with the correct bytes on disk.
That was diagnosed the hard way on 22 Sep 2026. `next.config.ts` has to allow the query string —
see `images.localPatterns` there.

## Known problems with the current set

All of these are visible to every visitor. None blocks launch. Recorded here rather than in a
ticket because the fix is a regeneration and this is where whoever does it will look.

### 1. Baked-in English, in four of thirteen

`seed`, `reset`, `clean` and `engineers` carry English words painted into the scene —
`Old Cocopeat Waste` on a bin, `Cocopeat For Microgreens` on a sack, `Quality Check` and its five
line items, seed names on bags and bowls, `Seed Samples`, `70% Isopropyl Alcohol` on a bottle,
and `Small Greens Big Health` / `Fresh Microgreens Better Tomorrow` on wall art.

It was seven on the morning of 22 Sep 2026. `sow` was replaced with a version carrying no text at
all, and `harvest` with one whose only text is the brand itself — proof that the scenes work
without the labels, and the best argument for regenerating the rest.

**The brand mark is the one deliberate exception.** `harvest`'s boxes and `reset`'s cocopeat
sack read `few grams` / `Goodness in Every Gram`, which is the brand and its tagline —
the same words the header logo shows a Kannada visitor on every page of the site. A brand name is
not a translatable string, so this is the one place English in the artwork is correct rather than
tolerated. Do not "fix" it.

A Kannada reader cannot read any of it. This is **an accepted exception, and it must not grow**:
they are depicted props inside a picture rather than interface copy, which is a different thing
from a translatable string — the same call we would make about a photograph of a real seed packet.
The line is that a label may *decorate* a scene and may never *carry* meaning the page needs. If a
future page would need its illustration read to be understood, the words go in `book.json` and out
of the artwork.

**`engineers` (replaced 22 Sep 2026) is the worst offender by a distance** and is the one to fix
first. The others carry a word or two on a prop; this one has a wall poster reading `GOOD SOFTWARE
BUILDS BETTER TOMORROWS`, a whiteboard checklist, two screens of legible code, a test-run panel,
book spines, a mug and a notepad — a dozen English strings, several of them large enough to read
across the room. It still passes the rule above (nothing there is load-bearing; the page says what
it means in `book.json`), but it is the page where a Kannada reader most obviously sees a picture
made for somebody else. Regenerate it with the same scene and no legible text.

Regenerating without the labels is the real fix and is worth doing before launch.

### 2. Two illustration styles

`concern` is the last page on its original artwork, and the last soft watercolour one. Every
other page is now the newer soft-lit render. In a book, style is continuity, and with the set
this close to uniform that one page is the whole remaining problem.

Ten pages were replaced on 22 Sep 2026 — everything from `cover` to `reset` except `concern` —
in one consistent soft-lit style: warm daylight, the same two characters, the same palette. The
original question in this section was whether to regenerate the process pages towards the
watercolour family scenes. That answered itself the other way: the new style is ten pages against
one, so the remaining work is `concern` alone, plus `germinate` and `closing`, which were never
either style.

`engineers` is also the only page set at **night**, in an office rather than a home. Everything
else in the book is daylight and domestic. It reads as a deliberate beat rather than a mistake —
it is the page about the working day, and the next page turns to the evening — but it is the one
tonal outlier and worth knowing about before anything else is regenerated around it.

The watercolour set is the better of the two. If the three remaining process pages are
regenerated, the tail that keeps them consistent is:

> Soft watercolour children's-book illustration, warm natural daylight, gentle pastel palette with
> fresh greens, clean light background, no text, 3:2.

### 3. Character continuity

Largely solved by the 22 Sep replacements: the woman reads the same across all ten of them.
`concern` is the one page left showing her differently, and it is also the one page still on its
original artwork, so the two problems have the same fix.

### 4. `clean` names a specific sanitiser

The bottle on the table reads `70% Isopropyl Alcohol`. That is a different kind of baked-in text
from the rest: the others are decoration (`Cocopeat`, a shop sign), but this one is a **factual
claim about how the trays are actually cleaned**, made by the picture rather than by the copy —
which says only "washed and sterilised".

If 70% IPA is what is used, fine, and it is a good concrete detail. If it is not, the page is
telling visitors something untrue in the one place the book is arguing that nothing is taken on
trust. Worth confirming before launch, and regenerating with an unlabelled bottle if in doubt.

### 5. `reset` says waste where the copy says compost

The bin in the picture is labelled `Old Cocopeat Waste`. The copy on the same spread says used
cocopeat is **"composted out and never reused"**. Those are two different claims about where the
medium goes, printed side by side.

Same class of problem as the isopropyl bottle on `clean`, and the same fix: confirm what actually
happens to it, then make the label and the sentence agree. If it is composted, the bin should say
so; if it is binned, the copy should not say composted.

### 6. `cover` and `few-grams` are literally the same picture

Not "the same scene" — the same file. `cover.webp` and `few-grams.webp` have identical SHA-256
hashes, because the same master was used for both on 22 Sep 2026.

They are pages 1 and 6, so a reader meets the picture, turns five spreads, and meets it again
under a different heading. The book's whole conceit is that each page is a new moment; a repeat
reads as a mistake, and it also wastes the one illustration that is doing the most emotional work.

Whichever page keeps it, the other needs its own master. `cover` is the stronger claim on it —
it is the page about the hands that feed a family, and the girl is the reason the business
exists. `few-grams` could be the same family with the tray on a kitchen counter rather than a
table, or the neighbours the copy mentions.

### 7. `doubt` no longer shows the thing it is about

Page 4 is the page where the organic label stops being trusted. Its caption is **"A label is a
promise made by a stranger."** The picture used to carry exactly that: a bunch of greens with a
paper tag reading `ORGANIC`, held up next to a phone showing the news.

The replacements on 22 Sep 2026 drop the tag. What is left is a worried woman holding
microgreens, which is a different sentence — the argument has no object in the frame any more.
That also removed the last non-brand English from the page, which is why the count above went to
four, so the swap traded a real gain for a real loss.

A `few grams` box appeared on the counter in the 20:40 cut and was taken out again at 20:45, so
that part is settled. What is left is the tag, and one consequence of losing it:

- **It shows microgreens three pages before the story reaches them.** Page 5 is "What if we grew
  it ourselves?"; page 4 is meant to be the dead end that makes page 5 a discovery. Handing her
  the answer early flattens the turn — and with the tag gone there is nothing else in her hand
  for the page to be about.

The fix is one more regeneration in the new style with the tagged supermarket bunch back in
place of the microgreens: a shop-bought bundle of leafy greens, stems tied, with a small kraft
tag reading `ORGANIC` hanging off it — held up and looked at, not held out. Nothing else about
the picture needs to change.

### 8. `germinate` is sparse

Bare cocopeat is visible behind the front row of sprouts, and the tray reads as a narrow window
box. Real microgreens germinate shoulder to shoulder. Worth one more pass with *dense carpet of
hundreds of sprouts, no bare medium visible, wide flat tray*.

## Which image is which page

| File | Page | Notes |
|---|---|---|
| `cover.webp` | 1, the hands that feed a family | replaced 22 Sep; **byte-identical to `few-grams` — see problem 6** |
| `engineers.webp` | 2, we build software by day | replaced 22 Sep; the couple at a desk at night, heavy baked-in English |
| `concern.webp` | 3, too much of the wrong stuff | children with packaged snacks |
| `doubt.webp` | 4, then we read the news | replaced 22 Sep ×3; **lost its `ORGANIC` tag — see problem 7** |
| `turning-point.webp` | 5, what if we grew it ourselves | replaced 22 Sep; the couple holding pulled greens |
| `few-grams.webp` | 6, that is how Few grams came to be | replaced 22 Sep; the family at a tray, no baked-in text |
| `seed.webp` | 7, nothing good grows from a doubtful seed | replaced 22 Sep; seed names and `Quality Check` baked in |
| `clean.webp` | 8, we clean like it is going onto our own child's plate | replaced 22 Sep twice; `70% Isopropyl Alcohol` baked in — **see problem 5** |
| `sow.webp` | 9, fresh cocopeat every single tray | replaced 22 Sep; the couple sowing by hand, no baked-in text |
| `germinate.webp` | 10, dark first then light | watercolour, regenerated 22 Sep |
| `harvest.webp` | 11, cut on the day it reaches you | replaced 22 Sep; branded boxes, brand mark baked in on purpose |
| `reset.webp` | 12, every tray goes back to zero | replaced 22 Sep; `Old Cocopeat Waste` baked in — **see problem 5** |
| `closing.webp` | 13, better food, healthier families | the one photograph in the set |

`closing.webp` being a photograph is a deliberate exception: the book has ended, and a real
photograph after thirteen illustrations reads as *and here is the actual thing*. Do not add a
second one mid-book.
