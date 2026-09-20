# Tray and drainage content

One file per item. **Every word a buyer reads lives here**, not in DynamoDB and
not in a component. `/admin/trays` owns two numbers: the price of the pack, and
how many days it takes to arrive.

Loader: `src/lib/content/trays.ts`.
Contract: `src/lib/content/tray-contract.ts`. SPEC §23.2, and the same split as
`content/seeds/` for the same reasons (SPEC §4.3).

## What this category holds, and why it is one folder

Trays **and drainage cells**, which are not the same object. They share a
folder, a record shape and a screen because they are sold identically: nothing
is held in stock, every order is placed with a supplier when it arrives, and
each is a pack at a fixed price. The customer-facing label is
**"Trays & drainage"**, which is what the owner calls it.

## Naming

The filename is the **content key**. It names this file, identifies the
DynamoDB row, and since 17 Sep 2026 it is also the URL segment of the item's
detail page:

```
content/trays/drain-cell-mat.json   →   /shop/trays/drain-cell-mat
```

Plain lowercase kebab-case, no digits, 60 characters max. Files beginning with
`_` are ignored, so the template can live here without becoming an item.

Keys are their own namespace, like seeds. `content/trays/radish.json` would not
collide with the seed or the green of that name — `keys.test.ts` pins that.

## The template — four fields, and that is the point

| Field | What it is |
|---|---|
| `name` | Short form, used on the card and later in the cart. Two tray kits differ only by their plastic, so the name has to tell them apart |
| `shortDescription` | **One line of judgement**, not a restatement of the specs: who should buy this one rather than the other |
| `specs` | At least four rows: what is in the pack, the size, the thickness, the material |
| `imageAlt` | Optional; falls back to the name |

No `description`, no `faq`, no `specsNote`. A variety has those because a
person decides what to eat by reading; a tray is decided by four facts and one
sentence. A borrowed seed template would have demanded five FAQs about a sheet
of moulded plastic, and the way that request gets met is with padding.

**The detail page did not change this.** It renders these same four spec rows
as its headline facts, plus a gallery and a buy box, and nothing else — "very
minimal" was the instruction (SPEC §23.3). So the four rows are doing double
duty, on the card and on the page, which is another reason to keep them
factual and short.

`specsNote` is the omission worth explaining: a seed has one because
germination is a lot-by-lot fact and a buyer should know how firm the figure
is. A tray's 60 × 30 cm is 60 × 30 cm. The field would invite a hedge where
there is nothing to hedge.

## Never write the price or the lead time into a spec row

Both are printed on the card from DynamoDB and both get tuned — the price when
the supplier's does, the lead time when a supplier gets slower. Copy that
restates either makes the card contradict itself. This is the same rule that
keeps `growDays` out of variety copy (SPEC §4.3).

The figures that *do* belong here are the **supplier's own and do not change**:
a 3 mm wall is 3 mm forever. That is why they get a file and a git diff rather
than an admin field.

## Adding one

1. In admin → trays, type a key and set the price and the lead days.
2. Create `content/trays/<key>.json` — all four fields in **both** `en` and
   `kn`. Copy `_template.json`; the contract test enforces parity, that the
   Kannada is actually Kannada, and that it is not a copy of the English.
3. Photographs are optional, and both kinds go in `public/trays/<key>/` —
   see the README there for the shapes and the build commands.
   `images.cutout` is the **card**, transparent so the panel colour and the
   marquee show through it; `images.hero` is the **gallery**, flattened onto
   the frame's own ground. `images.gallery` adds further angles, and the
   detail page's thumbnail strip appears once there is more than one shot.
   With neither, both surfaces fall back to the brand mark rather than a
   broken image, so photography can land one item at a time.

Until the content file exists the admin row is flagged in red with the exact
path and the item stays off the site.

## What is here

Three items, loaded on 17 Sep 2026 from the two supplier pages the owner
supplied, and photographed the same day — one shot each, cut out on
transparency (SPEC §23.8). The prompts are in `docs/TRAY_PROMPT.md`.

The owner's photographs settled one thing the listings did not: **the standard
kit is black.** Bazodo's page for it gives the size, the wall thickness and the
material and never names a colour, so `imageAlt` described it without one until
the picture arrived. The prices are the suppliers' own listed figures — see
`scripts/trays-fill.mjs`, which is the one place that list is written down, and
SPEC §23.6 for the open question of whether they are sell prices or costs.
