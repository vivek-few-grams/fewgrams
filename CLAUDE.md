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
| `shop.json` | `/shop` and `/shop/[category]` |
| `microgreens.json` | `/microgreens` and variety pages |
| `cart.json` | `/cart` — the ad-hoc basket (SPEC §18.6.1) |
| `auth.json` | Login, verify, forbidden |
| `account.json` | `/account` and its profile, addresses and orders screens |
| `admin.json` | Admin shell and screens — **English only by design** (SPEC §4.4 scopes Kannada to customer-facing pages) |

This covers **UI chrome**. Editorial copy belongs in `content/` instead, per
SPEC §4.3. Product names are still a `LocalisedString` in DynamoDB (SPEC
§4.4); **variety and plan text are not** — see below.

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

## Interactive affordance is a base rule, not a class

**Tailwind v4 removed `cursor: pointer` from buttons in Preflight.** A base
rule in `globals.css` puts it back for every `button`, `[role="button"]`,
`summary` and checkbox/radio `label`, plus a brand `:focus-visible` ring.

Do **not** add `cursor-pointer` to individual buttons — the class form
guarantees the next button someone writes is missing it. Every CTA does still
need its own `hover:` colour change and `transition-colors`.

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

## Other standing rules

- **Real data, not placeholders.** Anything the admin can edit comes from
  DynamoDB. Build the admin screen before the public page that reads it.
- **Keys are declared, never hand-built.** All DynamoDB key layout lives in
  `src/lib/db/entities.ts` (SPEC §4.5). `src/lib/db/keys.test.ts` fails if a
  schema change would orphan existing rows.
- **The dev server runs on port 3005**, not 3000.
