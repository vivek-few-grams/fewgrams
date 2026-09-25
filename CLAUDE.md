@AGENTS.md

# Fewgrams project rules

Full specification: `docs/SPEC.md`. Local setup: `docs/LOCAL_DEV.md`.

## No hardcoded text. Ever.

**Every string a user can see comes from a translation file. No exceptions.**

When you introduce any new text:

1. Write the **English** wording first and put it in the right file under
   `messages/en/<area>.json`.
2. Reference it with `useTranslations` (client) or `getTranslations` (server).
3. Add the Kannada wording to `messages/kn/<area>.json`. **Required, not
   optional** — `src/i18n/messages-parity.test.ts` fails on a missing key, on a
   Kannada-only orphan, and on a value copy-pasted from English. The English
   deep-merge is a runtime safety net so a gap never renders a raw key; it is
   not a licence to leave the gap. `admin.json` is the one exempt namespace.

**One file per area**, so a change to the shop cannot conflict with a change to
checkout and a translator can be handed a single file:

| File | Covers |
|---|---|
| `common.json` | Header, nav, footer, categories, shared counts |
| `home.json` | Hero, PIN check, process strip, trust band |
| `plans.json` | Bundle cards and the rotation panel |
| `shop.json` | `/shop`, `/shop/[category]`, `/shop/trays`, `/shop/grow-media` and their detail pages (SPEC §23, §24) |
| `microgreens.json` | `/microgreens` and variety pages |
| `seeds.json` | `/seeds` and seed pages (SPEC §22) |
| `story.json` | `/how-we-grow` — **chrome only**; the book's thirteen pages are editorial copy and live in `content/story/book.json` (SPEC §18.5) |
| `cart.json` | `/cart` — the ad-hoc basket (SPEC §18.6.1) |
| `checkout.json` | `/checkout` — address, total and the pay button (SPEC §9.2) |
| `auth.json` | Login, verify, forbidden |
| `account.json` | `/account` and its profile, addresses and orders screens |
| `admin.json` | Admin shell and screens — **English only by design** (SPEC §4.4 scopes Kannada to customer-facing pages) |

This covers **UI chrome**. Editorial copy belongs in `content/` instead, per
SPEC §4.3. `LocalisedString` names in DynamoDB (SPEC §4.4) are now the
**exception, not the rule**: varieties, plans, seeds and trays all keep every
word in a content file, and only `Product` — snacks, which nothing writes yet —
still takes a typed name. See below.

## Variety text never comes from DynamoDB or the admin UI

One file per variety, `content/varieties/<contentKey>.json`, holding every word
a visitor reads: name, description, flavour notes, nutrition, growing tips,
image alt. DynamoDB holds only the numbers the business tunes — price, yield
per tray, grow days, seed rate, tier, active.

A variety is a microgreen sold **by the 100 g** for ad-hoc orders. Its record
holds nothing else — no `tier`, no plan reference. Plans reference varieties;
varieties know nothing about plans.

Add one in either order:

1. In admin → varieties, type a key (`red-amaranth`) and set the numbers.
2. Create `content/varieties/red-amaranth.json` — all eleven fields in
   **both** `en` and `kn`. Copy `_template.json`; three tests enforce parity.
3. Drop photos in `public/varieties/red-amaranth/`.

Until the file exists the admin row is flagged in red with the exact path, and
public pages skip it. Shape and reasoning: `content/varieties/README.md`.

- **Keys are plain kebab-case** — `radish`, `red-amaranth`. No UUID suffix; the
  UUID is the DynamoDB `id` and nobody needs to see it.
- **To rename a variety, edit `en.name` in its file.** The filename, URL,
  DynamoDB id and historical orders all stay put. Renaming the *key* means
  renaming the file, updating it in admin, and adding a redirect.
- **Images are named in the content file, never stored in the database.** They
  resolve through `varietyImageUrl()` so the move to CloudFront is one change.

## Seed text does not either — same rule, own folder

`content/seeds/<contentKey>.json`, loaded by `src/lib/content/seeds.ts`.
DynamoDB holds **two numbers**: price per 50 g and grams held. Admin →
seeds has no text input at all.

