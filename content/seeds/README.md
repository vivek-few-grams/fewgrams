# Seed content

One file per seed. **Every word a buyer reads about a seed lives here**, not in
DynamoDB and not in a component. The admin UI owns two numbers: what 50 g
costs, and how many grams are on the shelf.

**Only the first of those two is ever shown.** The grams held are internal,
but since 25 Sep 2026 they are the limit: a customer can order up to what is
held, in 50 g packs, and under 50 g the seed shows as sold out (SPEC §22.2).
Everything ships next day. Nothing in this folder should state a quantity we
hold, the price, or a dispatch promise — the page prints those.

Loader: `src/lib/content/seeds.ts`. Contract: `src/lib/content/seed-contract.ts`.
SPEC §22.4, and the same split as `content/varieties/` for the same reasons
(SPEC §4.3).

## Naming

The filename is the **content key**, and it is also the public URL segment:

```
content/seeds/sunflower.json   →   /seeds/sunflower
```

Plain lowercase kebab-case, no digits, 60 characters max. Files beginning with
`_` are ignored, so the template can live here without becoming a seed.

**Seed keys and variety keys are separate namespaces.**
`content/seeds/radish.json` and `content/varieties/radish.json` are two
different things to buy — a bag of seed and a punnet of cut greens — with two
pages, two prices and two records. Nothing needs to keep them apart except the
cart, which keys a line on kind *plus* content key (`src/lib/cart/cart.ts`).

## The shelf as it stands

Eighteen seeds, loaded from the owner's supplier price list on 17 Sep 2026
(SPEC §22.7). The prices live in `scripts/seeds-fill.mjs`, which is the one
place that list is written down:

```bash
node --env-file=.env.local scripts/seeds-fill.mjs --dry           # preview
node --env-file=.env.local scripts/seeds-fill.mjs                 # write prices
node --env-file=.env.local scripts/seeds-fill.mjs --markup=40      # +40% on the list
node --env-file=.env.local scripts/seeds-fill.mjs --reset-stock    # also set stock
```

It is additive and re-runnable: a matching row keeps its `id` and its `active`
flag, and **`stockGrams` is never overwritten without `--reset-stock`**,
because stock is what the owner counted and a script should not quietly
replace a counted figure — and since that figure now sets a delivery promise,
overwriting it wrongly would mis-date real orders rather than just mis-state a
shelf. `src/lib/seeds/script-parity.test.ts` fails if a
priced key has no content file or a written file has no price.

## Adding a seed

Either order works.

1. In **admin → seeds**, type the key, the price per 50 g and the grams you
   hold.
2. Copy `_template.json` to `<key>.json` and fill in every field, in **both**
   `en` and `kn`.
3. Photographs are optional. Drop them in `public/seeds/<key>/` and name them
   in `images` when they exist; until then the page shows the Sprout mark.

Until step 2 is done the admin row is flagged in red with the exact path, and
the seed stays off the site rather than appearing nameless.

## Shape — the variety template, adapted to a seed

Same engine (`src/lib/content/content-contract.ts`), same test discipline,
different fields. A seed is bought to be sown, so:

| Field | Kind | Notes |
|---|---|---|
| `name` | text | include the type where a grower cares — "Sunflower (black oil)" |
| `shortDescription` | text | one line, used on the card |
| `description` | text | blank lines split paragraphs |
| `sowing` | text | soak, sow rate, blackout, when to uncover — the main event for a seed |
| `specs` | 4+ rows | `{ label, value }` — germination, treatment, soak, sow rate, harvest window |
| `specsNote` | text | how firm those figures are; germination is lot-by-lot |
| `uses` | 2+ strings | what the seed is *for* |
| `cautions` | 1+ strings | storage, allergens, and that seed for sowing is not packed as food |
| `faq` | exactly 5 | `{ question, answer }` |
| `imageAlt` | text | falls back to the name if the photo is missing |

Differences from the variety template, both deliberate:

- **`images` is optional.** The packet photography does not exist yet, and a
  contract that failed on it would block the copy being written.
- **A day count is allowed in the prose.** Varieties may not state one, because
  `growDays` lives in DynamoDB and would contradict it. A seed has no such
  field, and "uncover on day two" is the advice a grower wants.

`src/lib/content/seed-contract.test.ts` runs the contract over every file in
this folder, checks the field order, and checks that every Kannada string is
actually in Kannada rather than a pasted copy of the English.
