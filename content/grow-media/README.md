# Grow media content

One file per item. **Every word a buyer reads lives here**, not in DynamoDB
and not in a component. `/admin/grow-media` owns the numbers: the price of one
block, the days it takes to arrive, and six courier packing figures.

Loader: `src/lib/content/grow-media.ts`.
Contract: `src/lib/content/grow-media-contract.ts`. SPEC §24.

## What this category holds

Cocopeat for now — IFFCO Urban Gardens' **Horti-Coir**, low-EC, in a 5 kg and
a 10 kg compressed block. The category is labelled **"Grow media"** so perlite,
vermiculite or coco pellets can join as a file and an admin row without a
rename. Everything here is sold the way a tray is (`content/trays/README.md`):
nothing held, every order placed with the maker when it arrives.

## Naming

The filename is the content key and the URL segment:

```
content/grow-media/horti-coir.json   →   /shop/grow-media/horti-coir
```

Lowercase kebab-case, **no digits** — so a pack size goes in words
(`horti-coir-bulk` is the 10 kg block), never `horti-coir-10kg`. Files
beginning with `_` are ignored.

## The template

| Field | What it is |
|---|---|
| `name` | Short form for the card, the cart and the order. Say the size — two blocks differ only by weight |
| `shortDescription` | One line of judgement: who should buy this size rather than the other |
| `specs` | At least four rows: what is in the pack, what it is made of, its grade, how far it expands |
| `howToUse` | At least three steps, in order: how to soak and prepare the block. The maker's method, restated |
| `whyTitle`, `why` | **Required.** A heading and a few paragraphs on what this medium's grade does for a plant — for Horti-Coir, "Why low EC matters". Mechanism, not promise: no yield figure, no day count, nothing about the food |
| `ourNote` | **Required.** Why we recommend it — how we use it ourselves, first person. The "Recommended by Fewgrams" badge on every card stands on this, so only list a medium we actually grow in |
| `imageAlt` | Optional; falls back to the name |

`howToUse` is the one field a tray does not have: a block of coir is not
usable until it has been soaked and broken up, and the water it takes tells a
buyer how big a bucket they need.

## What not to write

- **No price and no day count.** Both are printed from DynamoDB and both get
  tuned; the contract test scans for them in both languages.
- **None of the maker's marketing claims** — "100% organic", "anti-fungal".
  We cannot substantiate them on IFFCO's behalf. State what the block is made
  of, and attribute a rating to the maker when you give one ("low EC — the
  maker's rating").

## Adding one

1. In admin → grow media, type a key and set the price and the lead days.
2. Create `content/grow-media/<key>.json` from `_template.json`, all five
   fields in **both** `en` and `kn`.
3. Add its row to `scripts/grow-media-fill.mjs` — the parity test fails
   otherwise.
4. Photographs are optional, in `public/grow-media/<key>/`.