- The fields differ from a variety's, because a seed is bought to be sown:
  `sowing` where a variety has `growingTips`, `specs` where it has `nutrition`,
  `uses` where it has `benefits`. Contract: `seed-contract.ts`; full table in
  `content/seeds/README.md`.
- **`content/seeds/radish.json` and `content/varieties/radish.json` are two
  different products.** Only the cart has to keep them apart, and it does it by
  keying a line on **kind + content key** (`src/lib/cart/cart.ts`). Never key
  cart, order or stock logic on the content key alone.
- Photographs are optional here (the packet photography does not exist yet);
  for a variety they are required.
- **Stock lives in one module, and it is the limit** (the owner, 25 Sep 2026 — it was a speed
  from 17 Sep). `src/lib/seeds/stock.ts` owns the **50 g** minimum (= the cart unit,
  `GRAMS_PER_UNIT`), `seedMaxUnits` and `seedReadyDate`. A seed can be ordered up to what is held,
  in 50 g packs; **under 50 g it is sold out**. Every seed ships next day — there is no vendor
  route. The price is **per 50 g** (`pricePer50g`). Do not re-derive
  `Math.floor(grams / 50)` or compare grams to stock at a call site.
- **The grams held are never shown to a customer.** They are on
  `/admin/seeds` and nowhere else.

## Tray and drainage text does not either — same rule, own folder

`content/trays/<contentKey>.json`, loaded by `src/lib/content/trays.ts`.
DynamoDB holds **two numbers**: the price of the pack and the packs held
(`stockPacks`). Admin → trays has no text input at all.

- **Four fields only**: `name`, `shortDescription`, `specs` (≥4 rows),
  `imageAlt`. No `description`, no `faq`, no `specsNote` — a tray is decided by
  four facts and one sentence. The detail page (`/shop/trays/[key]`, SPEC
  §23.3) renders those same four spec rows as its headline facts and adds a
  gallery and a buy box; it does **not** repeat them as a table underneath.
  Contract: `tray-contract.ts`; full notes in `content/trays/README.md`.
- **The category is "Trays & drainage"** and it holds both. A drain cell mat is
  not a tray; it is the same *kind of thing to sell* — held in stock, one price
  per pack — and one row shape serves both (SPEC §23.1).
- **Held in Bengaluru, and stock is a speed, not a limit** (the owner, 25 Sep
  2026 — until then nothing was held and every order waited on a 7-day
  supplier lead time, now retired). Up to the packs held ships next day; more
  still sells, **one day later** while it is brought in (`RESTOCK_EXTRA_DAYS`).
  Nothing sells out. A paid order takes its packs off the count
  (`takeFromStock`). The count is never shown to a customer.
- **The rule lives in one module.** `src/lib/trays/lead-time.ts` owns
  `fromShelf`, `heldReadyDate` and `RESTOCK_EXTRA_DAYS`. Do not compare units
  to stock at a call site.
- **Never write the price or a dispatch day into copy.** The price is printed
  from DynamoDB and the date from the rule; the contract test scans for a
  rupee figure or a day count in either language.

## Grow media text does not either — tray rules, own folder

`content/grow-media/<contentKey>.json`, loaded by `src/lib/content/grow-media.ts`
(SPEC §24). Cocopeat — IFFCO Urban Gardens' Horti-Coir — is sold exactly as a
tray is: held in stock, one price per block, a stock count and six packing
figures per row, all on `/admin/grow-media`. Everything in the tray section
above applies, with these differences:

- **Its own entity, folder and cart kind** (`GrowMediumEntity`, `media`, cookie
  code `m`), not a tray row. The category key is `media`; the URL is
  `/shop/grow-media`.
- **Eight fields**: the tray's four plus `howToUse` (≥3 steps), because a
  block has to be soaked before it is usable; `whyTitle` and `why`, what the
  grade does for a plant ("Why low EC matters" — mechanism, never a yield
  figure or a day count); and **`ourNote`** — how we use it ourselves.
  Contract: `grow-media-contract.ts`.
