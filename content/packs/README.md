# Starter pack content

One file per starter pack (SPEC §29). **Every word a visitor reads about a pack
lives here**: `name`, `badge`, `tagline`, `description` and at least three
`highlights`, in both `en` and `kn`. Admin → packs owns only the numbers: the
price, which rack, tray and cocopeat go in and how many, how many seeds the
customer picks and from how many, the consultation flag, order, featured and
active.

Loader: `src/lib/content/packs.ts`. Shape enforced by
`src/lib/content/pack-contract.ts` and its test.

## These files decide which packs exist

Admin → packs renders **one card per file in this folder** and creates or
deletes nothing. A fourth pack is a fourth file here — a reviewed change —
then its numbers on the admin card. Files beginning with `_` are ignored, so
`_template.json` can live here.

The filename is the **content key**: lowercase letters and single hyphens, no
digits (`single-rack-pack`, never `rack-pack-4`). It is also the URL —
`/shop/packs/single-rack-pack` — and the first part of the cart key.

## What the copy must not say

The contract test fails on any of these, in either language:

- **A price.** Typed in admin and printed on the column.
- **A weight.** "100 g of each" is printed from the cart's unit; a cocopeat
  block's kilos are in its own name.
- **The city.** The on-site consultation line is chrome
  (`shop.packs.consultOnSite`), shown only for a pack whose `onSite` flag is
  set. In the copy it would promise a visit for a pack that offers none.

Counts are not regex-checked, but the tray, seed and rack counts are printed
from the admin numbers under "What's inside". Say what the pack is **for** —
"for growers who mean to sell what they cut" — not how many of each it holds,
or the copy goes stale the first time a count is tuned.
