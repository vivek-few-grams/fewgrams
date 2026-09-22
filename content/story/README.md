# The storybook — `content/story/book.json`

Every word on `/how-we-grow`, in both languages. SPEC §18.5.

## One file, not one per page

Every other catalogue here is `content/<type>/<key>.json`, one file per item, because those items
are a **set** — varieties are added and retired independently and nothing about radish implies
anything about sunflower.

A book is a **sequence**. Page four only makes sense after page three, and the likeliest edit is
reordering or inserting rather than adding something unrelated. Split across thirteen files that
order has to be restated as a `sortOrder` in each of them, which is how you end up with two pages
numbered 7 and nobody noticing. So the order lives in the one place it cannot be written twice:
the `pages` array at the top of the file.

## Shape

```jsonc
{
  "pages": [                                   // the running order, and the only place it exists
    { "key": "cover", "image": "cover.webp" }
  ],
  "en": {
    "cover": {
      "eyebrow":  "Our story",                 // the small line above the heading
      "heading":  "A few grams. A whole generation.",
      "body":     ["…", "…"],                  // one entry per paragraph, at least two
      "caption":  "…",                         // the line under the illustration, half a dozen words
      "imageAlt": "…"                          // required — the picture is half the page
    }
  },
  "kn": { "cover": { /* the same five fields, all of them */ } }
}
```

| Field | Rule |
|---|---|
| `pages[].key` | kebab-case letters, **no digits** — the same rule every content key obeys |
| `pages[].image` | a filename in `public/story/`, `.webp` only |
| `en` / `kn` | one block per key in `pages`, all five fields, in the order above |

### The caption earns its place

The illustration is a landscape sitting on a leaf that is taller than it is wide, so there is paper
left over under every picture. The caption is what goes there instead of a gap — without it the
left leaf is a picture floating in an acre of cream, which reads as a layout bug rather than a
book.

**Distil the page, do not summarise it.** The right leaf already says the thing at length, and
reading the same sentence twice across one spread makes the book feel padded. "Scissors, not
machines." earns its line; "We harvest at peak and pack straight into a clean box" does not.

### There is no paper colour to set

Every page is cream. `pages[]` used to carry a `ground` of `light | dark`, set to `dark` on the
two pages where the story drops its voice; it is gone, and the contract **rejects** a page that
still declares it, so a stale edit fails loudly instead of quietly doing nothing. Re-introducing
two papers means putting the field, its check and its branch back together — not setting a key and
hoping.

## Adding or moving a page

1. Add the illustration to `public/story/` through the webp pipeline (see the README there).
2. Add a row to `pages` **where it belongs in the story**, not at the end.
3. Write its `en` block, then its `kn` block. Both, in the same commit — see below.
4. `npx vitest run src/lib/content/story-contract.test.ts`.

Reordering is moving one line in `pages`. Nothing else knows the order.

## What the contract enforces, and why

`src/lib/content/story-contract.test.ts` fails on all of these at once rather than one at a time:

- **A key used twice.** Two pages under one key silently share one block of words and the second
  wins, so a page renders the wrong text rather than failing.
- **A `kn` block that is missing, short a field, not actually in Kannada, or a verbatim copy of
  the English.** The runtime falls back to English field by field, which is right behaviour and
  exactly why a gap is invisible — a Kannada reader turns a page and hits four English paragraphs
  with nothing to tell them why.
- **Words left behind for a page that was deleted.** Either a leftover or a typo in a key that is
  currently falling back to English.
- **An illustration that is not on disk.** Invisible in a unit test, obvious to a visitor.
- **A grow duration or a price in the copy.** `growDays` is tuned from the admin screen and
  printed on the variety page; a day count written in here goes stale the first time the owner
  retunes it, and this is the most-read prose on the site to be wrong in. Describe the *signal*
  ("the day the leaves are fullest"), never the count. "The same day" and "every day" are fine —
  they are claims about the operation and cannot drift.

## What is deliberately not enforced

Prose length, tone, or how many paragraphs beyond two. A contract on structure is useful; a
contract on style is a straitjacket.

## Claims

**No page may make a nutrient claim** — not "rich in", not "40× more", not a percentage. A nutrient
content claim has to be backed by analysis under the FSS (Advertising and Claims) Regulations 2018,
and this page is where the temptation is greatest because it is the page people actually read. The
argument the book makes is a different kind of statement and a stronger one: *you can see it grow.*
That needs no substantiation because it is a description of the operation, not of the food.

There is no test for this. It is a judgement call on wording, and a regex that tried would either
miss the real cases or fail on honest sentences.