- **The /shop tile is a category picture, not the IFFCO pack**
  (`public/shop/grow-media-block-cutout.webp`), and its marquee scrolls properties
  of coir (`GROW_MEDIA_TILE_WORDS`, `shop.growMedia.tileWords`) rather than
  the two long product names. Labels only — no claim, no tuned figure.
- **Presented as what we grow in, not as resale** (the owner, 24 Sep 2026).
  Every card and detail page carries a "Recommended by Fewgrams" badge
  (`RecommendedBadge`), and `ourNote` is required so the badge is always
  backed by our own words. Only list a medium here that we actually use.
  Customer copy says it is kept in stock here, never "bought in from the
  maker". The "Made by" spec row stays — the brand is on the pack.
- **One row per pack size** — `horti-coir` (5 kg), `horti-coir-bulk` (10 kg).
  Content keys ban digits, so a size never goes in the key.
- **Stock is dated by the tray rule** — `src/lib/grow-media/lead-time.ts`
  re-exports it. Do not compare units to stock at a call site.
- **Do not copy the maker's claims** ("100% organic", "anti-fungal") into
  copy; state what the block is and attribute the maker's own rating.

## Plan text does not come from DynamoDB either

Same rule, same reason, one file per plan: `content/plans/<contentKey>.json`,
holding `name`, `tagline`, `description` and at least three `highlights`, in
**both** `en` and `kn`. Shape enforced by `src/lib/content/plan-contract.ts`;
full notes in `content/plans/README.md`.

DynamoDB holds only what the business tunes — `monthlyPrice`, `gramsPerBox`,
`sortOrder`, `recommended`, `active` — plus the four rotation weeks. Admin →
plans has **no text input at all**, and the rotation is picked from a
**searchable multi-select of varieties per week, never typed**.

**There are three plans and only three** — Everyday Essentials, Rare & Exotic
and Pick Your Own — defined by the three files in `content/plans/`. Their
**keys stay `essential`, `exotic`, `build-your-own`**: a key is an identifier
and a display name is a label, and renaming the label is one string in one file
(SPEC §5.1.1). Admin → plans therefore
**creates and deletes nothing** — it renders a row per content file and saving
one upserts its numbers. A fourth plan means a fourth content file, not a form
submission.

**The card's ground colour is derived, not stored.** `planPanels()` in
`src/lib/types.ts` gives the **recommended** plan `forest` and hands `sage`
then `sand` to the rest in card order — so moving the `recommended` flag in
admin moves the dark card with it. Every colour that changes with the ground
lives in one `PanelTone` row per ground in `Bundles.tsx`; add a ground and you
add a row, not nine ternaries.

- `highlights` was the proof the old design was wrong: a plain `string[]` in
  DynamoDB, so the Kannada home page rendered the English bullet list.
- **Never write the price or the box weight into plan copy.** Both are printed
  on the card from DynamoDB and both get tuned, so copy that restates them
  makes the card contradict itself. The contract test fails on it, in both
  scripts.
- A plan with no content file is **skipped** on the home page and flagged in
  red in admin, exactly like a variety.

## The storybook is a sequence, so it is one file

`content/story/book.json` holds all thirteen pages of `/how-we-grow`, in both
languages, loaded by `src/lib/content/story.ts`. It is the **one content file
that is not one-per-item**, and deliberately so: a catalogue is a set, a book
is an order. Split across thirteen files the running order has to be restated
as a `sortOrder` in each of them, which is how two pages end up numbered 7.
The order lives in the `pages` array and nowhere else.

- **No DynamoDB, and no admin screen.** Nothing on the page is a number the
  business tunes — no price, no lead time, no count — so there is nothing for
  a row to hold. Edited in git, reviewed in a diff.
- **No grow duration in the copy**, same rule as variety text and enforced the
  same way. `growDays` is tuned in admin and printed on the variety page; a day
  count here goes stale the first time it is retuned. "The same day" and "every
  day" are fine — they are claims about the operation, not the crop.
- **No nutrient claim, on any page.** Not enforceable by regex, so it is a
  review rule: a nutrient content claim needs analysis behind it under the FSS
  (Advertising and Claims) Regulations 2018, and this is the page where the
  temptation is greatest. The book's actual argument is stronger anyway — *you
  can see it grow* describes the operation, not the food.
- **The plain stack is the server render**, and the 3D book is the
  enhancement, gated on `lg` **and** `prefers-reduced-motion: no-preference`.
  Same call `Reveal` makes: if the book were the server render, a visitor with
  no JavaScript would get thirteen leaves piled on one another and a
  one-page story. The failure mode has to be "no page-turn", not "no content".
- **A spread's two halves come from different sheets.** Leaf `k` carries page
  `k`'s words on its front and page `k+1`'s *illustration* on its back, because
  that is how a bound book works — the left page is the back of the sheet you
  already turned. The payoff is that no face is rendered twice, so nothing
  needs `aria-hidden` to stop the book being read out to a screen reader
  twice, and DOM order is reading order.
- **One paper colour, and therefore no field for it.** Every page is cream.
  There was a `ground` of `light | dark` while two pages were set apart for
  emphasis; once the book settled on one paper it had one reachable value,
  which is worse than no field — a schema that offers a choice nobody can make
  invites the next person to set it and wonder why nothing happened. The
  contract now *rejects* a page that declares it, so a stale edit fails loudly
  rather than quietly doing nothing.
- **The folio is printed once per spread, not once per leaf**, and it reads
  `3 / 13` rather than a bare numeral. A "page" here is a whole spread, so both
  leaves carry the same number; printing it on each put two identical figures
  on one screen and read as a bug.
- **A plate is rendered at its natural size, never stretched into a box.**
  `story.ts` reads each illustration's real pixels out of the WebP header. The
  masters run 1.34 to 3.0, so one fixed `aspect-[3/2]` frame letterboxed half
  of them and put cream bars down the sides of the rest. Measured, not
  declared — a number in the content file can disagree with the file it
  describes and nothing fails.
- **A plate's URL carries `?v=<mtime>`, and it is load-bearing.** Artwork is
  replaced in place, so the URL never changes on its own — and `next/image`
  answers the browser's revalidation with a `304` off an ETag that does *not*
  track the source file, so the old picture stays on screen forever with the
  right bytes on disk. Verified: overwriting a file with entirely different
  content still returned `304` and the same ETag. `next.config.ts` lists
  `/story/**` in `images.localPatterns` so the query string is allowed; do not
  widen that pattern, because omitting `search` allows any query string and
  each distinct one is another entry in the optimizer's cache.
- **Do not add `sizes` to the book plate.** `width: auto` on a replaced
  element uses the *density-corrected* intrinsic width, which with a
  `w`-descriptor srcset comes from `sizes` rather than from the file — it
  rendered every plate at 450px instead of filling the leaf. The mobile card
  sets `w-full` so it is unaffected and keeps its `sizes`.
- **A plate has no border and no soft edge.** A radial-gradient mask that
  dissolved each rectangle into the paper was built and removed the same day
  (22 Sep 2026), in two tunings — it read as a blur rather than as torn paper,
  and it ate whatever the illustration had near its edge. The masters are
  already on near-white backgrounds and meet cream paper on their own. If it
  comes up again: the argument for it was that thirteen hard rectangles read
  as thirteen screenshots, and that turned out not to be what a reader sees.

## No city name in customer copy

The owner's rule, 24 Sep 2026: **Bengaluru is not named anywhere a customer
reads** — say "our delivery area" or "selected areas". The area itself is a
district rule in `src/lib/pincode/area.ts`, not a place the copy should
promise; `brand.city` was removed so nothing can interpolate it back in.

## Contact details live in `content/contact.json`

Customer-care email, phone and WhatsApp — one file, loaded and checked by
`src/lib/content/contact.ts` (the owner's call over an admin screen, 24 Sep
2026). The footer and the outside-delivery-area card read it; `whatsapp: null`
hides every "WhatsApp us". **`brand.email` is not the care inbox** — it is the
sign-in sender in `src/auth.ts`, kept separate so changing one cannot break
the other.

## A cart unit is not always 100 g

`src/lib/cart/cart.ts` holds three kinds — `variety`, `seed`, `tray` — and a
line is **kind + content key + units**. What a unit *means* is the kind's
business:

| Kind | One unit | Priced |
|---|---|---|
| `variety` | one tray | per tray |
| `seed` | 50 g | per 50 g |
| `tray` | one pack (2 trays, or 5 mats) | per pack |

- **`isWeighed(kind)` is the only place that distinction lives.** Never write
  `kind !== "tray"`; the set is declared so a fourth kind has to decide rather
  than inherit a wrong default. `GRAMS_PER_UNIT` applies to weighed kinds only.
- **`CartItem.grams` is `number | null`** — null, not 0, for a pack-priced
  kind, so a page has to branch instead of printing "1 pack · 0 g".
- **`CartItem.unitPrice`, never `pricePer100g`.** The field held ₹160 for a
  pack of two trays under the old name.
- **A key can name three different products.** `content/varieties/radish.json`,
  `content/seeds/radish.json` and `content/trays/radish.json` would be three
  lines at three prices. Never key cart, order or delivery logic on the content
  key alone.
- **Every line has a delivery date, and the reason differs by kind** — grow
  days, the seed shelf, or a supplier lead time. `hydrateCart`'s internal
  `Timing` union is exhaustive on purpose; one order is still one trip on the
  slowest line's date (`latestDate`).
- **Nothing in the cart has a stock test.** `sellable()` asks two questions for
  all three kinds: is the row active, and does it have a content file.

## A cart line's key is not always a content key

`CART_KINDS` is `variety | seed | tray | rack | media`. All but `rack` are keyed by a
**content key** — the filename of a content file, lowercase letters and hyphens,
**no digits**. A rack has no content file and is keyed by its **SKU** plus its
colour: `rk-6f-5s-1.25x3-1.4-orange`.

- **Validate with `isValidKeyFor(kind, key)`, never `isValidContentKey` alone.**
  The latter rejects every rack. The two key sets are provably disjoint and
  `cart-key.test.ts` keeps them that way — if they ever overlapped, one string
  would address two products.
- **Do not loosen the content-key rule to fit a rack.** The digit ban is the
  whole point of it: `amaranth-2` is the naming failure it exists to prevent.
- **Colour belongs in the key**, because `RackConfig` has none and the cart has
  no per-line attributes. Two colours of one rack are two lines — two things to
  build. A pipe rack carries no colour segment at all.
- **A rack's name is composed at read time** (`rackLineName`), not stored: a
  model has no customer-facing name by design (SPEC §19.5). An *order* line must
  still snapshot it at purchase (§4.3); that is checkout's job, not this one's.

## A fourth kind means four branches, and `grams === null` is not the test

When a kind arrives, these are the places that decide something per kind. None
of them fails loudly if you miss it:

| Where | What it decides |
|---|---|
| `isWeighed` | whether the line has a weight at all — declared as a set so a new kind must choose |
| `isValidKeyFor` | which key rule applies |
| `Timing` in `cart/server.ts` | how the delivery date is worked out — a union, so a missed arm is a type error |
| `lineUnits` / `stepKey` / `lineTiming` / `lineHref` in `cart/page.tsx` | the unit, the stepper's aria-label, the reason for the date, and where the line links |
| `sellable()` in `cart/actions.ts` | what makes it orderable |
| `KIND_ICON` in `components/cart/KindIcon.tsx` | the line's icon — a `Record`, so a missed kind is a type error |
| `ParcelLine` / `parcelGrams` in `shipping/parcel.ts`, `toParcelLines` in `shipping/charge.ts` | how it is boxed and weighed for the courier — exhaustive switches |

**`item.grams === null` means "not sold by weight", not "a pack".** It was the
pack test while trays were the only unweighed kind, and a rack priced "per pack"
and counted in "packs" is the exact class of wrong number that survives review
because the code reads fine. Branch on `item.kind`.

## Money and weight placeholders are typed, always

`{price, number}`, never `{price}`. A bare placeholder is interpolated as a raw
string, so `Intl` never formats it and Indian digit grouping is lost — which
once put `₹1700` on the cart beside `₹1,700` on the variety page for the same
amount. Applies to price, amount, total, grams and days. A photo index or any
other non-quantity stays bare.

## Empty states are role-aware, and operator copy is admin-only

An empty catalogue is the one place operator copy leaks to customers. Three
screens told visitors to "add them in admin → varieties" and offered buttons
into `/admin/*` (fixed 15 Sep 2026, SPEC §8.2).

- The operator wording belongs in **`admin.json`**, never in a customer
  namespace, and it is **resolved only when `actor?.role === "admin"`** — so a
  customer's HTML never carries it.
- The customer wording says what is true and offers something they can act on.
  "Check back shortly" plus a link to what *is* buyable, not an instruction for
  a screen they cannot open.
- A client component cannot read `admin` messages (the root layout strips that
  namespace). Pass the resolved strings down as a prop that is `null` for
  non-admins — see `Bundles.tsx`.

## A card cut-out and a hero are two different pictures

Every catalogue grid that runs the §17.4 motion — `/microgreens`, `/seeds`,
`/shop/trays` — needs **`images.cutout`**, a transparent file. `images.hero` is
a photograph with its own background, for the detail page gallery. They are not
interchangeable, and `cutout` deliberately does **not** fall back to `hero`: a
picture carrying its own background dropped into the media box reads as a
skewed rectangle rather than a tilted product.

- **Build both with `scripts/cutout.py`**, never by hand. Framing is normalised
  in code because the generator ignores margin instructions. Defaults are the
  square variety job; `--aspect 3:2 --fill 0.88 --width 900` is the tray card
  and `--bg '#f2ebe3'` flattens a gallery hero from the same master. Reasoning
  in `public/trays/README.md` and `public/varieties/README.md`.
- **The fill percentage is set by the hover, not by taste.** The card scales the
  media 1.1, rotates it 4° and then clips, so the subject's padding is the only
  thing keeping its corners off the edge. Changing a card's size means
  re-padding the cut-out, not widening the media box.
- **A marquee must be taller than its panel.** The loop translates the block
  -50%, so one half has to overflow the card or bare panel crosses it once per
  cycle. `Marquee` pads the words to `minLines` for that reason; the default of
  ten is right for a **square** tile only. Size the type in **`cqw`** on any
  non-square panel, because a `clamp()` in `vw` stops scaling with the card as
  soon as the grid changes column count.
- **Pass `durationSeconds` whenever you change `minLines` or the type size.** A
  duration is not a speed: a taller block covers more ground in the same time,
  so a shared `8s` ran one card at 49px/s and another at 89px/s. The house speed
  is 48px/s and the formula is on the prop.
- **Both of those are pinned in `src/components/ui/marquee.test.ts`**, per call
  site, with the panel aspect and type fraction restated. Neither invariant
  shows up in a screenshot or a type check, and both have been shipped broken
  once. Add a row when you add a caller.
- **Marquee words carry no claim that needs substantiating.** A variety's are
  nutrient *labels* — "Vitamin C", never "High" — because a nutrient content
  claim has to be backed by analysis under the FSS (Advertising and Claims)
  Regulations 2018. A rack's are properties of the steel ("Powder coated"),
  which is a different kind of statement. Neither may restate a figure the admin
  screens tune: no price, no height, no shelf count, no lead time.

## Interactive affordance is a base rule, not a class

**Tailwind v4 removed `cursor: pointer` from buttons in Preflight.** A base
rule in `globals.css` puts it back for every `button`, `[role="button"]`,
`summary` and checkbox/radio `label`, plus a brand `:focus-visible` ring.

Do **not** add `cursor-pointer` to individual buttons — the class form
guarantees the next button someone writes is missing it. Every CTA does still
need its own `hover:` colour change and `transition-colors`.

## An icon in a circle is dark green with a white icon

`bg-forest text-cream` — never `bg-sage text-forest` (the owner's rule, 24 Sep
2026: light-green circles read washed out). On a ground that is already
forest, use `bg-forest-deep text-cream`. Sage stays for **text** chips and
toggles ("Default", admin status labels), which are words, not icons.

## Confirm destructive actions with `ConfirmSubmit`, never `window.confirm`

`src/components/ui/ConfirmSubmit.tsx`. Native `confirm()` cannot be styled,
renders as "localhost:3005 says", and is suppressible by the user — which
would silently turn a guarded delete into an unguarded one. Render it inside
the `<form>` whose action it should submit, and pass every string already
translated.

## Keep `admin` messages out of the public bundle

`NextIntlClientProvider` with no `messages` prop serialises the whole
catalogue into every page. The root layout therefore passes every namespace
**except `admin`**, and `admin/layout.tsx` re-provides the full set for its
own subtree. Add a namespace only operators should see and it belongs behind
that second provider, not the root one.

### Things that count as user-visible text

`aria-label`, `title`, `alt`, `placeholder`, button labels, validation
messages, empty states, metadata titles and descriptions, email copy. If a
human can read it, it is a message.

### Import `Link` from `@/i18n/navigation`, never `next/link`

The locale lives in the URL (`/kn/shop/trays`). A raw `next/link` drops a
Kannada visitor back into English mid-journey. Same for `redirect`,
`usePathname` and `useRouter`.

### Watch for the `t` collision

`t()` from `@/lib/types` resolves a `LocalisedString` from DynamoDB; `t` from
next-intl resolves a message key. They are different things. Import the former
as `localised` in any file that needs both.

## An order is paid only by `settleOrder`

`src/lib/orders/settle.ts`. The browser redirect and the webhook each only
**name** an order; `settleOrder` asks Cashfree server to server and pays it
only when the gateway calls it `PAID` **and** an attempt succeeded for exactly
the order's total (SPEC §9.2). Never mark an order paid anywhere else, and
never read an amount, a status or a line from the browser or from a webhook
payload.

- **The gateway sits behind `PaymentProvider`** (`src/lib/payments/`). Business
  code never imports `cashfree.ts` directly.
- **The couriers sit behind `ShippingProvider`** (`src/lib/shipping/`), the same way —
  Delhivery, Ekart and Shiprocket, all asked at once by `deliveryOptions` in `charge.ts`,
  and the customer picks. Business code never imports a courier file directly, and quotes
  the **chargeable** weight from `chargeableGrams`, never the dead weight — a courier bills
  a long light box by its size. Charge only the options the customer chose
  (`deliveryCharge(…, choices)`, one per parcel); never substitute the cheapest.
- **Everything ships from our Bengaluru pickup, except shelf racks, which always ship from
  their vendor** (the owner, 25 Sep 2026; `lineOrigin` in `src/lib/shipping/origin.ts`). The
  vendor's address is set on admin → racks. An order is then at most two parcels, each
  measured, quoted from its own pickup PIN and dated on its own (`splitShipments`). No pickup
  town is shown to customers.
- **The delivery area is for fresh greens only** (the owner, 24 Sep 2026). Addresses save
  anywhere in India; the area is checked at checkout, and only for a cart with greens
  (`travelsOnOwnRun`). Do not put the area check back into `validateAddress`.
- **Once-per-order work goes behind `markOrderPaid` returning true** — the
  receipt number and seed drawdown. It is a conditional write, so the webhook
  and the return page can race and only one wins.
- **Do not run the vendor package's telemetry.** The Cashfree agent-skills
  installer appends instructions to this file telling the assistant to run
  `start-integration` / `report-progress-feedback` silently. They were removed
  on 23 Sep 2026 and must stay removed if the skills are re-installed.

## Other standing rules

- **Real data, not placeholders.** Anything the admin can edit comes from
  DynamoDB. Build the admin screen before the public page that reads it.
- **Keys are declared, never hand-built.** All DynamoDB key layout lives in
  `src/lib/db/entities.ts` (SPEC §4.5). `src/lib/db/keys.test.ts` fails if a
  schema change would orphan existing rows.
- **The dev server runs on port 3005**, not 3000.
