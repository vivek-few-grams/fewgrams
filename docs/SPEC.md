# Fewgrams — Website Functional & Technical Specification

**Brand:** Fewgrams · **Domain:** `fewgrams.com` (registered at Cloudflare)
**Market:** Bengaluru only, restricted to serviceable PIN codes
**Purpose of this document:** the single reference for building the site page by page in later
sessions. Captured in a requirements interview on 14 Sep 2026.

**Build status:** Phase 0 complete — plain Next.js app scaffolded, this spec committed. No feature
work started; see §14 for the phase sequence.

---

## 1. Context

Fewgrams grows microgreens to order on a weekly sow-and-harvest cycle. That single fact drives the
whole design: this is **not** conventional shelf-stock e-commerce. There is no warehouse of greens
to sell from. What the customer orders this week determines what gets sown on Sunday, and the
catalogue, cutoff rules, pricing and admin tooling all have to respect that grow calendar.

The site must:
- Sell microgreens **only** as a prepaid weekly subscription, minimum one month.
- Sell seeds, racks and value-added food items alongside, consolidated onto the same weekly run.
- Refuse any order outside a serviceable Bengaluru PIN code.
- Give the owner one admin surface for catalogue, orders, delivery, payments and discounts.
- Convert confirmed orders into a **sowing plan** — how many trays of each variety, and when.

**Design references:** `palmo.co.in`, `donmolinico.es`, `ripeplanet.com`. Treat these as **visual**
references only — Palmo is a published design concept piece whose own disclaimer states the shop is
not real, and RipePlanet is an agri-investment collective rather than a store. What to take from
them: clean minimal layout, earthy natural palette, oversized hero, strong produce photography,
story-led scroll, generous whitespace.

---

## 2. Technology stack

| Concern | Decision |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Hosting | **AWS Amplify Hosting** for the Next.js app (AWS-built Next.js compute, not OpenNext) |
| Infrastructure as code | **AWS CDK** for the three DynamoDB tables, S3, SES and IAM — see §2.2 |
| Region | `ap-south-1` (Mumbai) |
| Database | DynamoDB, **three tables** grouped by operational policy (§4, §4.6), with **ElectroDB** as the schema/key layer (§4.5) |
| Images | S3 + CloudFront, served through `next/image` |
| Auth | **Auth.js (NextAuth)** with DynamoDB adapter — Google SSO + email/password |
| Payments | **Cashfree**, behind a provider-agnostic adapter (§9) |
| Email | AWS SES (or Resend), behind a notification-provider interface (§11) |
| DNS | Cloudflare DNS → Amplify custom domain (Amplify provisions and renews its own certificate). Set the Cloudflare record to **DNS-only** (grey cloud), not proxied — proxying breaks Amplify's domain validation and double-CDNs the site. |
| UI | Tailwind CSS + shadcn/ui |
| i18n | `next-intl`. English default, Kannada secondary. UI strings in `messages/*.json` (§4.3) |
| Fonts | Latin display/body pair + **Noto Sans Kannada** |

### 2.1 Three pluggable provider interfaces

A deliberate, repeated pattern. Each of these is a cost or vendor decision likely to change, so
each sits behind one interface with a single adapter implementation today:

1. `PaymentProvider` — Cashfree now, any gateway later
2. `NotificationProvider` — email now, WhatsApp/SMS later
3. `ShippingRateProvider` — static rules now, courier API later

Business logic never calls a vendor SDK directly.

### 2.2 Hosting & IaC: Amplify Hosting + CDK

**Decided: AWS Amplify Hosting for the app, AWS CDK for everything else.** No third-party
deployment framework. Rationale:

- Amplify Hosting's Next.js compute is **AWS-built**, so this route does not depend on OpenNext at all.
- CDK is AWS-native, Apache-2.0, stable, and already in use on this machine — no new tooling.
- Managed hosting means git-push deploys, branch previews and CI without maintaining deployment
  plumbing. The right trade for a solo operator.

**Important distinction — Amplify Hosting is not Amplify Gen 2 backend.** Only the *hosting* product
is being used. Amplify Gen 2's `defineData` provisions AppSync + GraphQL and generates DynamoDB
tables to its own schema conventions, which would fight the hand-designed key model in §4,
and it assumes Cognito rather than Auth.js. **Do not use it.** Amplify Hosting has no opinion about
the data layer.

**How the app reaches data:** Next.js server actions and route handlers call DynamoDB **directly via
the AWS SDK**. No AppSync, no API Gateway, no GraphQL layer.

**Known costs of this choice, accepted:**
- Two deploy surfaces — Amplify for the app, CDK for resources — so table names, bucket names and
  the Amplify service role's IAM permissions must be wired across by hand. Export them as CDK
  stack outputs and set them as Amplify environment variables.
- Amplify's managed Next.js support has historically lagged new Next.js releases. Check Amplify's
  supported version before upgrading Next.js, not after.
- Amplify Hosting bills build minutes and data served once the introductory free tier lapses.
  Plain CloudFront + Lambda (the CDK-only route) would be effectively free at this scale on
  perpetual free tiers. Revisit if hosting cost becomes material.

**Rejected alternatives, for the record:**
- *CDK + OpenNext construct* — full control and near-zero cost, but you own the Next.js hosting
  plumbing, and it still depends on OpenNext (MIT, maintained by the SST team).
- *SST v3* — best developer experience via resource linking and `sst dev`, but a Pulumi-based
  third-party framework sitting outside the CDK/SAM tooling already in use, and carrying a
  relicensing risk (MIT today; HashiCorp's 2023 Terraform move to BSL is the precedent).

### 2.3 Repository & two-GitHub-account setup

The machine's current state: global git identity is `VivekS <vivek.p@enchanting-travels.com>`
(company), and `~/.ssh/config` routes **all** `github.com` traffic through `id_ed25519_org` with
`IdentitiesOnly yes`. `gh` CLI is authenticated as `VivekPNs` over HTTPS. There is an unused
`~/.ssh/id_ed25519`. Without changes, every Fewgrams commit would carry the company email.

Target: **identity determined by directory, key determined by remote URL** — nothing to remember
or switch per session.

**1. Directory-scoped identity.** Append to `~/.gitconfig` — it must come *after* the existing
`[user]` block, because git applies config in order and the last value wins:

```gitconfig
[includeIf "gitdir:~/projects/personal/"]
    path = ~/.gitconfig-personal
```

New `~/.gitconfig-personal`:

```gitconfig
[user]
    name  = <personal name>
    email = <personal email>
```

The trailing slash on the `gitdir` pattern is required for recursive matching.

**2. SSH host alias.** Add to `~/.ssh/config`, **at the top of the file, above the existing
`Host *` block** — SSH resolves most options first-match-wins, and `Host *` currently sits above
`Host github.com`:

```sshconfig
Host github-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

**3. Use SSH remotes for both accounts, not HTTPS.** `gh` is configured for HTTPS with a single
active account, so its credential helper injects whichever account is active — the usual cause of
pushing to the wrong account. With SSH host aliases the identity is a property of the remote URL
and is deterministic:

```
git remote add origin git@github-personal:<username>/fewgrams.git
```

Treat `gh auth switch` as applying to `gh` commands only, never to `git push`.

**Verify before the first push:**
```bash
ssh -T git@github-personal          # must greet the personal account, not VivekPNs
cd ~/projects/personal/fewgrams
git config user.email               # must show the personal email
```

**Two values still needed from the user:** personal GitHub username, and the email for personal
commits.

**Unrelated but noted:** the `github` MCP server failed to connect this session with a 401
(`AUTH_HEADER_REJECTED`) — its configured Authorization token is being rejected and needs
refreshing if it is wanted for the new account.

---

## 3. Product catalogue

Five categories with genuinely different commerce rules — this is the heart of the model:

| Category | How it sells | Inventory |
|---|---|---|
| **Microgreens** | Weekly subscription (min 1 month, prepaid) **and** one-off by the tray — see §18.6, superseded 19 Sep 2026 | **No stock.** Variety catalogue carrying yield + grow-day metadata |
| **Seeds** | One-off, buy anytime, by the 100 g — see §22 | **Real stock in grams**, but it is a *speed*, not a limit: any quantity sells, and the shelf sets the delivery date (§22.2) |
| **Racks** | One-off, buy anytime | **None** — outsourced, assumed always available |
| **Trays & drainage** | One-off. Bought in per order, min **7 days** — see §23 | **None, by design.** The supplier holds it; every order is a purchase order |
| **Value-added** (sandwiches, burgers, salads) | One-off **add-on** to the weekly delivery, ordered before cutoff | **None** — made to order |

### 3.0 Two things called "tray" — keep them separate

`Variety.yieldGramsPerTray` is a **unit of production** used by the sow plan. A **tray SKU** is a
physical product sold to customers. They are unrelated in the data model and must stay that way, or
the sow plan becomes impossible to reason about. Name them distinctly in code
(`growTrayCount` vs `TrayProduct`).

### 3.0.1 Product variants

Trays introduced the first need for variants (virgin plastic vs PP plastic, and likely size and
pack quantity), each with its own price and SKU. Racks and seeds did not need this. The product
model must carry a variant array from the start rather than have it retrofitted:

> **Superseded for trays, 17 Sep 2026.** The two tray kits the owner actually sells *are* the
> virgin-vs-recycled pair this section anticipated — and they are **two rows, not one row with two
> variants** (§23.1). The owner asked for "three products", the prices differ by ₹110, and there is
> no detail page for a variant selector to live on, so two cards side by side is what a buyer can
> compare. `ProductVariant` is unused by anything today; it stays on `Product` for snacks, where a
> size or a pack quantity may yet earn it.

```ts
type ProductVariant = {
  sku: string
  attributes: Record<string, string>   // { material: 'PP', size: '10x20' }
  price: number
  stockGrams?: number                  // seeds only
  active: boolean
}
```

### 3.1 Microgreen variety record

Stored in **DynamoDB** — operational fields the owner tunes from admin, which drive pricing and the
sow plan:

```ts
type Variety = {
  id: string
  slug: string
  name: LocalisedString         // { en: 'Radish', kn: 'ಮೂಲಂಗಿ' }
  pricePer100g: number          // prices Build-Your-Own
  yieldGramsPerTray: number     // e.g. 300 — owner-published, refined by experiment
  growDays: number              // e.g. 7 or 14 — days from sow to harvest
  seedGramsPerTray?: number     // optional: lets the sow plan also state seed needed
  tier: 'essential' | 'exotic'
  active: boolean
}
```

Editorial content lives in **repo JSON**, not DynamoDB — see §4.3.

`yieldGramsPerTray` and `growDays` are the two fields the entire operation computes from. Every
variety publishes both.

---

## 4. Data model — DynamoDB, three tables

**Superseded 14 Sep 2026.** This section originally specified one table `fewgrams`. It is now
three, grouped by operational policy rather than by entity — see §4.6 for the decision and §4.5
for the ElectroDB schema layer that generates the keys. Every key string below is unchanged from
the single-table design; only the table each row lives in changed.

All three tables use `PK` / `SK` and `PAY_PER_REQUEST`. One env var,
`DYNAMODB_TABLE_PREFIX`, names all three.

### `fewgrams-users` — one partition per person

Indexes: **GSI1** only (the adapter's email lookup).

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Auth.js user | `USER#<id>` | `USER#<id>` | `USER#<email>` | `USER#<email>` |
| Linked OAuth account | `USER#<id>` | `ACCOUNT#<provider>#<id>` | — | — |
| Session | `USER#<id>` | `SESSION#<token>` | — | — |
| Verification token | `VT#<email>` | `VT#<hash>` | — | — |
| User profile | `USER#<id>` | `PROFILE` | — | — |
| Address | `USER#<id>` | `ADDR#<addrId>` | — | — |

Named for the partition, not for auth, because delivery addresses live here: they share the user's
partition, so one Query returns the person and everywhere they can receive a box. Wants a TTL on
sessions. Needs no point-in-time recovery — all of it is re-creatable by signing in again.

**Amendment (§8.1).** The user row is written by `@auth/dynamodb-adapter`, with email lookup on
`GSI1PK = USER#<email>`. The adapter's keys are configurable and are mapped onto
`PK`/`SK`/`GSI1PK`/`GSI1SK`. The originally planned `EMAIL#<email>` convention is **dropped** in
favour of the adapter's, so there is a single email-lookup path.

Note: the adapter's `deleteUser` removes **every item in the user's partition**, which takes
addresses and profile with it. That is the correct behaviour for a deletion request, and is a
second reason to keep those rows in this table.

### `fewgrams-catalogue` — admin-written, read-mostly

Indexes: **GSI1** only.

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Variety | `VARIETY#<id>` | `META` | `VARIETY` | `<contentKey>` |
| Seed | `SEED#<id>` | `META` | `SEED` | `<contentKey>` |
| Tray / drainage mat | `TRAY#<id>` | `META` | `TRAY` | `<contentKey>` |
| Product (snack) | `PRODUCT#<id>` | `META` | `CAT#<category>` | `<slug>` |
| Plan definition | `PLAN#<planId>` | `META` | `PLAN` | `<sortOrder>#<slug>` |
| Plan rotation week | `PLAN#<planId>` | `WEEK#<1..4>` | — | — |
| Coupon | `COUPON#<code>` | `META` | — | — |
| Coupon redemption | `COUPON#<code>` | `REDEEM#<userId>` | — | — |
| PIN code | `PIN#<pincode>` | `META` | — | — |
| Settings | `CONFIG` | `SETTINGS` | — | — |

`Seed` and `Tray` are separate entities rather than `PRODUCT#` with a
`category` — see §22.1 and §23.1 for why. **Only snacks are left on `Product`,
and nothing writes one yet.** Every one of these is its own content-key
namespace: `VARIETY`, `SEED` and `TRAY` are exact-match GSI1 partitions, never a
`begins_with`, so `radish` the microgreen, `radish` the seed and a hypothetical
`radish` tray cannot reach each other's lists. `keys.test.ts` pins all three
pairings.

The plan's `GSI1` entry is a **documented deviation** from the original spec, carried over from the
first implementation: the home page must list every plan, and without an index that is a Scan.
`sortOrder` is padded to three characters because DynamoDB sorts keys as strings — unpadded, plan
10 would sort before plan 2.

Cheap to re-enter from the admin UI, so no PITR. Coupon redemption stays here beside the coupon
because the usage cap is enforced with a conditional write on `COUPON#<code> / REDEEM#<userId>`
(§10), which needs both items in one partition.

### `fewgrams-orders` — real money

Indexes: **GSI1** (`DELIVERY#<date>`) and **GSI2** (`STATUS#<status>` / `<createdAt>`, for admin
lists filtered by status).

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Subscription | `SUB#<subId>` | `META` | `USER#<userId>` | `SUB#<createdAt>` |
| Subscription week | `SUB#<subId>` | `WEEK#<deliveryDate>` | `DELIVERY#<date>` | `SUB#<subId>` |
| Order (one-off) | `ORDER#<orderId>` | `META` | `DELIVERY#<date>` | `ORDER#<orderId>` |
| Order item | `ORDER#<orderId>` | `ITEM#<n>` | — | — |
| Weekly cycle | `CYCLE#<deliveryDate>` | `META` | — | — |
| Sow plan line | `SOWPLAN#<sowDate>` | `VARIETY#<id>` | — | — |
| Payment | `PAYMENT#<id>` | `META` | `ORDER#<orderId>` | `PAYMENT#<id>` |

**This is the only table where single-table design still earns its keep**, and §4.1 is why. PITR
on, and the only table that will need a DynamoDB Stream.

### 4.1 Why the `DELIVERY#<date>` GSI matters

Both subscription weeks and one-off orders write `GSI1PK = DELIVERY#<date>`. So **one query returns
everything due on a given Saturday** — greens, seeds, racks and sandwiches together. That single
query powers the pick-pack list, the route sheet and the staff app.

### 4.2 Honest note on DynamoDB

This app is relationally shaped — orders, subscription weeks, coupons, stock. The key design above
covers every access pattern identified, but **ad-hoc admin reporting will be the weak spot**. Plan
to add a nightly export to S3 + Athena (or a small RDS read replica) when reporting needs grow
beyond the fixed screens in §7. Do not try to serve arbitrary analytics from DynamoDB queries.

### 4.3 Content strategy — JSON in repo vs DynamoDB

Performance is **not** the deciding factor here. With App Router, a DynamoDB read inside a
prerendered or ISR server component costs nothing per request — both approaches end up as static
HTML. The real trade-off is who can edit the field and how:

| | JSON in repo | DynamoDB |
|---|---|---|
| Editing | Requires a deploy | Live, from the admin UI |
| Versioned in git | Yes | No |
| Cost | Zero | Trivial |

**Split by the nature of the field:**

- **DynamoDB** — anything operational or transactional: `yieldGramsPerTray`, `growDays`,
  `pricePer100g`, `tier`, `active`, stock, prices. These get tuned from admin as yield experiments
  refine, and the sow plan depends on them.
- **Repo JSON** — editorial content: long descriptions, nutrition tables, flavour notes, growing
  tips, recipe cross-links, image captions. Static, rarely changes, and benefits from git history.

**One file per category per locale**, keyed by slug:

```
content/microgreens.en.json    content/microgreens.kn.json
content/seeds.en.json          content/seeds.kn.json
content/racks.en.json          content/racks.kn.json
content/trays.en.json          content/trays.kn.json
content/value-added.en.json    content/value-added.kn.json
content/recipes.en.json        content/recipes.kn.json
```

```json
// content/microgreens.en.json
{
  "radish": {
    "shortDescription": "Peppery, fast and forgiving — the everyday microgreen.",
    "description": "Long-form copy for the variety page...",
    "flavourNotes": "Sharp and peppery, like a mild radish bulb.",
    "nutrition": [
      { "label": "Vitamin C", "value": "High" },
      { "label": "Folate", "value": "Moderate" }
    ],
    "growingTips": "Soak 6 hours, sow dense, harvest day 7...",
    "recipeSlugs": ["radish-sandwich", "green-salad-bowl"],
    "imageAlt": "Tray of freshly cut radish microgreens"
  },
  "mustard": { }
}
```

#### SUPERSEDED 15 Sep 2026 — `name` moved out of DynamoDB, one file per variety

The paragraph this replaces kept `name` in DynamoDB "because it is needed in admin lists, cart
lines, sow plans and order snapshots". That was wrong about where the cost lands, and it forced the
admin UI to ask an operator to type a display label in two languages.

**No variety text is entered in the admin UI at all.** DynamoDB holds only what the business tunes
— `pricePer100g`, `yieldGramsPerTray`, `growDays`, `seedGramsPerTray`, `tier`, `active`. Every word
a visitor reads lives in **one file per variety**:

```
content/varieties/radish.json
content/varieties/red-amaranth.json
content/varieties/green-amaranth.json
```

Language-independent facts (image filenames, recipe links) sit at the top level; anything a human
reads is nested under its locale. Annotated shape in `content/varieties/README.md`; loader in
`src/lib/content/varieties.ts`.

**One file per variety with both locales inside, rather than one file per category per locale.** A
translator gets the English and the Kannada side by side, which is more useful than two files to
diff against each other, and a new variety is one new file rather than an edit to two shared ones
that a second person may also be editing.

#### Three identifiers, deliberately separate

| | Changes? | Lives |
|---|---|---|
| `id` | never | DynamoDB primary key, a generated UUID |
| `contentKey` | almost never | names the content file, and is the public URL segment |
| display name | whenever you like | inside the content file only |

That separation is the whole point, and it answers the question that prompted the change: renaming
"Red Amaranth" to "Ruby Amaranth" is an edit to one string in one file. The filename, the URL, the
DynamoDB id and every historical order line are untouched. A `name` column could not give you that,
and a UUID-named file would make the URL unreadable to buy from.

Keys are plain lowercase kebab-case, validated not sanitised, because they are both a filename and
a URL segment. **A family of similar varieties is exactly where a descriptive key beats a generated
one**: `red-amaranth` cannot be confused with anything, where `amaranth-2` or
`radish_8f3a2c91` can. No UUID suffix — the UUID is the primary key and nobody needs to see it.

`slug` is gone from the variety entity; `contentKey` does the same two jobs and one more, and
generates a byte-identical GSI1 sort key. `PlanWeek.varietySlugs` became `varietyKeys` for the same
reason.

#### Admin-first, not content-first

An earlier version of this section required the content file to exist before a variety could be
created, and made the admin field a dropdown of existing files. **Reverted the same day.** It meant
no variety could be added without first opening a code editor, which is the wrong order for the
person who grows the greens, and it was a guarantee nobody had asked for.

The order is now whichever suits you:

1. In admin → varieties, type a key (`red-amaranth`) and set the numbers. Existing content files
   appear as autocomplete suggestions, so a second variety in a family is easy to match.
2. Create `content/varieties/red-amaranth.json` for the name and copy.
3. Drop photos in `public/varieties/red-amaranth/`.

What keeps a nameless variety away from customers is downstream rather than preventive, and it is
enough: the admin row is flagged in red naming the **exact path to create**, and every public page
skips a variety it cannot name. A mistyped key is therefore visible immediately and harmless.

Key **format** is still validated rather than sanitised, because it is both a filename and a URL
segment and silently rewriting it would break the link to the file the operator is about to create.

**Products** still hold a `LocalisedString` name and still want the build-time completeness check
from the original section. **Plans no longer do** — their copy moved to `content/plans/` on 15 Sep
2026 for the same reasons, see §5.1.1.

#### What a variety is, and what it is not

A variety is a microgreen grown and sold **by the tray** for ad-hoc orders (§18.6). Its record
holds only that: `pricePerTray`, `growDays`, `yieldGramsPerTray`, `seedGramsPerTray`, `active`.

#### SUPERSEDED 19 Sep 2026 — sold by the tray, not by the 100 g

The paragraph above replaced "by the 100 g" with "by the tray". The owner's instruction: *ordering
should be based on the tray, not by grams, and costing should also be decided based on trays* — a
green was never actually weighed out of a sack the way a seed is; it is cut whole from a tray that
was sown whole, so pricing and ordering it in grams implied a precision the operation never had.

`pricePer100g` is renamed `pricePerTray` and is what a customer is charged per tray ordered.
`yieldGramsPerTray` **stays on the record but no longer prices anything** — it is the owner's
measured, approximate weight a tray of this variety yields, kept for the customer's information
(shown alongside the tray count in the buy box) and for whatever the sow plan eventually wants it
for. See `isWeighed` in `src/lib/cart/cart.ts` and the note on `Variety` in `src/lib/types.ts`.

**`tier` was removed on 15 Sep 2026.** It was written by the admin form and read by nothing. Its
only purpose was grouping varieties for the curated Essential/Exotic plans, but §5.1 has those
plans name their varieties explicitly per rotation week, so the field earned nothing and put a
plan-shaped concept on a record that has no plan in it. Plans reference varieties; varieties do not
know about plans.

Order and subscription line items **snapshot the name and price at purchase time** rather than
referencing the live record. This matters more now, not less: without the snapshot, editing a name
in a content file would silently rewrite what a customer bought two months ago.

#### One enforced template, not a shape per file

**Every variety file follows one fixed structure**, defined in
`src/lib/content/variety-contract.ts` and enforced by
`variety-contract.test.ts`, which runs the contract over every file in the
folder. Without it each file drifts into its own shape — one has
`flavourNotes`, the next calls it `taste`, a third omits cautions — and the
variety page has to defend against every variation. A template documented only
in a README is a suggestion; this makes it a failing test.

`content/varieties/_template.json` is the stub to copy. It deliberately does
**not** pass the contract: its fields are blank, and a stub that validated
would mean the contract accepts empty content.

| Block | Required |
|---|---|
| `images` | `hero`, `gallery` (≥1) |
| `en` | `name`, `shortDescription`, `description`, `flavourNotes`, `growingTips`, `nutrition` (≥5 rows), `nutritionNote`, `benefits` (≥3), `cautions` (≥1), `faq` (exactly 5), `imageAlt` |
| `kn` | `name`, `shortDescription`, `flavourNotes`, `imageAlt` |

**Kannada carries the same full set as English** (changed 15 Sep 2026 from a
high-intent subset). The field-by-field fallback in
`src/lib/content/varieties.ts` means a gap renders English *silently*, so a
Kannada reader would hit paragraphs of English with nothing to tell them the
translation was never written. The fallback is the right runtime behaviour and
the wrong thing to plan around.

`KN_REQUIRED` is derived from `EN_REQUIRED` rather than restated, so adding a
field to the template cannot add it to English only — the parity is structural,
not a second list somebody has to remember.

Three tests enforce it, because key-presence alone is too weak:

1. Every field English has, Kannada has.
2. **Every Kannada string contains Kannada script.** Pasting the English value
   satisfies a presence check while being no translation at all — and it is
   worse than a gap, because a pasted value looks translated to everyone
   downstream. Exempted by shape, not by name: `ವಿಟಮಿನ್ C` keeps its Latin
   letter and `70%` has no letters.
3. No Kannada value is a verbatim copy of its English.

The same rule covers UI chrome: `src/i18n/messages-parity.test.ts` asserts that
every key in `messages/en/*.json` exists in `messages/kn/*.json`, that no
Kannada-only orphan keys exist, and that no Kannada value equals its English
unless it has no translatable words (`₹{price}`, `© {year} {brand}`, `—`).

**`admin` is the one exception, by decision.** It is operator-facing, the
operator reads English, and translating ~80 internal strings would be permanent
maintenance for no customer benefit. The exemption is named in the parity test
rather than left implicit.

There is no separate `title` field. `name` is the title — two names for one
thing drift apart, and `name` is already what lists, the cart, sow plans and
order snapshots use.

Unknown fields fail rather than being ignored, so a renamed field is caught
instead of silently rendering nothing.

#### Health claims: nutrient-function only

**No content file may state or imply that a food prevents, treats or cures a
disease.** India's Food Safety and Standards (Advertising and Claims)
Regulations 2018 prohibit it, and it would be false regardless. The `benefits`
array carries nutrient-function claims — what a named nutrient does in the
body:

- Permitted: *"Vitamin C contributes to normal immune function."*
- Not permitted: *"Cures colds."* *"Prevents cancer."* *"Controls diabetes."*

If the nutrient doing the work cannot be named, the claim does not go in.

`cautions` is the counterpart and is required, minimum one entry: allergens,
medication interactions and who should be careful. It carries real content —
oxalates in amaranth, brassica goitrogens, vitamin K for anyone on warfarin,
and for wheat grass the gluten cross-contact risk from the grain it is grown
on, which is a genuine reason a coeliac must not drink it.

#### Nutrition values are qualitative

`High` / `Good source` / `Moderate` / `Present`, never milligrams. Microgreen
nutrient content swings with seed lot, light and harvest day, so a precise
figure would imply a consistency no honest grower can promise, and fabricated
precision on food is worse than none. `nutritionNote` states this on the page
rather than hiding it.

#### Images are never stored in DynamoDB

The content file **names** image files; it never embeds them. Three reasons, any one of them
sufficient: a DynamoDB item caps at **400 KB**, which one decent photograph exceeds; you would pay
read capacity on every page view for bytes a CDN serves for nothing; and base64 inflates the
payload by about a third while defeating `next/image` resizing entirely.

Today they resolve to `public/varieties/<key>/<filename>`, served by Next. At launch
`NEXT_PUBLIC_IMAGE_BASE_URL` points at CloudFront (§2) and nothing else changes — which is why
every caller goes through `varietyImageUrl()` rather than building a path inline. A variety with no
`images.hero` falls back to the generated `Sprout` placeholder, so photography can land one variety
at a time.

**`images.cutout` is a third kind of picture, not a second hero** — added 16 Sep 2026 so the
`/microgreens` grid can run the §17.4 card motion. Transparent background, product centred, no
ground and no props, so the tile can scale and tilt it over a flat colour with the nutrient marquee
scrolling behind. A square `hero` crop cannot do that job: it fills the tile, leaving nothing for
the type to show through. Optional, and it does **not** fall back to `hero` — a photo with its own
background dropped into the media box reads as a skewed rectangle rather than a tilted punnet, so a
variety without a cut-out gets the flat photographic tile instead.

Framing is normalised in code, not asked of the generator: `scripts/cutout.py` crops to the alpha
bounding box, centres it in a square canvas at **86% of the width**, resizes to **800 × 800** and
encodes **WebP q85** (112–122 KB each with alpha; PNG is 588 KB for the same pixels). 86% was
chosen by rendering 70/78/86/96% at the real card size with the marquee running — below it the
punnet looks lost, above it the tray covers the type. The first sample came back framed at 96% of
the width, which is why this is a build step rather than a line in the prompt.

**A shared duration is not a shared speed**, and this cost two defects on
17 Sep 2026. The keyframe translates *one half* of the marquee block, so the
apparent speed is `halfHeight ÷ duration` — and `halfHeight` is however many
lines the caller asked for, at type sized as a fraction of its card. A single
`8s` in the CSS therefore ran a variety tile's 389px half at 49px/s and a rack
card's 715px half at 89px/s. The duration is now a per-caller custom property
derived from a **house speed of 48px/s**, which is the variety tile's own,
measured rather than calculated.

The related trap is the loop itself: one half of the block must be *taller* than
the panel or bare panel crosses the card once per cycle. `marqueeLines` pads the
word list to `minLines` for that reason, and the default of ten is right only
for a square tile — a 3:2 tray card needs the type sized in `cqw` and a 4:5 rack
card needs 26 lines as well. Both invariants are pinned per call site in
`src/components/ui/marquee.test.ts`, because neither shows up in a screenshot
and both have now been shipped once.

Those are the script's **defaults**, not its only behaviour: it took `--aspect`, `--fill`,
`--width` and `--bg` on 17 Sep 2026 when the tray grid needed a 3:2 cut-out and a flattened
gallery hero from the same master (§23.8). The square path is unchanged and verified byte-identical
against the original algorithm.

Normalising on the **width** is what makes the grid look like one set: the five silhouettes came
back at aspects 1.34–1.47, so a common width gives every punnet the same size while their heights
vary with the canopy, which is the plant rather than the photography.

All five varieties carry a cut-out as of 16 Sep 2026, generated from the amaranthus master by
masked edit in ChatGPT — see `docs/CUTOUT_PROMPT.md` for the prompt and the workflow. The hero and
`Sprout` fallbacks in `VarietyTile` stay for the sixth variety, whenever it arrives.

**`next.config.ts` needs `outputFileTracingIncludes` for `content/**`.** The files are read with
`fs` at request time and Next's tracing only follows static imports, so without it the folder is
omitted from the serverless bundle and every variety loses its name in production while working
perfectly in development.

### 4.4 Localisation

English is the default; Kannada is the second locale. `next-intl` with locale-prefixed routes.

**RULE, 15 Sep 2026 — no hardcoded text.** Every string a user can see comes from a translation
file. When any new text is introduced, its English wording goes into `messages/en/<area>.json`
first and the component references the key; the Kannada wording follows in
`messages/kn/<area>.json`. This is enforced by convention and restated in `CLAUDE.md`, because it
is far cheaper to hold than to retrofit. `aria-label`, `title`, `alt`, `placeholder`, validation
messages, empty states and metadata all count as user-visible text.

**One file per area, not one catalogue** — `common`, `home`, `plans`, `shop`, `microgreens`,
`auth`, `admin` — so a change to one surface cannot conflict with a change to another, and a
translator can be handed a single file. English is deep-merged underneath the active locale in
`src/i18n/request.ts`, which is what implements the fallback rule below: a missing Kannada key
renders English, never a raw key.

**Kannada is live as of 15 Sep 2026.** `localePrefix: "as-needed"` — English keeps bare paths
(`/shop/trays`), Kannada is prefixed (`/kn/shop/trays`). The switch in the header is a toggle
showing the language you are *not* in, each written in its own script, and it keeps you on the
page you were reading. `hreflang` is set per page via `src/i18n/alternates.ts`, never in the
layout — a layout cannot know the path, so a layout-level value would claim every Kannada page
lives at `/kn`.

**`admin.json` is English only, deliberately.** Admin is an internal surface; its strings live in a
message file so the no-hardcoded-text rule holds everywhere, but translating it would be waste.

Three distinct classes of translatable text, handled differently:

1. **UI chrome** — buttons, labels, validation errors, emails. `messages/en.json`,
   `messages/kn.json`. Straightforward.
2. **Editorial content** — per-category, per-locale content files as above
   (`microgreens.en.json` / `microgreens.kn.json`).
3. **Admin-created data in DynamoDB** — product and variety names, coupon descriptions, plan names.
   These must be stored as **localised string maps, not plain strings**:

```ts
type LocalisedString = { en: string; kn?: string }
```

This is a schema decision to make now. Retrofitting `string → LocalisedString` across the catalogue
later means a data migration plus touching every read site. Admin forms render one input per locale,
with Kannada optional.

Resolution rule: **fall back to English on any missing key or missing `kn` value.** Never render an
empty string or a raw key.

Also required: Noto Sans Kannada loaded for the `kn` locale, locale-aware currency and date
formatting, and `hreflang` tags on public pages.

**Scoping advice:** full Kannada parity doubles your content workload permanently. Recommended v1
scope is English complete, with Kannada covering UI chrome plus the high-intent pages — home,
how-it-works, plans, BYO builder, checkout — and English fallback everywhere else. Variety and
recipe copy can be translated progressively.

### 4.5 ElectroDB — the declared key layer

**Decided 14 Sep 2026: stay on DynamoDB, add ElectroDB (3.9.3) as the schema layer.** The alternative
considered and rejected was porting to Postgres with Drizzle.

**Why not Postgres.** The data is relationally shaped, and that argument for Postgres is real. What
killed it is cost with no offsetting benefit: AWS's 12-month per-service free tier no longer exists
for new accounts — it is now roughly $100–200 of credit over six months — and **RDS has no free
tier at all**. DynamoDB's 25 GB / 25 WCU / 25 RCU free tier, by contrast, is perpetual. Costed at
year-3 volumes the workload runs at **about ₹4/month on DynamoDB including both GSIs, against
₹1,000–1,900/month on the smallest RDS instance**. The one thing Postgres would genuinely have
bought — ad-hoc SQL for reporting — is already covered by the decision in §4.2 that reports are
built as features against known access patterns.

**What ElectroDB adds, and what it does not.** ElectroDB is built *for* single-table design; it is
not an alternative to it. It moves the key layout from imperative string building scattered across
repositories into one declared schema (`src/lib/db/entities.ts`) — including, after §4.6, which of
the three tables each entity belongs to. In exchange:

- Required attributes, enums and nested shapes are validated on write.
- Keys are generated, so a mistyped prefix is a schema error, not a silently orphaned row.
- Reads return only declared attributes, which retired the hand-written `stripKeys` helper — the
  `PK`/`SK`/`GSI1PK` columns can no longer leak into the UI or into a write that spreads a read.
- Queries are typed end to end, including composite-key arguments.

It adds no index, changes no key, and costs nothing at runtime.

**Non-negotiable constraint: no data migration.** Left to itself ElectroDB builds keys like
`$fewgrams#variety_1#id_radish` and lowercases them. Every index therefore declares an explicit
`template` and `casing: "none"`, reproducing the keys in the table above byte-for-byte.
`src/lib/db/keys.test.ts` asserts the generated keys against the strings in this document, so a
schema edit that would orphan existing rows fails the test suite instead.

**Two traps found during the port, both documented in `src/lib/db/client.ts`:**

1. **Entity ownership filtering.** ElectroDB stamps `__edb_e__` / `__edb_v__` onto rows it writes
   and by default discards rows on read that do not carry its stamp. That would hide every row
   written by `@auth/dynamodb-adapter` — which is a third of this table and will never carry a
   stamp — so ownership checking is off. This is safe precisely *because* the key templates are
   explicit: entity identity is carried by the key itself, so no query can reach another entity's
   rows.
2. **`ignoreOwnership` set on the entity does not survive a query on a secondary index.**
   ElectroDB reassigns it while building the config for any indexed query, deriving it from the
   index's `projection` alone; an `ALL` projection lands on `false`. Every read therefore passes
   the option per call, via the shared `LIST_OPTS` / `READ_OPTS` constants. Verified by
   observation: without it, the GSI1 catalogue query returned an empty array against a table that
   demonstrably held the row.

**Deliberately not used: collections.** A collection would let one Query return a plan and its
rotation weeks together, but ElectroDB implements non-isolated collections *through* the
`__edb_e__` filter above. With three or four plans the extra Query per plan is cheaper than the
migration. Revisit if a partition ever holds many entity types at once.

**Index cost, for the record.** Writes are billed as base table plus each index the item appears
in, and an `ALL` projection duplicates the item's storage. Both are immaterial here: GSIs are
**sparse** — an item with no `GSI2PK` attribute is not in GSI2 and costs nothing there — and
storage sits far inside the 25 GB allowance. The real constraint is not price but timing: adding a
GSI to a populated table triggers a backfill, so **add indexes early**. Default quota is 20 GSIs
per table.

### 4.6 One table or three

**Decided 14 Sep 2026: three tables, grouped by operational policy.** Split the same day the
ElectroDB layer landed (§4.5), so the entity schemas absorbed the change and no application code
above the repository layer moved.

**The premise that was wrong.** Single-table design is not the more scalable option. DynamoDB
partitions per table, and on-demand tables serve 40,000 read and write units each by default
(raisable). Putting everything in one table *concentrates* traffic into one table's partitions.
Single-table was never about scale — it is about saving round trips in latency-sensitive services
with high request rates and well-known access patterns. This is a weekly sow-and-harvest shop in
one city.

**Speed: no difference here.** Single-table saves a round trip only when the wanted items **share
a partition key**, because a Query reads one partition of one table and nothing else. Items that
share a partition key are tightly related by definition — an order and its items, a subscription
and its weeks, a coupon and its redemptions — and **every one of those pairs stayed together**.
Crossing the three groups was always two requests, because those entities sit in different
partitions regardless. Point lookups are unaffected: `BatchGetItem`, `TransactWriteItems` and
`TransactGetItems` all take a map keyed by table name, so up to 100 items across several tables is
still one request.

**Cost: no difference, and marginally cheaper split.** Request units bill per request and storage
bills per GB account-wide; the 25 GB free tier is account-level, not per-table, so splitting
neither multiplies nor divides it. Two second-order effects both favour the split: PITR bills per
GB of table size, so scoping it to `fewgrams-orders` avoids paying to protect session rows; and
indexes are now provisioned only where used (`users` and `catalogue` carry one GSI each, not two).

**What actually decided it, in order:**

1. **It makes §8 enforceable.** The spec requires the staff role to be a genuine data restriction.
   With three tables that is a table ARN in an IAM policy. With one table it needs
   `dynamodb:LeadingKeys` conditions on key prefixes — fiddly to write and easy to get subtly
   wrong. This is a security argument, not an aesthetic one.
2. **Backups, TTL, streams and capacity mode are per-table settings.** One table forces one policy
   across catalogue, sessions and orders: paying for PITR on rows that do not need it, and a
   stream that fires on every variety price edit when only order events were wanted.
3. **Legibility for a solo operator.** `fewgrams-catalogue` in the console shows catalogue rows,
   not sessions and verification tokens interleaved with them.

**The honest risk:** merging tables later is harder than splitting them. Accepted, because the
access patterns are already enumerated in §12 and none of them span the three groups.

**Migration:** `scripts/migrate-split-tables.mjs`, kept in the repo as the record of which key
prefix went where. It copies rather than moves and errors on any unrouted prefix. The original
single table was left in place.

**Still open:** whether `catalogue` should itself become one table per entity. It retains key
prefixes (`VARIETY#`, `PRODUCT#`, `PLAN#`) because it holds several entity types, so the console
is only partly clearer there. Two of its partitions are genuine parent/child pairs
(`PLAN#→WEEK#`, `COUPON#→REDEEM#`) that want to stay together; varieties and products do not, and
could each take their own table, dropping GSI1 in favour of a cheap Scan over a few dozen rows.
Not done, because it is a further change rather than part of this split.

---

---

## 5. Subscription model

### 5.1 The three plan types

| Plan | Key | Contents decided by | Pricing |
|---|---|---|---|
| **Everyday Essentials** | `essential` | Owner (curated) | **Flat monthly price** |
| **Rare & Exotic** | `exotic` | Owner (curated) — premium varieties *plus* the everyday basics | **Flat monthly price** |
| **Pick Your Own** | `build-your-own` | Customer picks varieties and quantities | **Computed by tray** — sum of `pricePerTray × trays` (superseded 19 Sep 2026; was by weight, `pricePer100g × quantity`) |

**Named 15 Sep 2026.** They were Essential / Exotic / Build Your Own. Three problems: "Essential"
is tier-speak (Basic / Pro / Enterprise) rather than a description of food; "Exotic" alone does not
say the plan *also* contains the basics, which is the one thing a customer needs to know about it
(§18.4); and "Build Your Own" asks the customer to build when what they actually do is pick — where
"pick your own" is the established farm idiom. **The keys deliberately did not change**: a key is an
identifier and a display name is a label, so renaming is one string in one content file and nothing
in DynamoDB, the URLs or order history moves (§5.1.1).

The card CTA followed the name — "Build my bundle" became "Pick my greens", because a button using
a different verb from the plan it belongs to reads as a different feature.

Flat pricing on the curated packs is deliberate: it lets the owner substitute varieties week to
week without the customer's price moving.

**Three plans, fixed** — confirmed by the owner 15 Sep 2026. There is no fourth, and no admin
screen creates one: the three are defined by the three files in `content/plans/`, and admin → plans
only sets their numbers and rotation (§18.9.1). Adding a plan later means adding a content file,
which is a deliberate, reviewable change rather than a form submission.

### 5.1.1 Plan text lives in content files — changed 15 Sep 2026

A plan carried `name`, `blurb` and `highlights` in DynamoDB, typed into the admin form. All three
are now `content/plans/<contentKey>.json`, with `en` and `kn` blocks and the same fixed-template
treatment as varieties (§4.3): the contract is `src/lib/content/plan-contract.ts`, enforced over
every file by `plan-contract.test.ts`, and `content/plans/README.md` is the operator's copy of it.

Three reasons, in order of severity:

1. **`highlights` could not be translated at all.** It was a plain `string[]`, not a
   `LocalisedString[]` — there was no field for a Kannada bullet list, so the Kannada home page
   rendered the English one. Typing the array into a textarea, one per line, hid that: the data
   looked complete.
2. Plan copy is prose and wants a diff, review and git history. A monthly price does not.
3. It made the admin screen the authority on wording, which §4.4 and CLAUDE.md reserve for
   translation and content files.

`contentKey` replaced `slug` on the plan record, generating the identical `GSI1SK` string
(`<padded sortOrder>#<key>`), so nothing moved — `src/lib/db/keys.test.ts` asserts it. What stays
in DynamoDB is what the business tunes: `monthlyPrice`, `gramsPerBox`, `sortOrder`,
`recommended`, `active`.

| Field | Where | Why |
|---|---|---|
| `name`, `badge`, `tagline`, `description`, `highlights` | `content/plans/<key>.json`, per locale | prose, reviewed, versioned |
| `monthlyPrice`, `gramsPerBox` | DynamoDB | tuned, and printed on the card |
| `sortOrder`, `recommended`, `active` | DynamoDB | presentation the owner controls per plan |
| `panel` (card colour) | **nowhere** — derived by `planPanels()` from the `recommended` flags | the dark card *is* the recommendation, so it follows the flag the owner already sets; the quiet two follow card order (§18.4) |
| rotation weeks | DynamoDB, `PLAN#<id> / WEEK#<n>` | operational, feeds the sow plan |

**Plan copy must never state the price or the box weight.** Both are printed on the card from
DynamoDB and both are expected to move, so copy restating them makes the card contradict itself a
few pixels apart. The contract test fails on it, in Latin and Kannada digits and both currency
words — the same rule §4.3 applies to `growDays` in variety prose, and for the same reason.

A plan whose content file is missing is **skipped** by the home page and flagged in red in admin,
naming the exact path. Declaring a plan before writing its copy is therefore safe: it just stays
off the site.

### 5.2 The 4-week rotation — critical design point

A monthly plan is **not the same box four times**. It is a rotation designed around grow days:

- **Week 1** delivers varieties with `growDays = 7`, sown on the first Sunday.
- **Week 2** delivers varieties with `growDays = 14`, sown on that *same* first Sunday.
- **Weeks 3–4** repeat the pattern from the second Sunday's sow.

This is what resolves the apparent 6-day grow window: each Sunday you sow both next week's fast
crops and the following week's slow crops in parallel.

For **Build Your Own**: the customer picks varieties and quantities, the system segregates those
picks into grow-day groups, assigns each to the correct rotation week, and **shows the customer
their week-by-week delivery schedule before payment** — "here is what arrives on each of your four
Saturdays". This preview is a required part of the BYO flow, not a nice-to-have.

### 5.3 Weekly operating rhythm

**This cycle governs subscriptions only.** A one-off order (§18.6) is sown the **next day** and cut
`growDays` later — corrected 15 Sep 2026 on the owner's instruction. The cycle exists to batch a
month of committed subscription demand into one sow; a single 100 g order has nothing to batch with,
so making it wait up to six days for a Sunday would add most of a week to the promise for no
operational gain. Both rules live in `src/lib/delivery-date.ts`.

```
Fri 23:59  ─ CUTOFF (Saturday 00:00). Cycle locks; no new subscription counts toward it.
Sun AM     ─ SOW. Owner works the generated sowing plan.
Sat        ─ HARVEST + DELIVER (the following Saturday).
```

Subscribe *after* the cutoff and the first delivery rolls to the Saturday after.
**Checkout must display the customer's actual first-delivery date before they pay.** This is the
single most important piece of expectation-setting on the site.

Cycle states: `open → locked → sown → delivered`.

### 5.4 Mid-cycle changes

Allowed:
- **Skip a week** — before the cutoff only. No refund; the plan end date extends by one week.
- **Change delivery address** — re-validated against the PIN allowlist, blocked if outside.

Not in v1: pausing a subscription, swapping varieties mid-cycle. Variety changes happen at renewal.

### 5.5 Renewal

Prepaid blocks with **manual renewal**. No auto-debit mandate, no UPI Autopay or e-NACH. Reminder
email as the term nears its end; the customer renews themselves.

---

## 6. The sowing plan — core admin feature

Generated automatically when a cycle locks. Fully deterministic:

> For each sow Sunday, for every delivery week in the horizon, for every variety required in it:
> if `deliveryDate − growDays == this Sunday`, it must be sown now.
> `trays = ceil(total grams committed ÷ yieldGramsPerTray)`

What the owner sees each Saturday after cutoff:

| Variety | Grams committed | Yield/tray | **Trays to sow** | Seed needed | For delivery |
|---|---|---|---|---|---|
| Radish | 2,400 g | 300 g | **8** | 160 g | Sat 21 Mar |
| Sunflower | 1,800 g | 250 g | **8** | 400 g | Sat 28 Mar |

Seed-needed column appears only for varieties with `seedGramsPerTray` set.

---

## 7. Delivery & serviceability

- **PIN allowlist**, admin-managed. A non-serviceable PIN blocks checkout with a clear message and
  an optional "notify me when you reach my area" capture.
- **The PIN check lives in checkout, not on the home page** (decided 16 Sep 2026, closing the
  §18.3 open decision). The gate that matters is the one before payment, and it is enforced
  server-side there; a second copy in the hero was a marketing surface competing with the
  headline for the fold, and it asked a visitor to prove their eligibility before the site had
  told them what it sells. `PinCheck.tsx` stays in the repo for checkout to mount.
- Delivery charging via `ShippingRateProvider`:
  - **v1, rules-based:** subscription price *includes* delivery, but the amount is computed and
    itemised at payment; racks a flat **₹500**; seeds calculated at payment; ⟨trays — rate rule
    still to be set; they are bulky like racks but lighter⟩.
  - **v2, dynamic:** adapter for a courier partner quoting from the full address.
- Everything consolidates onto the **same Saturday run**.
- **Seed has its own dispatch rule, set 17 Sep 2026** (§22.2): up to what is on the shelf goes out
  **next day**, and anything beyond it is bought in from the supplier and promised **within 10
  days**. That is a *timing* rule and it does not set a *charge* — the seed delivery rate is still
  unset above. A cart mixing seed and greens takes one trip on the slowest line's date, so this
  rule can push a greens order later than its grow window.
- **Trays and drainage have one too, set the same day** (§23.1): nothing is held, so every order is
  bought in and promised on a **per-item lead time with a floor of 7 days**. Three rules now
  coexist — grow days, the seed shelf, and a supplier lead time — and `latestDate` is what keeps
  them one delivery. Also a timing rule: the tray rate is the ⟨⟩ above and is still unset, which
  matters more now that trays are real rows with real prices.

---

## 8. Roles & access

| Role | Can see / do |
|---|---|
| **Guest** | Browse catalogue, check PIN, buy seeds/racks/value-add without an account. Delivery details at checkout **auto-provision an account**; a claim/set-password link follows by email. Subscriptions require an account. |
| **Customer** | Own subscription (skip week, change address, renew, view schedule), order history, receipts, saved addresses, profile |
| **Delivery / packing staff** | **Only the current run** — pick-pack list per customer, route order, mark delivered/failed with a note. No pricing, no admin screens, no customer data beyond delivery needs |
| **Admin (owner)** | Everything — catalogue, variety yield/grow data, curated pack contents, seed stock, PIN list, cycles, sow plan, orders, delivery status, payments and refunds, coupons and sales, customers, reports, settings |

Enforce roles in **server-side middleware and every server action**, not just by hiding UI. The
staff role in particular must be a genuine data restriction.

### 8.2 Operator copy never reaches a customer — fixed 15 Sep 2026

Every **empty state is role-aware**, because three of them were showing a visitor instructions for a
screen they cannot open:

| Surface | What a customer saw | What they see now |
|---|---|---|
| `#plans` (home) | "No plans published yet · Create Essential, Exotic or Build Your Own" + a button to `/admin/plans` | "Weekly plans open soon · Greens are still available by the 100 g" + a button to `/microgreens` |
| `/microgreens` | "No varieties yet. Add them in admin → varieties" | "Nothing is listed right now — check back shortly" + a link to `/shop` |
| `/shop/[category]` | "Nothing here yet. Add racks in admin → products" | "No racks are listed right now — check back shortly" |

Two rules follow, and they are cheap to keep:

1. **Operator strings live in `admin.json`**, the English-only namespace (§4.4), never in a customer
   namespace. `common.empty.addInAdmin` was deleted in the same pass — an unused key of exactly this
   kind.
2. **They are resolved only when the viewer is an admin**, so a customer's HTML does not contain
   them at all. On the home page that means `Bundles` (a client component) takes the strings as a
   prop that is `null` for everyone else — it cannot read `admin` messages anyway, since the root
   layout keeps that namespace out of the client catalogue.

Verified by reading the rendered HTML as a guest: no `/admin/` href, no "Add a plan", no "Create
Essential" — and the same pages as an admin still carry all three. Kannada checked too; the new
customer copy renders in `kn` rather than falling back.

### 8.3 Admin navigation is a left rail — 17 Sep 2026

Navigation was a horizontal row of pills. Six of them already filled the width
and §12 lists a dozen more admin routes to come, so the row had nowhere to grow
and no room for a grouping. It is now a **14rem rail** (`AdminNav.tsx`), with
the routes grouped under headings and the operator's identity and `My account`
link pushed to the foot.

Three things worth knowing about it:

- **The content got wider, not narrower.** The shell went from a 1100px measure
  to 1400px, so the content column is about 1,080px against the old ~970px even
  after losing 14rem to the rail. The rack tables (§19.3) are the widest thing
  in admin at ~990px of tracks and they now fit without the horizontal scroll
  they used to need at full width.
- **`min-w-0` on the content column is load-bearing.** Without it a flex child
  refuses to shrink below its content, so a table's own `overflow-x-auto` never
  engages — it widens the whole page instead and drags the rail off-screen.
- **The route map lives in `nav-items.ts`, not in the component.** `AdminNav` is
  `"use client"` (it needs `usePathname` to mark the current route), and every
  export of a client module is a client *reference* when a server component
  imports it. The layout reads the label list to resolve one translation per
  item, and reading a client reference on the server throws — it did, as a 500
  on every admin page, while the constant shared the component's file.

Groups hold **only routes that exist.** A heading with nothing under it, or a
link to a page that 404s, is worse than an absent section — the public nav
already has one of those (`/how-we-grow`) and admin should not gain a second.
Operations, Sales and Settings groups get added when their first screen is
built.

Below `lg` the rail becomes one horizontally scrolling strip and the group
headings are hidden: a stack of eighteen rows would push the page content off a
phone's first screen, and a heading inside a scrolling strip reads as another
link.

The same pass fixed a **pre-existing mobile overflow** in the three rack
tables. A row's tracks come from an inline `gridTemplateColumns`, which applies
at every width, so at 414px the Save / Active / Delete controls pushed the
document 344px wide — and with a rail in place that dragged the navigation with
it. Each table's rows now sit in their own `overflow-x-auto` box with a
`min-w-`; the add form stays outside it, so it never slides sideways with the
rows. Stacking to one column was not the alternative: a compact row's inputs
carry their label only as an `aria-label`, so it would leave an operator with
unlabelled boxes.

### 8.1 Authentication — DECIDED & IMPLEMENTED 14 Sep 2026

**Auth.js (`next-auth@5.0.0-beta.32`) + `@auth/dynamodb-adapter@2.11.3`. Google SSO + email
magic link. No passwords. Database sessions.**

#### Why not Cognito

The deciding factor was not cost — Cognito is free to 10,000 MAU ($0.0055/MAU on Lite thereafter),
which this business will never exceed. It was **local development**: AWS ships no official Cognito
emulator, so building against it means either opening an AWS account immediately or developing
against a community reimplementation (`cognito-local`, self-described as "a Good Enough offline
emulator") and switching to the real service at launch. Note also that LocalStack archived its free
community edition in March 2026.

Two further points: Cognito puts the user directory **outside** our own tables, so profiles must
be mirrored in via a post-confirmation Lambda and kept in step forever; and **Cognito will not
export password hashes**, so migrating off it later forces every customer to reset their password.

Auth.js requires no AWS account at all. Combined with DynamoDB Local, the entire application can be
built and tested before the AWS account is opened.

*Better Auth was also evaluated and rejected: stable at 1.7.4 with good ergonomics, but it has no
official DynamoDB adapter — only immature community packages (v1.0.1 and v0.2.2) — which would mean
a second datastore or writing an adapter.*

#### Why no passwords

The Credentials provider **forces the JWT session strategy app-wide**. This is enforced, not
advisory — `@auth/core/lib/utils/assert.js`:

> `"Signing in with credentials only supported if JWT strategy is enabled"`

Database sessions are worth more than password convenience here, because they make revoking an
admin or staff member take effect on their **next request**. With a JWT, a demoted admin keeps admin
until the token expires.

**Adding passwords later is possible and bounded:** flip `session.strategy` to `"jwt"`, which logs
everyone out once. It changes **no authorisation code**, because `requireRole` reads the role from
DynamoDB rather than from the session. That property is the reason to keep it that way.

#### Google OAuth — verified facts

For the `email` / `profile` / `openid` scopes there is an explicit carve-out in Google's rules:

| | Reality for our scopes |
|---|---|
| Cost | **₹0 at any volume.** No per-login charge |
| User limit in production | **None** |
| Verification to publish | **Not required** |
| "Unverified app" warning | **Never shown** |
| 100-test-user cap | Does not apply |
| 7-day consent expiry | Does not apply |

So **publish the consent screen straight to production** — free, instant, no review queue. Localhost
keeps working because Google exempts loopback from its HTTPS rule:

> "Redirect URIs must use the HTTPS scheme, not plain HTTP. Localhost URIs (including localhost IP
> address URIs) are exempt from this rule."

**This carve-out is conditional on staying on those three scopes.** Adding any Google API — reading a
customer's Calendar, sending through their Gmail — moves the app into sensitive-scope territory and
the verification requirement and user cap reappear.

`allowDangerousEmailAccountLinking: true` is set **on Google only**. Without it, a user who first
signs in by magic link and later clicks "Continue with Google" on the same address is refused with
`OAuthAccountNotLinked` (`handle-login.js:250`), which reads to them as a broken site. It is
defensible for Google because Google verifies email ownership itself. **Do not copy this flag to a
provider that does not.**

#### Email delivery

Magic links are defined as an inline provider rather than via the Nodemailer provider. `nodemailer`
is an *optional* peer dependency and `EmailConfig` only requires `sendVerificationRequest`, so:

- **Development:** the link is printed to the terminal. No SMTP, no email service, no credentials.
- **Launch:** send through SPEC §11's `NotificationProvider` — Resend free tier (3,000/month,
  100/day, 3 domains, no AWS account) or SES once the AWS account exists.

#### Roles

Three stored roles — `customer`, `staff`, `admin` (guest is the *absence* of a session, not a stored
role). Ranked as a total order, which is valid while SPEC §8's roles nest cleanly. If that ever
stops being true, replace the ranking with explicit capabilities rather than bending it.

`role` is stored as an attribute on the adapter's own user item (`USER#<id> / USER#<id>`), so
reading it is a single `GetItem` on the primary key.

**The first admin comes from `ADMIN_EMAILS`.** There is no seeded account and no way to self-promote
through the UI. `ensureUserRole` uses `attribute_not_exists(#r)`, so a deliberate demotion in the
table is never silently undone by a later sign-in.

#### Three layers, and only one of them is the security boundary

| Layer | Purpose | Is it a gate? |
|---|---|---|
| `src/proxy.ts` | Redirect signed-out visitors to `/login` | **No** — checks only cookie presence |
| `requireRole()` in the admin layout | Block insufficient rank, redirect to `/forbidden` | **Yes** — reads DynamoDB |
| `assertRole()` in every server action | Block direct invocation | **Yes** — reads DynamoDB |

`middleware.ts` is **deprecated in Next.js 16 and renamed to `proxy.ts`**, which defaults to the
Node.js runtime. It must live at `src/proxy.ts`, beside `app/` — not the repository root. The
framework's own warning is why it cannot be the gate:

> "A matcher change or a refactor that moves a Server Function to a different route can silently
> remove Proxy coverage. Always verify authentication and authorization inside each Server Function
> rather than relying on Proxy alone."

`session.user.role` exists for **rendering only** — showing or hiding an Admin link. Never gate on
it.

#### Still to do

- Guest checkout auto-provisioning and the `/account/claim` flow (SPEC §8) — the magic-link
  machinery is in place and is the same mechanism.
- Staff role assignment UI. Roles are currently changed by editing the table.
- `/staff/*` pages; `src/proxy.ts` already matches them. `/account/*` is built (§18.7).
- Phone number is collected at checkout for delivery coordination, never used as the login.

---

## 9. Payments

**Cashfree**, behind a `PaymentProvider` adapter.

Verified from Cashfree's published charges page against Razorpay's:

| | Razorpay | Cashfree |
|---|---|---|
| **UPI** | 2% + 18% GST (levied as a *platform fee*, sidestepping zero-MDR) | **0% — "as per applicable law"** |
| Cards / netbanking / wallets / RuPay | 2% + GST | 1.95% (festive rate) |
| Amex | 2% + GST | 2.95% |
| International | up to 3% | 2.99% |
| Setup / AMC | ₹0 | ₹0 |
| Settlement | — | T+1 by 8pm IST |

Decisive factor: **Cashfree is offering ₹0 fees on the first ₹20 lakh GMV for new merchants through
31 March 2027** (excludes EMI and pay-later). At ₹1,200/month × 100 subscribers that is roughly 16
months of free processing. Most Indian D2C traffic pays by UPI at 0% thereafter.

**Confirm before wiring up:** whether 1.95% is a temporary festive rate, and whether 18% GST is
added on top as it is with Razorpay. The page does not say.

Implementation requirements:
- Server-side order creation; never trust a client-reported amount.
- **Webhook-driven activation** — a subscription becomes active on the verified webhook, not on the
  browser redirect. Verify the signature on every webhook.
- Idempotency on webhook handling; store every payment event.
- Refunds initiated from admin, recorded against the order.

### 9.1 Invoicing

**Simple receipts, no GST at launch** — emailed PDF with order number, items, delivery charge,
total. No GSTIN or tax breakdown.

Reserve `hsnCode` and `taxRate` fields on every product now, and keep receipt numbering sequential,
so GST can be switched on later without a data migration.

---

## 10. Discounts & coupons

All admin-controlled with active/inactive toggles:

- **Coupon codes** — percentage or flat amount, minimum order value, overall and per-customer usage
  caps, validity window, restricted to given products or plan tiers.
- **Site-wide or category sale** — a percentage off the whole catalogue or one category, with
  strikethrough pricing on cards. No code needed.
- **First-order discount** — automatic on a customer's first subscription.
- **Referral discount** — a code crediting both referrer and new customer.

Not wanted: automatic plan-duration discounts — use coupons instead.

Validate and apply every discount **server-side at order creation**. Enforce usage caps with a
DynamoDB conditional write on the `COUPON#<code> / REDEEM#<userId>` item to prevent double-redemption
under concurrent requests.

---

## 11. Notifications

**Email only in v1** — free at this scale (SES ≈ ₹9 per 1,000; Resend free tier ~3,000/month).

All messages go through a single `NotificationProvider` interface so a WhatsApp or SMS adapter drops
in later without touching order, subscription or delivery code.

Messages: order/subscription confirmation (with the first-delivery date), skip confirmation,
address-change confirmation, delivery-day reminder, renewal reminder, account claim link,
promotional campaigns.

WhatsApp was costed and deliberately deferred. Verified from Meta's developer docs: there is no
free monthly conversation quota any more, utility templates are free **only** inside a 24-hour
window the customer opened by messaging you first — which a website order does not open — and
marketing templates are always paid. Roughly ₹220/month at 100 subscribers, mostly promotions. The
real blocker is Meta Business verification and per-template approval, not the money.

---

## 12. Page inventory

### Public
| Route | Contents |
|---|---|
| `/` | Hero, category tiles, how-it-works strip, plan teaser, testimonials (no PIN check — §7) |
| `/subscribe` | The three plans compared side by side |
| `/subscribe/essential`, `/subscribe/exotic` | What arrives in each of the 4 rotation weeks, price, first-delivery date |
| `/subscribe/build` | **BYO builder** — variety picker with quantities, live price, grow-group segregation, week-by-week schedule preview |
| `/microgreens` | Variety grid — a shopping surface, not a library (§18.6). Each block shows grow days |
| `/microgreens/[key]` | Variety detail — built, §18.10. Flavour, nutrition, benefits, cautions, growing tips, FAQs, gallery, grow days, price per 100 g. The **100 g quantity selector and add-to-cart** (§18.6) wait on `/cart` |
| `/seeds` | Seed grid — built, §22.5. Price per 100 g only; the grams held are internal, and **no seed is ever listed as sold out** (§22.2) |
| `/seeds/[key]` | Seed detail — built, §22.5. The **same layout as a variety page**, filled with the seed's spec table, sowing instructions and uses. Any quantity, minimum 100 g, with a dated delivery promise per quantity |
| `/shop` | Index of all five categories with live counts. Microgreens, seeds and trays link to their own routes |
| `/shop/racks` | The three rack ranges — built, §19.6. A photograph, a name, six scrolling properties and a from-price per range |
| `/shop/racks/[range]` | Pick a rack and buy it — built, §19.7. Height, shelf size and colour as options **in the URL**, then the price and add-to-cart |
| `/shop/trays` | Trays & drainage — built, §23.5. Its own static route, because trays left `Product` for their own entity and content files. A grid with a spec table and a dated promise per card, each linking to its detail page |
| `/shop/trays/[key]` | Tray detail — built, §23.3. **Deliberately minimal**: gallery, the four spec rows as facts, and the buy box. No description, no FAQ, no spec table repeated below |
| `/shop/[category]` | What is left of the generic category page — racks and snacks. `/shop/microgreens` and `/shop/seeds` redirect to `/microgreens` and `/seeds`; `/shop/trays` is a static route that wins over this one |
| `/shop/[category]/[slug]` | Product detail for what is left on `Product` — snacks. **Not built.** Trays got their own detail route instead (`/shop/trays/[key]`, §23.3) rather than a generic one |
| `/cart` | Line items, delivery estimate, coupon field |
| `/checkout` | PIN gate → address → **delivery date shown** → coupon → payment |
| `/order/[id]/confirmation` | Receipt, first-delivery date, claim-account prompt for guests |
| `/story` | Story-led about page — the main brand surface |
| `/how-it-works` | Cutoff, sowing Sunday, Saturday delivery, the 4-week rotation, explained visually |
| `/recipes`, `/recipes/[slug]` | Usage ideas, cross-linked from variety pages |
| `/faq`, `/contact` | |
| `/terms`, `/privacy`, `/refund-policy`, `/shipping-policy` | **Required by the payment gateway for merchant approval** — not optional |

### Customer account
`/account` (next delivery + status) · `/account/subscription` (skip, change address, renew, full
schedule) · `/account/orders` · `/account/orders/[id]` · `/account/addresses` · `/account/profile` ·
`/account/claim` (set password for auto-provisioned accounts)

### Admin
`/admin` (this week at a glance) · `/admin/varieties` (CRUD incl. yield + grow days) ·
`/admin/plans` (curate the Essential/Exotic rotation weeks) · `/admin/seeds` (price per 100 g and
grams held — §22.3, replaced `/admin/products`) · `/admin/trays` (pack price and lead days —
§23.4) · `/admin/racks`, `/admin/angle-racks`,
`/admin/pipe-racks` (the three computed rack ranges, §19–§21) · `/admin/cycles` (list, lock a cycle) · `/admin/sow-plan/[sowDate]` (the
sow sheet) · `/admin/deliveries/[date]` (pick-pack, route, status) · `/admin/orders` ·
`/admin/orders/[id]` · `/admin/subscriptions` · `/admin/customers` · `/admin/coupons` ·
`/admin/sales` · `/admin/pincodes` · `/admin/payments` (reconciliation, refunds) · `/admin/reports` ·
`/admin/settings` (brand, cutoff times, delivery rates)

### Staff
`/staff/run/[date]` — mobile-first delivery run list, tap to mark delivered/failed with a note

---

## 13. State machines

**Cycle:** `open → locked → sown → delivered`

**Subscription:** `pending_payment → active → (skipped week) → expiring → expired | cancelled`

**Subscription week:** `scheduled → skipped | packed → out_for_delivery → delivered | failed`

**One-off order:** `pending_payment → paid → packed → out_for_delivery → delivered | failed → refunded`

---

## 14. Build sequence

Each phase is a session's worth of work and leaves something usable.

**Phase 0 — scaffold (this session).** Three deliverables:

1. A **plain Next.js app** at `~/projects/personal/fewgrams`, created with:
   ```bash
   npx create-next-app@latest fewgrams --typescript --tailwind --eslint \
       --app --src-dir --import-alias "@/*"
   ```
   Nothing beyond the scaffold — no auth, no AWS SDK, no `next-intl` yet. Those arrive in phase 1.
   Verify with `npm run dev` and `npm run build`.
2. **This specification copied into the project** at `docs/SPEC.md`, so it is versioned alongside
   the code rather than living only in the plans directory.
3. **Git multi-account configuration** per §2.3, then `git init`, an initial commit, and the
   `github-personal` SSH remote. The two values named in §2.3 are needed before the identity config
   can be written correctly.

Then:

1. **Foundation** — CDK stack (DynamoDB table + GSIs, S3, SES, IAM) with stack outputs wired into
   Amplify environment variables; Amplify Hosting app connected to the repo; Auth.js with Google +
   password, roles in middleware, Tailwind/shadcn, brand config file, Cloudflare → Amplify DNS, **`next-intl` with
   locale routing and the `LocalisedString` helper wired in from day one** (cheap now, a migration
   later).
2. **Catalogue (admin first)** — `/admin/varieties` with yield and grow days, `/admin/seeds` with
   price per 100 g and grams held (§22.3), plus the content-file loader and its completeness check.
   Nothing downstream can be built or tested without real variety data. Tray variants wait for a
   tray screen; the generic products screen was removed on 17 Sep 2026 rather than extended.
3. **Public catalogue** — home, `/microgreens`, `/shop` and their detail pages.
4. **Plans & BYO builder** — plan definitions, the 4-week rotation editor, and the BYO
   grow-group segregation with schedule preview. **The highest-risk logic in the build — write unit
   tests for the segregation and first-delivery-date rules before the UI.**
5. **Cart & checkout** — PIN gate, addresses, delivery-rate rules, coupon validation, Cashfree
   adapter, webhook activation, guest auto-provisioning.
6. **Customer account** — subscription view, skip week, change address, orders, receipts.
7. **Cycles, sow plan & fulfilment** — cycle locking, sow-plan generation, `/admin/deliveries/[date]`,
   staff run app.
8. **Discounts** — coupons, category sale, first-order and referral.
9. **Content & polish** — story, how-it-works, recipes, legal pages, SEO/`hreflang`, email templates,
   Kannada translation of UI chrome and the high-intent pages.

---

## 15. Verification

- **Unit tests, before the UI, on the pure logic:** first-delivery-date calculation across the
  Saturday 00:00 cutoff boundary (including a Sunday 00:01 order landing 13 days out), BYO
  grow-group segregation, `trays = ceil(grams / yieldGramsPerTray)`, coupon cap enforcement,
  delivery-rate rules.
- **PIN gate:** attempt checkout with a non-serviceable PIN and confirm it is refused server-side,
  not only hidden in the UI.
- **Seed stock:** order more grams than held and confirm rejection; confirm two concurrent orders
  cannot oversell the same stock.
- **Payment:** run Cashfree test mode end to end. Confirm a subscription activates **only** on the
  verified webhook — kill the browser before redirect and confirm activation still happens. Replay
  the same webhook and confirm idempotency.
- **Role isolation:** sign in as staff and attempt to reach `/admin/*` and any admin server action
  directly; confirm both are refused.
- **Variants:** confirm a tray added to the cart carries its specific variant SKU and price, and
  that two materials of the same tray are distinct cart lines.
- **Localisation:** remove a `kn` key and then a whole `*.kn.json` file, load `/kn`, and confirm
  clean English fallback — no empty strings, no raw message keys. Confirm the build-time check
  actually fails the build when an active variety slug is missing from `microgreens.en.json`, and
  only warns when missing from `microgreens.kn.json`.
- **Full-cycle rehearsal, the real acceptance test:** seed two subscribers (one Essential, one BYO)
  plus a seed order and a rack order → lock the cycle → generate the sow plan → verify tray counts
  by hand against yield figures → work the pick-pack list → mark delivered in the staff app →
  confirm every customer-facing status and email is correct.
- Per global instruction: report passed **and** skipped test counts separately, and say what any
  skipped tests cover. Never report a skipped test as passing.

---

## 16. Open items & risks

- **FSSAI registration** is legally required to sell food in India, and the value-added sandwiches
  and salads make this unavoidable. Needed before launch, not after. Display the licence number in
  the footer.
- **Cashfree terms to confirm:** is 1.95% the standard or festive rate, and is 18% GST added on top?
- **Seed stock is ambiguous** — the gram stock you sell to customers versus seed you consume growing
  your own trays. Assumption taken: **retail seed stock is tracked separately from grow stock**, and
  the sow plan's seed column is advisory only and does not decrement retail stock. Confirm this.
- **Legal pages gate merchant approval.** Terms, privacy, refund and shipping policies are needed
  for Cashfree onboarding — do not leave them to the final phase.
- **`yieldGramsPerTray` will be wrong at first.** It comes from your own experiments and the sow
  plan is only as good as it. Keep it editable per variety and review it after the first few weeks.
- **Forecast risk on 14-day varieties is real but bounded** — week 2 of a monthly plan is sown from
  a *confirmed, paid* subscription, so it is committed demand, not a forecast. Speculative sowing
  only arises if you later sell 14-day varieties to non-subscribers.
- **Trademark work never run** on any brand name, including Fewgrams: Class 31 search at
  `tmrsearch.ipindia.gov.in`, MCA company-name check, and social handle availability.
- **Amplify's Next.js version support** must be checked before any Next.js major upgrade. Pin the
  version and verify Amplify supports it first.
- **Amplify Hosting cost** is billed on build minutes and data served. Harmless at launch; if it
  becomes material, the CDK + OpenNext route is effectively free at this scale (§2.2).
- **Mixed-cart delivery dates unresolved (§18.6).** Ad-hoc orders spanning 7-day and 14-day
  varieties are ready on different Saturdays. Needs a rule before the variety page is built.
- **Ad-hoc vs subscription price gap not set (§18.6).** Without a deliberate gap, one-off 100 g
  buying undercuts the subscription, which is the only recurring revenue.
- **A visitor outside the delivery zone learns so only at checkout** — the deliberate choice
  in §7. The refusal there has to be unmistakable and has to arrive before the payment step,
  not with it, because it is now the *only* place the constraint is stated.
- **"How we grow" — 3D models vs photography undecided (§18.5).**
- **Bundle prices do not exist yet.** §18.4 is built against a typed placeholder until Phase 2
  ships the admin UI.
- **Tray delivery rate not set**, and it matters more since 17 Sep 2026 because trays are now real
  rows with real prices (§23). Racks are a flat ₹500; trays are bulky but lighter, so they need
  their own rule in the `ShippingRateProvider`. A drainage mat pack is five 50 × 25 cm sheets —
  closer to a rack than to a bag of seed.
- **Trays carry no stock count**, which is now a *decision* rather than a gap (§23.1): nothing is
  held, so every order is a purchase order and the honest model is a lead time, not a count. The
  risk it leaves is different from the one first written here — not that we oversell, but that
  **nobody is told to go and place the supplier order.** That gap got sharper on 17 Sep 2026, when
  trays became addable to the cart (§23.7): a customer can now commit to a seven-day promise that
  generates no purchase order anywhere. It needs checkout (§9).
- **Kannada content coverage** is a standing cost, not a one-off task. Every new variety or recipe
  needs a second content file or it silently falls back to English.
- Brand name and logo should come from **one config file** so the visual identity can change
  cheaply.

---

## 17. Visual design system

Decided 14 Sep 2026. Reference: `organicmandya.com` for palette and type; `donmolinico.es`
for card motion and the page loader; `ripeplanet.com` for the full-screen menu overlay.

### 17.1 Palette

Extracted from Organic Mandya's stylesheet, then deliberately shifted so Fewgrams is adjacent
rather than a clone — they are an established Bengaluru organic-food brand with 22+ stores, and an
identical identity in the same city and category would read as derivative.

| Token | Hex | Use |
|---|---|---|
| `forest` | `#033923` | Primary. Dark bands, footer, menu overlay, primary buttons |
| `forest-deep` | `#0C3A26` | Hover state on forest surfaces |
| `sage` | `#A8CF8E` | Accent. Icon badges, tags, the Everyday Essentials card panel |
| `mint` | `#ABE1CC` | Soft highlight on dark backgrounds |
| `cream` | `#FBF9F3` | Default page background |
| `sand` | `#F2EBE3` | Alternating section band, the third bundle card's ground |
| `ink` | `#1A1A1A` | Body text on light |
| `stone` | `#6B7268` | Muted / secondary text |
| `terracotta` | `#C7452F` | Errors only — including "we don't deliver to your PIN yet" |
| `bark` | `#5A3E22` | The logo's brown. The Pick Your Own badge, and warm accents on light grounds |
| `tan` | `#D9B48A` | The logo's brown, lightened. Currently unused on screen — see below |

**`bark` and `tan` come from the logo itself** (added 15 Sep 2026) — `#5A3E22` is the brown in
`fewgrams-logo.svg` and `#D9B48A` is the lightened version the white lockup carries on a dark
ground. They are a matched pair, not a tint of one another. Added because three green pills over
three cream cards all read as the same badge: a warm secondary against a green primary says "not
the recommended one" before a word is read.

`tan` was that warm secondary for one iteration and is **now carried by nothing**. Once each card
got its own ground (§18.4), the third card's ground became `sand` and a `tan` pill on it measures
**1.35:1** — the same warmth at the same lightness, so the pill dissolved into the card. `bark`,
the darker half of the same pair, took the job at 8.28:1. `tan` is kept as a token because it is
genuinely in the logo and will be wanted on a dark ground, where it reads (6.72:1 on `forest`).

**Deliberately dropped:** Organic Mandya's signature teal `#108474`. It is their most recognisable
colour, and it measures **4.36:1 on cream — below the 4.5:1 WCAG AA minimum for body text** anyway.

**Verified contrast ratios** (computed, not assumed):

| Pair | Ratio | Body 4.5:1 | Large/UI 3:1 |
|---|---|---|---|
| `ink` on `cream` | 16.53 | PASS | PASS |
| `forest` on `cream` | 12.36 | PASS | PASS |
| `forest` on `sand` | 11.01 | PASS | PASS |
| `cream` on `forest` | 13.02 | PASS | PASS |
| `forest` on `sage` | 7.43 | PASS | PASS |
| `mint` on `forest` | 8.91 | PASS | PASS |
| `stone` on `cream` | 4.71 | PASS | PASS |
| `terracotta` on `cream` | 4.62 | PASS | PASS |
| `forest` on `tan` | 6.72 | PASS | PASS |
| `bark` on `tan` | 5.05 | PASS | PASS |
| `cream` on `bark` | 9.29 | PASS | PASS |
| `bark` on `sand` | 8.28 | PASS | PASS |
| `forest/80` on `sage` | 4.80 | PASS | PASS |
| `forest/75` on `sand` | 5.49 | PASS | PASS |
| `stone` on `sand` | **4.20** | **FAIL** | PASS |
| `forest/70` on `sage` | **3.82** | **FAIL** | PASS |
| `tan` on `sand` | **1.35** | **FAIL** | **FAIL** |

**`forest-deep` was broken for the whole build and nobody could see it.** It was `#0C3A26`, which
measures **1.022:1 against `forest` and is very slightly lighter** — so every
`hover:bg-forest-deep` button on the site (Subscribe, Add to cart, cart checkout, login, every
admin save) had no visible hover state at all. Found because the Subscribe button looked inert.
It is now `#022718`: half the luminance of `forest` (0.0153 vs 0.0307, 1.235:1), unmistakable on
hover, still the same green, and `cream` on it is 15.27:1. A token whose name promises a direction
it does not deliver is worse than no token.

`stone` at 4.71 clears body text with little margin — do not darken the background behind it or
lighten the token without re-checking. The three failing rows are recorded because each was a
class that looked safe and was measured only after it shipped somewhere:

- **`stone` on `sand` (4.20)** — `stone` is *the* muted-text token and had only ever sat on `cream`
  (4.71). It fails on `sand`, which is why the bundle cards use `forest` at an alpha for body text
  instead of `stone` now that one of them has a `sand` ground (§18.4).
- **`forest/70` on `sage` (3.82)** — the obvious "muted on a light green ground" and it misses.
  `/80` is the first step that clears, which is why the sage card's body text is one step heavier
  than the sand card's.
- **`tan` on `sand` (1.35)** — see above.

### 17.2 Typography

| Role | Family | Weights |
|---|---|---|
| Headings / display | **Quicksand** | 500, 600, 700 |
| Body / UI | **Montserrat** | 400, 500, 600 |
| Kannada (`kn` locale) | **Noto Sans Kannada** | 400, 600 |

All three are free Google Fonts, self-hosted via `next/font` — no runtime request to Google, and
no layout shift. Noto Sans Kannada loads on **every** page, not only `/kn`, because the language
switch renders its own endonym in Kannada while sitting on an English page.

#### Small-caps UI labels — the `.ui-label` contract

**Added 15 Sep 2026.** Nav items, category pills and section eyebrows share one treatment:
uppercase with wide tracking. That is a Latin convention and it is wrong for Kannada — the
transform is a no-op in a script with no letter case, and letter-spacing pulls apart conjunct
clusters that must render joined.

**Use `.ui-label` for every such label, and set `--label-size` rather than a `text-*` class.**
The rule handles the script switch by `:lang`, so no component branches on locale.

```
.ui-label            → font-size: var(--label-size); uppercase; 0.1em tracking; line-height: 16px
.ui-label:lang(kn)   → Noto Sans Kannada; no transform; no tracking;
                       font-size: calc(var(--label-size) * 1.06); position: relative; top: 0.277em
```

Four things in there are load-bearing, and each one was a bug first:

1. **`.ui-label:lang(kn)`, not `:lang(kn) .ui-label`.** The descendant form matches every label
   inside `<html lang="kn">` regardless of the element's own `lang`, which rendered the switch's
   Latin `EN` in Noto Sans Kannada. The compound form tests the element's own computed language.
2. **`--label-size`, not `em` or `%`.** Both resolve against the **parent's** font size, so
   `1.06em` on a 13px nav link inside a 16px container computed to **16.96px**. A custom property
   is the only unit that refers to the value actually meant.
3. **A fixed `line-height: 16px`, not `line-height: 1`.** With `1` the line box tracks the font
   size, so the same label sat differently depending on what shared its row — the nav's box is
   driven by its own padding, the language switch's by a 16px globe. One fixed height makes every
   label's box identical wherever it appears, which is what lets a single Kannada nudge be correct
   on every page instead of one of them.
4. **`top: 0.277em`** aligns the centre of the **base letterforms**, which is what the eye
   compares:

   | | ink ascent at 13px | as em |
   |---|---|---|
   | Montserrat cap height | 9.23 | 0.710em |
   | Noto Sans Kannada base | 10.25 | 0.788em |

   Derived from base letterforms, deliberately **not** from the full ink box. Ink height swings
   with a string's marks — `ಅಂಗಡಿ` has almost no descender, `ಮೈಕ್ರೋಗ್ರೀನ್ಸ್` has 5.45px of them — so
   tuning to ink centre gives a different answer for every word.

**Two things outside the CSS that broke the same alignment:**

- **Load every weight the UI uses.** `Noto_Sans_Kannada` was loaded with `["400","600"]` while the
  nav uses `font-medium` (500). With no 500 face the browser fell back to 400, so Kannada rendered
  a full step lighter and read as "smaller". It is not smaller — see the table above.
- **No vertical padding on the `<nav>` itself.** A `pb-0.5` there for scrollbar room shifted the
  whole group up 1px against the utilities beside it — invisible alone, obvious next to the
  language switch. Per-link `pt-1` matching `pb-0.5 + border-b-2` keeps each link's box symmetric.

**The `1.06` size multiplier is a taste dial, not a metric.** Kannada base glyphs are already
taller than Latin caps; 1.08 read as too large, 1.00 read as too small once the weight bug was
fixed. Change that one number if it still feels off.

Verified in the browser: every label — nav items and the language switch, in both locales — lands
at an identical optical centre (30.38px), and the category strip pills agree with each other.

#### Why the switch links to `/en` and not `/`

`localePrefix: "as-needed"` puts English on bare paths, so `/en/shop` looks redundant. It is not:
the prefixed URL is what lets the proxy set the `NEXT_LOCALE` cookie before redirecting to
`/shop`. Without that hop the choice would not persist. Verified — `/en` returns 307 with
`set-cookie: NEXT_LOCALE=en` and `location: /`.

### 17.3 Iconography

Line-art icons inside a filled circular badge — `sage` badge with `forest` icon on light sections,
`sage` icon on `forest` in dark bands. `lucide-react` at `stroke-width: 1.5` in a `rounded-full`
container. No custom icon set is needed.

### 17.4 Motion

One shared easing token everywhere: **`cubic-bezier(.19, 1, .22, 1)`** (expo-out). This is the
single most important detail of the Don Molinico feel — the same movements with a default ease look
cheap. Register it in the Tailwind config as `ease-brand`.

**Product / variety card hover, reverse-engineered from Don Molinico's stylesheet:**

```
.card             aspect-ratio 580/660; overflow hidden; position relative
                  flat colour panel, border-radius 20px

.card__media      cut-out PNG, 80% width, aspect-ratio 1/1, z-index 15
  :hover          transform: scale(1.1) rotate(-4deg)   1.25s ease-brand

.card__marquee    absolute, full-bleed, BEHIND the media, pointer-events: none
  rest            clip-path: inset(0  round 20px);  opacity 0
  :hover          clip-path: inset(4% round 20px);  opacity 1     1s ease-brand

.card__marquee__inner
                  oversized display type, repeated, scrolling vertically
                  animation: marquee 8s linear infinite

@media (pointer: fine)   /* every hover effect above is desktop-only */
```

Two opposing motions from one hover: the panel pulls **inward** 4% while the image scales
**outward** 10%. No animation library is required — this is `clip-path`, `transform` and one
keyframe. (Don Molinico loads GSAP and Lenis, but only for smooth scroll and the custom cursor.)

**Custom cursor:** on hoverable product cards, the cursor becomes a filled `cream` circle with
`ORDER` in `forest`. Desktop only; must not break keyboard or touch interaction.

**Accessibility requirement:** every animation in this section must be disabled under
`@media (prefers-reduced-motion: reduce)`. The marquee in particular is continuous motion, which is
a genuine accessibility problem if it cannot be stopped.

**Rotating tab title** (`TitleTicker`, 16 Sep 2026) — `Fewgrams | Microgreens`, `| Racks`,
`| Seeds`, `| Trays`, `| Snacks`, one every 2.5s, from `NAV_CATEGORIES` in nav order so the tab
names the same five things the header does. Borrowed from palmo.co.in's `Flavours | Chilling /
Pressing / Pouring`.

Three things it has to get right. It **must not write on mount** — Next applies the route's
metadata title after hydration, so the first word was set and immediately overwritten, and the
first word a visitor saw was the second one in the list. It **restores the page's own title on
unmount**, or a client-side navigation inherits whichever word was last showing. And it is
**disabled under `prefers-reduced-motion`**, because a title changing on a timer is moving content
in the sense WCAG 2.2.2 means and there is no way to pause it.

The cost, accepted: it replaces the per-page title while the tab is open, so `/microgreens/mustard`
stops saying "Mustard" and a bookmark taken mid-rotation saves whatever was showing. Crawlers read
the server-rendered `<title>`, so this is navigational, not an SEO cost. Rotating only while
`document.hidden` would avoid it; the reference does not, and neither does this.

### 17.5 Brand curtain — revised 15 Sep 2026, scoped 17 Sep 2026

Don Molinico pattern: a `forest` panel carrying the Fewgrams mark (the **light** lockup,
`brand.logoLight` — the green-and-brown one disappears on forest), which covers the page and
retracts to reveal it.

**It is a circle that opens from the middle of the screen to cover it, and then fades away at full
size** to reveal the page. **One movement, not two.** Shrinking it back was a second hard edge
travelling across the eye; shrinking *while* fading still had motion that earned nothing. The page
now appears *through* the curtain. Verified over 58 animation frames: the clip radius holds at 72%
for the entire exit — the only thing that changes is opacity, on a linear ramp from 1 to 0.

**The logo goes first, which is what lets the fade itself be gentle.** 650ms for the panel, **140ms**
for the mark — a fifth of it. The panel duration went 900 → 450 → 650ms and the mark 900 → 280 →
140ms, and the lopsided result is the point.

**Alpha is the wrong yardstick for this.** At 280ms the mark measured *ahead* of the panel — alpha
0.40 against 0.74 at the same instant — and still read as the slower of the two. A legible shape is
a figure and the panel is a wash: the eye keeps tracking a wordmark it can still read long after it
has stopped attending to a flat colour at the same contrast. So the mark has to clear early enough
not to be watched at all. Measured on screen (its opacity compounds with the panel's, deliberately):
logo gone at **168ms**, panel at **664ms** — three quarters of the fade is plain colour.

Three origins were tried, in this order:

1. **The click point.** Wrong: a click on a variety card sits in the middle of the grid, so the
   circle appeared to come from nowhere in particular.
2. **The brand logo.** Better, but it is off in a top corner, so the sweep arrived edge-first and
   the page uncovered unevenly.
3. **The centre.** Also the only one needing no JavaScript: `circle(72% at 50% 50%)` resolves
   against the viewport, so there is nothing to measure, nothing to carry across a document load,
   and a resize or rotation mid-animation is free.

**`--curtain-full` is 72%, and that figure is exact, not "big enough".** A percentage radius in
`circle()` resolves against √(w² + h²) ÷ √2, and the centre-to-corner distance is √(w² + h²) ÷ 2, so
1 ÷ √2 = **70.711%** covers any viewport whatever its size. 150% — correct when the circle opened
from a corner — would reach full cover less than half way through and spend the rest of the duration
growing off-screen, making the animation read as twice as fast as its own timing. Verified covered
at all four corners at 1440x900, 390x844, 2560x620, 768x1024 and 320x480.

Files: `PageLoader.tsx` (the component and the timing), `curtain-anchor.ts` (which clicks qualify,
unit-tested in `curtain-anchor.test.ts`), `loader-init.ts` (the pre-paint decision, unit-tested in
`page-loader.test.ts`), and the `.loader` block in `globals.css`.

#### 17.5.1 The curtain is opt-in, per link — 17 Sep 2026

It ran on **every** internal navigation for two days. The owner narrowed it: *"this full screen
loader should be shown only when i click on these options not for individual pages."*

The reasoning is about what the gesture is for. A full-screen wipe is punctuation for **changing
section**; on the way into a variety page from a card in a grid it is a 1.2 second toll on the
browsing the grid exists to encourage — and the deeper someone goes, the more often they pay it.

**A link now has to ask, by carrying `data-curtain`.** Exactly six links on the site do, all of
them in the header:

| Link | Why |
|---|---|
| MICROGREENS, PLANS, SHOP, HOW WE GROW | the four section entries — the owner's "these options" |
| The brand logo | added on the owner's call the same day: going home is a change of section like any of them, and it is the one link the curtain's own artwork is a picture of |
| The language switch | a **full document load**; without the curtain the page blanks and cuts in. It is also the only consumer of the `fg:curtain` handoff |

Everything else navigates plainly: variety cards, shop category tiles, the cart and account icons,
footer links, in-page CTAs. The cart and account icons sit inside the same header strip and were the
one judgement call — they are utility hops rather than section changes, where a 1.2s curtain is most
irritating, so they are out. Adding either is one attribute.

**Opt-in rather than a path allowlist**, because an allowlist would have meant `curtain-anchor.ts`
holding a second copy of the nav's route list, and the two would part company the first time a
section was added. The check is `closest("[data-curtain]")` rather than an attribute test on the
anchor, so a whole group can be opted in by marking its container if that is ever useful.

PLANS is `/#plans` and is opted in, yet stays quiet while you are already on the home page — the
same-pathname rule catches it, which is what stops a curtain hiding the section it just scrolled to.

**When it runs — three cases, one attribute (`html[data-loader]`):**

| Value | Cause | Behaviour |
|---|---|---|
| `in` | First visit of a session | Starts covered — expanding it would mean showing the page and then hiding it. Holds 650ms, then fades |
| `nav` | A click on an **opted-in** link — see below | Opens from the centre, holds, fades at full size |
| `hold` | A navigation that turned out to be a **full document load** | Starts covered, holds 220ms, fades |

The `hold` case is what stops the language switch — a real page load — from looking different from
the client-side navigations around it. A `sessionStorage` flag, `fg:curtain = <timestamp>`, is set
when a curtain goes up and consumed by the init script of the next document. Nothing else needs to
travel with it now that the circle is centred.

#### 17.5.2 Cover first, then navigate — 17 Sep 2026

The owner: *"background content is loaded even before the fullscreen is filled with green color."*

The click used to raise the curtain **and** release the navigation in the same tick. `--curtain-enter`
is 1000ms and a prefetched route commits in about 50ms, so for the remaining ~950ms the page being
*arrived at* was on screen in the ring around a still-growing circle — the exact cut the curtain
exists to hide, dressed up as a transition.

An opted-in click is now **suppressed and replayed**:

1. `preventDefault()` **and `stopPropagation()`**, in the document's capture listener. Both are
   needed: Next's `Link` handler routes without checking whether the event was already prevented,
   so only stopping propagation keeps the click away from it. Capture at `document` runs before
   React's root listener, which is a descendant.
2. The circle opens over the unchanged page.
3. At `ENTER_MS` the click is **replayed on the same anchor** — `anchor.click()` — and the route
   goes. The handler does not re-intercept it, because it bails whenever a curtain is already up.

Replayed as a click rather than handed to `router.push`, so the link keeps whatever it already
meant: next-intl's locale handling, the section-scroll handler on PLANS, and the browser's own
default navigation as a backstop if React never hydrated.

`ENTER_MS` in `PageLoader.tsx` **must match `--curtain-enter`**. Too low and the route is released
while a ring of the old page still shows; too high and the screen sits covered doing nothing.
`MIN_COVER_MS` is now derived — `ENTER_MS + HOLD_MS` — because those are exactly the two things that
have to happen before anything retracts.

Measured on a warm route: curtain up at 2ms, content swap at **1714ms**, fade begins at 1714ms with
the panel still at full opacity, page clear at 2364ms. The swap trails full cover by ~700ms.

**What it costs.** The open no longer overlaps the fetch, so a navigation is as long as the cover
plus the route. In dev that reads as ~500ms added, but most of that is the dev server's RSC
compile; with prefetch in production the route commits just after the replay and the total moves by
under 100ms. If it ever needs to be faster the lever is `--curtain-enter` (and `ENTER_MS` with it) —
not releasing the route early, which is the bug.

**Constraints, because loaders are usually a net loss:**
- **Never gated on the network.** It retracts when the route commits *or* at `FAILSAFE_MS` (3s),
  whichever comes first. A navigation that never arrives cannot leave the page covered — and one
  can: clicking HOW WE GROW today lands on the global 404, which is outside `[locale]` and runs
  neither the init script nor the component.
- The handoff flag is **timestamped and expires** (`HANDOFF_MAX_AGE_MS`, 5s) precisely because
  that 404 never consumes it. Untimed, it armed a curtain on some unrelated load minutes later.
- `MIN_COVER_MS` (`ENTER_MS + HOLD_MS` = 1260ms, measured from the click) is a floor, not a pause:
  below the open duration a prefetched route starts closing the circle while it is still opening.
- **Skipped entirely under `prefers-reduced-motion`**, and checked in both the script and the CSS.
- Only for an **opted-in link** (below) and only for a change of *pathname*. A hash link, a
  query-string-only change, a link to the current page, a new tab, a download and any modified
  click all pass through untouched.
- The state is written to the DOM, not React state: the head script runs before React exists, and
  the click handler must cover the page in the same tick as the click.
- The fading panel carries `pointer-events: none`, and this is load-bearing rather than tidiness:
  it stays **full-screen** for the whole 900ms and its opacity reaches 0 before the element is
  removed, so without it the entire page would be unclickable at the end of every navigation.
- The logo has its own 140ms fade, deliberately compounding with the panel's, so it clears well
  ahead of the green. Letting it fade *with* the panel (its only animation being the parent's
  opacity) was tried first and it was the one thing in the transition that looked slow.

**Cost, stated plainly:** a navigation takes about **1.8s** before the page is fully clear
(1000ms open + ~180ms hold + 650ms fade), and the page is *readable* through the fade well before
that. Measured end to end: cover at 70ms, fade begins at 1190ms, clear at 1820ms. Slowed from 1.6s on 15 Sep 2026 — at 700ms a side the sweep was uncomfortable to watch. The
three numbers to turn are `--curtain-enter`, `--curtain-exit` and `MIN_COVER_MS`, and the last must
stay ≥ the open or a prefetched route starts fading the circle before it has finished opening.

The circle uses `--ease-curtain`, **not** `--ease-brand`, and the curve matters more than the
duration: what strains the eye is the peak rate, not the average. Profiled frame by frame at
1440x900:

| | Peak edge speed | Peak ÷ average |
|---|---|---|
| Brand curve (expo-out) | — | 82% of the open in its first 112ms, then a crawl |
| 700ms `cubic-bezier(.65,0,.35,1)` | 7410 px/s | 2.88x |
| **1000ms `cubic-bezier(.45,.05,.55,.95)`** | **3148 px/s** | **1.75x** |

58% off the peak, most of it from flattening the curve rather than from the extra 300ms. The logo
fades keep `--ease-brand`. The exit fade is **linear**: with no motion to pace there is nothing for
an ease to shape, and an eased fade on a full-screen flood reads as a hold followed by a rush.

---

## 18. Home page & global chrome

### 18.1 Header

```
Desktop and mobile carry the same four items. Nothing collapses into a menu;
on a narrow screen the nav takes its own row under the logo.

The logo owns the left edge. Everything else is grouped on the right.

┌──────────────────────────────────────────────────────────────────┐
│ FEWGRAMS      MICROGREENS  PLANS  SHOP  HOW WE GROW   ⊕EN ⌂⁰ ◯  │
└──────────────────────────────────────────────────────────────────┘
                              ▼ narrow
┌────────────────────────────────────┐
│ FEWGRAMS                 ⌂⁰   ◯    │
│ MICROGREENS PLANS SHOP HOW WE GROW │
└────────────────────────────────────┘
```

| Item | Behaviour |
|---|---|
| Logo | Brand mark, left. Links to `/` |
| `MICROGREENS` | `/microgreens` — the variety grid (§18.6) |
| `PLANS` | Anchors to the bundles section (`/#plans`) |
| `SHOP` | `/shop` — racks, seeds, trays, snacks. A plain link, not a dropdown |
| `HOW WE GROW` | The animated process page (§18.5) |
| `⊕ EN` | Locale switch — globe glyph plus the **active** locale only. Two locales do not warrant a dropdown; it toggles once next-intl lands (§4.4). Utility chrome, grouped with the icons |
| Cart | Persistent count badge |
| Account | Sign in, or the signed-in user's destination — see below |

Sticky, `cream` background with `forest` type. The current section is marked with an underline and
`aria-current="page"`.

#### The account icon carries the role

**Amendment, 15 Sep 2026.** The separate `ADMIN` pill is removed. It was a second, redundant
identity signal sitting next to the account icon, and it only ever appeared for one person. The
icon itself now says who is signed in and goes where that person actually wants to go:

| State | Colour | Links to | Accessible name |
|---|---|---|---|
| Signed out | `forest`, no dot | `/login` | "Sign in" |
| Customer | `forest` + `sage` dot | `/account` | "Account — signed in as …" |
| Staff | `forest` + `sage` dot | `/staff` | "Staff — signed in as …" |
| **Admin** | **`terracotta`** + `terracotta` dot | `/admin` | "Admin — signed in as …" |

`terracotta` is the palette's alert accent, used here to say *you are holding elevated access*
rather than for decoration.

**Colour alone would fail WCAG 1.4.1**, so the role is always in the accessible name as text, not
only in the hue.

**`/account` exists as of 15 Sep 2026** — overview, profile, addresses and orders (§18.7).
**`/staff` still does not**, so a staff-role sign-in lands on a 404. Closed when the delivery run
app is built (§14 phase 7).

**Sign-out lives only on `/account`.** It is deliberately absent from the header and from the admin
shell: one predictable place to end a session beats three, and a destructive control does not
belong in chrome that renders on every page. The admin shell links to `/account` instead.

That link is the admin shell's only route back to session controls, so **it is a bordered pill with
an icon, not a text link** (changed 15 Sep 2026). It was 12px grey underlined text sitting beside a
12px grey email address — fine print next to fine print, and the one actionable item in the group
read as the least important. It now carries the same control language as the admin tabs; the email
and role badge stay quiet because they are context, not controls, and they take the truncation so a
long address cannot squeeze the pill.

**Logo, added 15 Sep 2026.** The text wordmark was replaced by the lockup at
`public/brand/fewgrams-logo.svg`, declared in `src/lib/brand.ts` per §16 rather than hardcoded in
the header. Source file is `fewgrams-divider-greenbrown_6.svg` — despite the name it is the stacked
lockup, not a divider.

- `unoptimized` on the `next/image`: the optimiser needs `dangerouslyAllowSVG` and gains nothing on
  vector art.
- Intrinsic 2112x1788 is declared so the box is reserved and nothing shifts on load. Verified the
  artwork is not clipped by its own viewBox — the ink sits ~40 user units inside it on all four sides.
- **`alt` carries the brand name.** An SVG referenced via `src` does not expose its internal
  `<title>` to assistive technology, so without it the home link would be unnamed.
- It renders at 52px tall on a phone and 64px on desktop. Even at 64px the lockup's "Goodness in
  every gram" tagline is only a few pixels high and **not legible**; a wordmark-only or horizontal
  variant would suit a header far better. Flagged, not guessed at.
**The header bar is a grid below `lg` and a flex row above it** — changed while fixing the logo's
vertical centring, and the reason is worth keeping.

The nav never collapses into a menu (§18.2), so on a narrow screen it takes its own line. In a
*wrapping flex* container each line's cross-axis size is its own, so `items-center` and even
`self-center` centred the logo only within line 1: it sat 16px high in a 109px bar. A grid lets the
logo `row-span-2` and centre across the whole bar, and because the nav then sits beside the logo
rather than under it, the mobile bar came down from **109px to 77px**.

The flex switch is at `lg`, not `md`. Between 768 and about 880px the single flex row does not fit
(logo + nav + utilities + the `ml-12` separation), so it wrapped — which put the logo 14px off centre
and pushed the bar to **125px**. That regression lived exactly on the `md` breakpoint and is why the
header is now swept at 17 widths from 320 to 1920: logo dead-centre (0px) and no overflow at every
one.

`min-w-0` on the nav is required, or the grid column sizes to the nav's full intrinsic width and the
bar overflows instead of scrolling.

**The bar carries no vertical padding.** The logo's own height *is* the bar height, which is what
lets the lockup run edge to edge rather than float in a padded box — and it puts the desktop bar back
to its pre-logo **81px** (80px inner + border) while the logo grew from 48px to **80px**. The mobile
bar is 65px, down from 101px before any of this.

Note the logo needs an **explicit** height (`h-16 md:h-20`), not `h-full`: a grid item spanning two
rows sizes to those rows, so `h-full` would cap it at the nav + utilities stack (~50px) instead of
driving the bar. Adding `py-*` back to the bar would reintroduce the padded-box look this removed.
- The footer still renders the name as text: this file is green and brown for light grounds, and the
  footer sits on forest. `-white` variants exist in the brand folder if that changes.

### 18.2 Navigation — persistent, not hidden

**Decided 15 Sep 2026: four persistent items, identical on mobile and desktop.** No full-screen
overlay, no hamburger, no dropdown. This replaces the two-level `PRODUCTS` overlay built on
14 Sep 2026, which is deleted.

Three alternatives were weighed:

| | Verdict |
|---|---|
| **A. Persistent header** | **Chosen** |
| B. `SHOP` opens a small dropdown | Reasonable, and the right answer if the catalogue grows |
| C. Full-screen overlay with an animated hover preview filling the empty right side | Best-looking, worst-performing |

**Why A:**

- **Hidden navigation costs discoverability and time**, and the effect is strongest on desktop,
  where people expect to see their options.
- **Lateral movement is the real cost.** Browsing is comparison, and comparison means moving
  sideways repeatedly. From `/shop/trays` to `/shop/seeds` is one click with a persistent header
  and three with a menu — open, click, close.
- **An overlay blanks the page**, so the visitor loses their place mid-browse. Fine for a
  narrative site; unhelpful in a shop.
- **Microgreens is the entire business** and was previously one click plus a five-word scan away
  behind a generic `SHOP` label. The four items mirror the real hierarchy: hero product and
  revenue model at top level, accessories grouped under Shop because that is what they are.
- **Hover previews do not exist on touch**, which is most traffic in India, so option C would have
  been desktop-only decoration.
- **The overlay contributed zero internal links.** It rendered client-side on open, so its
  category links were absent from the served HTML entirely — verified by inspecting the response.
  The persistent nav puts all four in every page's HTML.

**The brand moment belongs on the page** — hero, process strip, story, photography — not in the
navigation. Navigation is infrastructure and earns its keep by being predictable.

**What left the header:** `like our website?` moved to the footer. It is B2B lead capture on a
consumer store and was competing with revenue navigation for attention; the hover swap to
"we can build one for you →" is preserved.

**Revisit trigger:** past roughly **eight** categories, or when filtering or search is added,
switch `SHOP` to option B. Full-screen navigation stops scaling around there.

#### Where the four product categories are exposed

Dropping the overlay removed one hidden surface and added four visible ones:

| Surface | What it shows |
|---|---|
| `/shop` | Category tiles with live counts from DynamoDB |
| **Category strip** on every `/shop/*` page | Always-visible pills, current category marked. This is what makes dropping the dropdown free — lateral movement is one click, with no hover target and nothing to summon |
| Home page "Everything else" row | Four tiles with counts |
| Footer | Full category list |

#### What the variety grid gained

Overlay level 2 became the real page `/microgreens`. As a page it is indexable, linkable and
shareable, the back button behaves, and it has somewhere to put filters (grow days, tier, price)
that an overlay never did. **Grow days still appear on every variety block** — the cheapest
possible fix for the biggest expectation problem in the model, telling the visitor this is not
next-day delivery before they reach a product page.

### 18.3 Home page section order

| # | Section | Purpose |
|---|---|---|
| 0 | **Brand curtain** (§17.5) | First visit, plus the logo, four nav links and language switch — scoped 17 Sep 2026 |
| 1 | **Header** (§18.1) | |
| 2 | **Hero** — full-bleed microgreens image, full viewport width | Says what this is in three seconds |
| 3 | **Our process** — five numbered steps on one row, joined by a hairline that draws towards the next: seed from suppliers we know (non-hybrid, non-GMO, untreated, hand-checked) → clean tray and new medium → sown only on your order → quality checked, cut, delivered → and again from scratch every week. No freezing, no storing. Revealed on scroll with a marker → line → text stagger (`Reveal` + the `.reveal-*` kit) | The core differentiator, and the answer to "is this safe to eat". Rewritten 16 Sep 2026 to add the hygiene claims — sterilised trays and never-reused coco peat, the specific thing a buyer worries about — while staying on one row, because six steps wrapped to two and lost the left-to-right flow that makes a numbered sequence legible. The fifth step is the weekly cycle rather than a fifth task: the connector used to run out at "delivered", and repeating the whole sequence is the claim a subscriber most needs to believe |
| 4 | **Bundles** (`#plans`, §18.4) | The conversion surface |
| 5 | **Other products** — racks · trays · seeds · snacks, four tiles | One-off revenue, clearly secondary. Same card motion as §17.4 |
| 6 | **Trust tags** — organically grown · no chemicals · trusted seed sources · fresh, never frozen | Icon badges, `sage` on `forest` |
| 7 | **Footer** | Org details, legal, contact, FSSAI number |

**Dropped from §12's original list:** testimonials. There are no customers yet; an empty carousel
signals that nobody buys this, and inventing quotes is an unacceptable trade for a food brand. The
trust band does the same job honestly. Add testimonials when they are real.

**The PIN serviceability check is deliberately absent.** Decided 16 Sep 2026: serviceability is
checked in checkout, before payment, and nowhere else (§7). The hero line was tried and removed —
it spent the most valuable strip on the page asking the visitor to qualify themselves before the
site had made a case, and it duplicated a rule that has to be enforced server-side at order
creation regardless. The cost is accepted: someone outside the zone can read the whole page and
pick a bundle before being turned away, so checkout's refusal has to be clear and early.

### 18.4 Bundle cards

Three vertical cards. Anatomy follows the Le Boat price-bundle pattern, adapted because a Fewgrams
bundle **rotates over four weeks** and so cannot be described by a flat feature list.

```
┌──────────────────────┐  ┌────────────────────── RECOMMENDED
│ ░░░░░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░░░░░
│ ░  cut-out greens  ░ │  │ ░  cut-out greens  ░   ← marquee of the
│ ░  on sage panel   ░ │  │ ░  on forest panel ░     variety names
│ ░░░░░░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░░░░░░     scrolls behind
│                      │  │                          on hover
│ ESSENTIAL            │  │ EXOTIC
│ The daily basics,    │  │ Premium greens, plus
│ every week.          │  │ all the basics.
│                      │  │
│ 6 varieties          │  │ 10 varieties
│ 4 weekly boxes       │  │ 4 weekly boxes
│ ~500 g per box       │  │ ~650 g per box
│                      │  │
│ ✓ Sown only on your  │  │ ✓ Everything in
│   order              │  │   Essential
│ ✓ Cut the morning it │  │ ✓ Amaranth, basil,
│   reaches you        │  │   wheatgrass
│ ✓ Delivery included  │  │ ✓ Delivery included
│                      │  │
│ ₹1,200 /month        │  │ ₹1,800 /month
│ ₹60 per 100 g        │  │ ₹69 per 100 g
│                      │  │
│ First box: Sat 26 Sep│  │ First box: Sat 26 Sep
│                      │  │
│ [    SUBSCRIBE    ]  │  │ [   SUBSCRIBE   ]
│ See the 4-week       │  │ See the 4-week
│ rotation →           │  │ rotation →
└──────────────────────┘  └──────────────────────
```

**Each card has its own ground** (15 Sep 2026). Until then all three sat on `cream` with a `forest`
heading and `stone` body text, and the only differences were the badge colour and a 1px border —
side by side they read as one product in three sizes. A ground per card is the cheapest fix
available: it costs no card height at all, unlike the image panel that was removed for exactly that
reason.

`planPanels()` in `src/lib/types.ts` assigns them from each plan's `recommended` flag:
**`forest` for the recommended plan, then `sage` and `sand` in card order for the rest.** The dark
card is the recommendation, so it belongs to the same flag as the filled badge — mark a different
plan in admin and the emphasis moves with no deploy. The old `planPanel(index)` made the dark card
always the middle one, whatever the owner had chosen. The quiet grounds still follow position,
because nothing in the record should decide between sage and sand. `src/lib/plan-panels.test.ts`
covers it, including that no two adjacent cards ever share a ground.

Every colour that changes with the ground lives in one `PanelTone` row per ground in
`Bundles.tsx` — heading, body, ticks, price, badge, both CTA variants and the watermark. Nine
scattered ternaries is how one of them gets missed. Ratios, all measured (§17.1):

| | `forest` | `sage` | `sand` |
|---|---|---|---|
| heading / price | `cream` 12.36 | `forest` 7.43 | `forest` 11.01 |
| body text | `mint` 8.91 | `forest/80` 4.80 | `forest/75` 5.49 |
| pill ground vs card (1.4.11) | `cream` 12.36 | `forest` 7.43 | `bark` 8.28 |
| pill text | `forest` 12.36 | `cream` 12.36 | `cream` 9.29 |
| filled CTA label | `forest` 12.36 | `cream` 12.36 | `cream` 12.36 |

Two of those replaced a class that looked safe: `stone` body text fails on `sand` at 4.20, and
`forest/70` fails on `sage` at 3.82. Both are recorded in §17.1's table so the next person does not
reach for them.

**A `Sprout` watermark per card**, clipped to the bottom-right corner at 9–15% opacity: five stems
on the first card, three on the second, one on the third. `seed` only ever varied the mark's lean,
and the same drawing tilted a few degrees is not a different drawing — so `Sprout` gained a `stems`
prop. Odd counts only; the paths run centre, inner pair, outer pair, so 2 and 4 draw a plant
missing one side. Read across they also say something true: a full tray, a seedling, a single green
you picked yourself.

The watermark is clipped by **its own wrapper**, not by `overflow-hidden` on the card — the badge
deliberately hangs outside the card's top edge, so clipping at the card would cut it in half. It
sits behind the content via `isolate` on the card plus `-z-10` on the wrapper, which is the one
arrangement that paints above the ground and below every word without adding `relative` to each
block. And the outlined CTA is **filled with its card's ground rather than left transparent**:
visually identical, except the one-stem mark was crossing the button's 1px outline and reading as a
smudge over the one element on the card that must look crisp.

**Three things the reference pattern does not carry, and this card must:**

1. **First delivery date**, computed live against the Friday 23:59 cutoff (§5.3). The spec already
   requires this at checkout; showing it on the card is materially better, because the person
   deciding is the person who needs to know.
2. **Price per 100 g** alongside the monthly price. This is what stops ad-hoc buying (§18.6) from
   cannibalising subscriptions — the plan has to be *visibly* the cheaper way to buy.
3. **A badge on every card, and each says something different and true.** The pill's *wording* is
   content (`badge` in the plan's file), because it is a claim about that plan rather than UI
   chrome — one shared `card.recommended` key could only ever label one of three cards. Its
   *emphasis* stays `recommended` in DynamoDB, which is now what decides the whole card's ground
   (see above) rather than just the pill's fill.

   **Each pill inverts against its own card**, because it has to: a `forest` pill on the `forest`
   card is invisible, and a `sage` pill on the `sage` card likewise. So `cream`-on-`forest`,
   `forest`-on-`sage`, `bark`-on-`sand`. This replaced a `sage` → `tan` cycle that was correct
   while every card was cream and wrong the moment the third card's ground became `sand` — `tan` on
   `sand` is 1.35:1, the same warmth at the same lightness, and the pill dissolved. `bark` is the
   darker half of the same logo pair and clears at 8.28:1.

   **The pill straddles the card's top edge, at the right, and carries a 1px outline in the card's
   own ground colour.** Three iterations, each fixing the last:

   - *Top-left, no outline* — the original, and it broke the day the featured card went `forest`.
     Its pill went `cream`, and the half above the card was cream on the cream page. What was left
     read as a tag cut in half.
   - *Wholly inside the card* — safe on any ground and needs no outline, but costs ~39px of card
     height, on cards that had just had 260px of image removed to get the price above the fold.
   - *Overhanging, outlined, top-right* — the outline solves it from both sides at once: over the
     card it is the ground's own colour and cannot be seen, over the page it is the edge that gives
     the pill its shape. Right rather than left leaves the heading the whole left margin; left put
     the pill and the plan name in the same column, reading as two stacked labels. Centred was
     tried and reads as a tab *on* the card rather than a claim about it. `-top-3.5` is roughly half
     the pill's measured 31px height, so it straddles rather than sits.

   Today: "Recommended" / "Bold flavours" / "Most flexible" — all three adjective-led, so they read
   as one set. A pill is **merchandising, not documentation**: the middle one was "Essentials
   included" for one iteration, which is true and is the one fact that justifies the higher price,
   but it explained rather than sold. That fact belongs in the tagline right under it ("with the
   everyday greens underneath"), where there is room for a sentence.

   Note what is **not** there: "best value" on Rare & Exotic would be false — at ₹113 per 100 g
   against ₹75 it is the dearer plan, and the card prints both figures a few lines under the pill.

**Three filled CTAs, one per card, each in its own card's accent:**

| Card | Rest | Hover | Ratios |
|---|---|---|---|
| Everyday Essentials | `cream` fill, `forest` label | `sage` fill | 12.36 → 7.43 |
| Rare & Exotic | `forest` fill, `cream` label | `forest-deep` fill | 12.36 → 15.27 |
| Pick Your Own | `bark` fill, `cream` label | `forest` fill | 9.29 → 12.36 |

Two corrections are buried in that table:

- **None of them is outlined any more.** Pick Your Own was an outlined `forest` button for several
  iterations, on the theory that the plan you are not pushing gets the quiet control. An outlined
  button beside two filled ones reads as *disabled*, not secondary — and a green button under this
  card's `bark` pill made the card look like it had borrowed the button from its neighbours. It is
  the one card whose accent is not green, and the CTA is where that should show. Its hover is the
  only one on the page that changes **hue** rather than shade, brown to green, which suits the only
  plan where you choose rather than accept.
- **Essentials' hover is `sage`, not `mint`.** Both clear contrast easily, but `mint` is a cool
  blue-green and the button read as a different family from the card under it. `sage` is the second
  card's ground, so the hover stays inside the set.

On a `forest` ground the warm CTA flips to `tan` on `bark`, because `bark` on `forest` is two dark
colours with no boundary between them — the one place `tan` still earns its keep (§17.1).

**The rotation link is the loudest secondary thing on the card**, not the quietest. It was `text-sm`
in the muted body colour, which made the one link that answers *"what do I actually get?"* the
easiest thing to miss. It now carries a calendar glyph, `font-semibold` and the heading's own
colour, and the label says what it shows — "See what arrives each of the 4 weeks" — rather than
naming the mechanism, because "4-week rotation" is our word for it, not the visitor's. It stays a
text link inside the reserved 20px row: a bordered chip was the obvious way to make it louder and
it added 14px below the CTA, which on a 740px viewport is highlighting something *into* the fold.

**Every line on a card is written to fit on one line** (15 Sep 2026). Not a style preference — a
measurement. The Subscribe button was still below the fold at 1430×740, which is what a 1440 laptop
gives you at the browser zoom most people actually run, and the section's whole job is to offer
that button. Each wrapped line costs 20px, and because the grid makes the cards equal height, **the
tallest card sets all three** — so one long highlight on one card pushed all three CTAs down.

What was cut, in order of how much it returned:

| Change | Saved |
|---|---|
| Boxes and box weight onto one line, separated by a CSS `::before` middot | 20px |
| Every tagline and highlight rewritten to fit one line, en **and** kn | 40px |
| The intro's measure widened `max-w-2xl` → `3xl`, so two sentences fit on one line | 22px |
| `pt-8` → `pt-6` above the price, `mt-6` → `mt-5`, `space-y-2.5` → `space-y-2`, `mt-12` → `mt-8` | 24px |

562px → **476px**, and the CTA moved from 60px below the fold to 18px above it. The rotation link
beneath it is still just under, which is the right thing to lose last: it is a secondary
affordance, the button is not.

Two rules follow from this and both are easy to break by accident:

- **A highlight that wraps costs every card, not just its own.** Keep them under ~45 characters in
  English. Kannada runs longer per character and was checked separately.
- **The separator in the boxes/weight line is a CSS `::before`, not a character in a message.** It
  is a visual divider rather than language, so it does not belong in a message file and must not be
  handed to a translator.

The four-week rotation is **not** printed on the card — three dense week-by-week tables side by
side is unreadable. A "See the 4-week rotation →" link opens a drawer with the full schedule and
real dates. Cards stay equal height and scannable.

**Build Your Own is a third card**, not the de-emphasised link the reference uses — it is a
differentiator no local competitor offers. Styled lighter (outline button, not filled) so most
visitors land on a curated pack, which is also easier to operate.

**Subscribe buttons live in the cards**, not in the header. `PLANS` in the header anchors here.

**`PLANS` re-scrolls, every time.** It is a `Link` to `/#plans`, so the first click changed the URL
and the browser scrolled — but on the second click the URL was *already* `/#plans`, no navigation
happened, and nothing moved: the visitor scrolled up, clicked PLANS and was ignored. `NavLinks`
intercepts the click **only when the hash is already current**, leaving the ordinary first click to
the router, and calls `scrollIntoView` (which honours the section's `scroll-mt-24`, and drops the
smooth behaviour under `prefers-reduced-motion` per §17.4).

**Data dependency:** built. The section reads plans and rotation weeks from DynamoDB and **every
word on a card from `content/plans/<key>.json`** (§5.1.1), resolved by the page and handed to the
client component as one `text` prop. The card holds no copy: the "Recommended" badge is a message
key, and the marquee scrolls the plan's own `name` word by word rather than the four hardcoded
English words ("Your Pick Your Grams") that Build Your Own used to carry.

**Panel colours are derived, not stored.** `planPanels()` in `src/lib/types.ts` assigns them from
the `recommended` flags — see the table above. It was a select on the admin form until 15 Sep 2026,
which asked the owner to decide something the design had already decided, so a stored value could
only ever be wrong.

**Card hover: a 6px lift, a 1.2% scale and a two-layer forest-tinted shadow**, 450ms on
`--ease-brand` (`.bcard` in `globals.css`). Not the `.mcard` treatment from §17.4 — that scales a
cut-out image inside a fixed frame, and a bundle card has no image, so the whole card would have to
move and 10% on a 430px card is a lurch. Written as a CSS class rather than `hover:` utilities for
the same reason `.mcard` is: Tailwind's `hover:` compiles to a bare `:hover`, which on a touch
screen sticks after a tap and leaves one card raised. `(pointer: fine)` is the only way to say
desktop-only. `z-index: 2` on hover stops the next card in the DOM painting over the raised one's
edge, and the shadow is two layers because a single wide blur looks like a smudge at a readable
opacity and like nothing at a tasteful one. Under `prefers-reduced-motion` the transform goes and
**the shadow stays** — a shadow is not movement, and it is the part that says the card is in front.

**The rotation opens in a modal**, not a panel below the grid — the panel pushed the three cards
being compared off screen. Native `<dialog>` + `showModal()`, for the top layer, focus trap, Escape
and `::backdrop` (§18.8).

**Dismiss is an X in the top-right corner**, not a "Close" text link. The link sat beside the
heading — a word in body type next to a heading reads as part of the copy, and it was halfway down
the panel rather than at its edge, which is where a dismiss is looked for. The button is a direct
child of the `<dialog>` rather than of the scroll area, so it stays in the corner if the content
ever scrolls, and **it inverts against the band behind it**: cream-on-`forest` is 12.36:1, but
cream-on-`sage` is 1.66:1 and the circle would all but vanish on the Essential band. Forest-on-light
measures 7.43:1 over `sage` and 11.01:1 over `sand`, so either direction clears 1.4.11's 3:1 for the
control boundary with the glyph at 12.36:1 inside it. The word survives as the accessible name.

**The modal's copy takes the panel's full width.** Both paragraphs carried `max-w-xl` — a 576px
measure inside an 832px dialog, which left a third of the panel empty and wrapped the plan's
description to four lines. That was the "~65 characters is the readable measure" rule applied to the
wrong element: it is for running body text down a page, not for two short paragraphs of supporting
copy in a dialog the reader opened on purpose. Four lines at 576px is worse than two at 768px, and
the timeline below already sets the panel's width.

**The timeline reveals itself on open**, left to right, in two nested staggers (`.rot-week`,
`.rot-dot`, `.rot-item` in `globals.css`). The rotation *is* a sequence — the whole argument of the
panel is that week 2 follows week 1 rather than repeating it — and a panel that appears with all
four Saturdays already in place says nothing about that. Columns rise 10px and fade at 90ms apart,
each dot scales in 60ms behind its column, and the varieties follow 180ms later at 70ms apart,
because they are the payload and should land after the date they belong to. `--i` (column) and
`--j` (variety) are set inline from the render and the arithmetic stays in CSS, so the timing has
one home and nothing re-renders to animate. `animation-fill-mode: both` is load-bearing: without
the backwards fill, an element with a 270ms delay is fully visible for those 270ms and then snaps to
`opacity: 0` to begin. Measured: first column 0.91 opacity at 200ms with the fourth still at 0, all
settled by 1s. Under `prefers-reduced-motion` everything arrives at once and in place (§17.4) —
the content is the point, the sequence is decoration.

Inside it, **a horizontal timeline on a `cream` ground**: four columns, one per Saturday, each
column's top border forming one continuous rule with a dot where the delivery sits. The gap between
columns is interior padding rather than a grid gap, or the rule reads as four dashes. It was
vertical for one iteration and stacked four deliveries down a `sand` panel, which needed the modal
scrolled to compare them and read as a list rather than a sequence; across, the month is one glance
and the modal no longer scrolls at 900px tall. The week lists lost their own panels with the change
— on `sand` they needed one to separate themselves, on `cream` they would be a second near-white
rectangle.

`fixed inset-0 m-auto` is what centres it. A dialog in the top layer is centred by the UA's own
`margin: auto`, and Tailwind Preflight resets every margin to `0` — so without it the modal sat
against the top of the viewport.

#### The card's image panel was removed — 15 Sep 2026

The 16:10 panel with the marquee is **gone from the bundle card**. It cost about 260px of card
height and put the price — the thing a visitor is actually comparing — below the fold of a 900px
laptop viewport, so all three cards had to be scrolled to be read at all. Card height went 849 → 588,
and price, box weight, highlights and both buttons now sit inside one screen.

Two consequences, both deliberate:

- **The artwork moved into the rotation modal**, as a **full-bleed** 16:5 header band in the plan's
  own panel colour, with the mint `Sprout` on `forest`. Same image, in a panel already the size of
  the screen. It was inset by the modal's padding for one iteration, which put its corner 24px
  inside the modal's corner and left the X straddling two grounds — half on cream, half on the band,
  legible against neither. A header that reaches the edges gives the corner one colour, which is
  what the button needs; the dialog carries `overflow-hidden` so the band cannot poke out of the
  20px radius. Build Your Own has no rotation, so it has no modal and no artwork — its "Build my
  bundle" flow (§5.2) is where that belongs.
- **No colour band on the card.** A 6px strip of the panel colour replaced the panel for one
  iteration and was then removed: three coloured rules across the top of three cards read as
  decoration rather than identification. The panel colour now appears only where it does work — the
  modal's header band.

**The CTA row is reserved, not conditional.** The footer is bottom-anchored (`mt-auto`) inside cards
the grid makes equal height, so what sits *below* a button decides where that button lands. Build
Your Own has no rotation, so "See the 4-week rotation" was absent and its CTA — and its "First box"
line — hung 20px lower than the two beside it. The link row is now always rendered, empty when there
is no rotation. Both button variants also carry `border`, transparent on the filled one, because a
1px outline made the BYO button 2px taller than the Subscribe buttons. All three CTAs now sit on one
line, verified in the browser.

The marquee is therefore no longer on the bundle card. `.mcard*` in globals.css stays — the
`/microgreens` grid, the variety page and `MarqueeCard` all still use it.

**The variety grid got the full treatment on 16 Sep 2026** (`VarietyTile`). Where a cut-out exists
the tile sits on a pale tint — `sage/30`, `sand`, `mint/40` by position, the greens being the only
saturated thing that should be in the frame — and hover scrolls that variety's **nutrient labels**
behind the punnet. Labels only, never their values: "Vitamin C" states what is in the green, while
"High — well above the mature head" is a nutrient content claim needing analysis to substantiate
under the Advertising & Claims Regulations 2018, and the values live on the detail page beside the
note that qualifies them. A parenthetical qualifier is dropped for display, because "Vitamin A (as
beta-carotene)" clipped mid-word at both tile edges and read as a bug rather than as the
reference's deliberate overflow.

The media box is **96%** of the tile here against the 70% used elsewhere: a punnet at a
three-quarter angle is a 1.34:1 landscape silhouette in a square box, so its height runs out at
two thirds of the box and at 70% it looked like a thumbnail floating in colour.

96% is close to the ceiling, and the ceiling is the hover. The subject is 86% of the box wide and
64% tall; hover scales it 1.1 and rotates it 4°, taking the rotated bounding width to 0.993 × the
box. A box at 100% of the tile would therefore put the punnet's corners inside the tile's own 20px
border radius, where `overflow: hidden` shaves them. Measured at 96%: clearance of 13–17px on
every side at hover, nothing touching an edge. Going larger means re-padding the cut-out tighter
than 86%, not widening the box.

**List page only** — the detail page prints the same nutrients as a table with their values, and
carries no `.mcard__media` or `.mcard__marquee`.

### 18.5 How we grow

The animated process page: seed procurement → quality check → soak → sow → germinate → harvest →
deliver.

Requested as rotating 3D models. **Recommendation: a scroll-driven sequence of Fewgrams' own
photographs instead.** Rotating 3D needs modelled assets (a seed, a tray, a sprout) — either paid
asset work or a large time cost — and for a food brand real photographs of your own trays read as
more credible than a synthetic seed, while loading faster. **Open decision.**

### 18.6 Model change: microgreens are individually buyable

**This supersedes §3 and §12, which state that microgreens are subscription-only.**

A visitor can order a single variety ad-hoc from `/microgreens/[slug]`, in **100 g units**, with a
quantity selector. The order is sown on the next sow Sunday and delivered after that variety's
`growDays`. This is the low-commitment entry point the site otherwise lacks.

| Consequence | Status |
|---|---|
| Pricing | **No schema change.** `Variety.pricePer100g` already exists for BYO and is reused |
| Mixed carts split across dates | **Resolved 15 Sep 2026** — one delivery on the later date, stated in the cart before it is a surprise (`adhocOrderReadyDate`). Holding the fast crop contradicts "nothing is stored"; two trips for one order is not worth it |
| Subscription cannibalisation | If ad-hoc 100 g costs the same per gram as a plan, nobody commits to a month. The plan must be visibly cheaper per 100 g, or ad-hoc carries a convenience premium. **Pricing gap to be set** |
| §3 catalogue table | Microgreens row must change from "Subscription only" to "Subscription **and** one-off by 100 g" |
| §12 page inventory | `/microgreens` is a shopping surface, not an informational library. `/microgreens/[key]` gains a quantity selector and add-to-cart. **Page built 15 Sep 2026 (§18.10); the selector still waits on the cart** |

### 18.6.1 Ad-hoc cart — built 15 Sep 2026

`src/lib/cart/` plus `/cart`. The quantity selector and add-to-cart §18.6 called for, backed by a
real cart rather than a button that goes nowhere.

**Sow rule.** Sown the next morning, cut `growDays` later. `adhocSowDate` is day-granular, not
"24 hours from now" — sowing is a morning job, so 00:05 and 23:55 on the same day sow together.
The detail page therefore shows a **date** ("Ready by Sat 26 Sept"), not a sum for the reader to do.

**The buy box is one filled panel, and the total is the headline.** Price began as loose text under
the stepper on the same cream as the body copy, where it read as a caption. Total, rate, quantity and
CTA now sit in a single sand panel — the only filled panel in that column, so it carries the
emphasis rather than competing with the flavour-notes block (which lost its fill for that reason).
The **total for the chosen quantity** is 44px and the per-100 g rate is the 12px caption under it:
the total is what gets charged, the rate is only the comparison figure against a plan.

**Price is not a fact in the strip.** It appeared there and again in the buy box, and two copies of
one number on one screen is where they start disagreeing. The strip is now purely *when* — grow days
with **"Ready by <date>" as a sub-line** rather than a fourth column, because the date is not an
independent fact, it is the grow-day count applied to today.

**The variety page's stepper is seeded from the cart, and the commit sets rather than adds.**
It used to mount at 1 every time, so with 3 in the cart the header badge read 3 while the stepper
read 1 — two numbers for one fact, and a refresh looked like it had discarded the quantity. `unitsFor`
seeds it and the CTA becomes "Update cart".

Once the control shows cart state, the mutation has to be absolute: `upsertLine(key, n)`, not
`addToCart(key, +n)`. Committing 3 when the stepper reads 3 must leave 3, and being absolute also
makes the action idempotent, so a double-click or a retried request cannot double the line. The seed
is an **initial** value, not a synced one — re-keying the component on it would wipe the "Added to
your cart" confirmation the instant it appeared.

**Layout: the flavour note sits under the gallery, in the left column.** The photo column is far
shorter than the title, facts and buy box stacked beside it, which left a screen-deep hole under the
thumbnails. Explicit `lg:col-start` / `lg:row-start` placement puts the note there while the buy
column spans both rows. DOM order stays gallery → buy column → note, so on a phone the single column
still reads picture, price, then tasting note — the grid only re-places them at `lg`.

Two details worth not undoing: the sage rule must sit on an **inner** element, not on the wrapper
carrying `lg:pt-8`, or it spans the padding and starts above the heading it marks; and the page opens
on a small back link rather than a hero, so it takes `pt-5 md:pt-6`, not the symmetric `py-12
md:py-16` every other page uses.

**Storage: one cookie, keys and quantities only.**

| In the cookie | Recomputed every read |
|---|---|
| content key, 100 g unit count | name, price, line total, subtotal, ready date, photo |

A cookie is client-supplied, so a price stored in it is a price the customer can edit — SPEC §9:
"never trust a client-reported amount". Recomputing also means a price change reaches an abandoned
cart instead of being quoted from last week. Wire format `broccoli:3|mustard:2`, a fraction of
JSON's bytes on a cookie sent with every request.

Note the deliberate asymmetry with §4.3: an *order* line must snapshot name and price at purchase
time so history cannot be rewritten. A cart is not an order — it is a wish, and it should track the
catalogue.

**Parsing is total and silent per line, never throwing.** The cookie may be truncated, stale from an
older format, or hand-edited; a cart that threw would turn a junk cookie into a 500 on every page
with a basket count. Verified against a forged cookie carrying uppercase keys, `../../etc/passwd`,
`broccoli:999`, an unknown variety, duplicates and a negative: the over-cap line clamped to 20, the
unknown one reported "no longer available", everything else was dropped, and no price moved.

Caps: 20 units (2 kg) per line, 12 lines. Past that it is a wholesale enquiry, not an ad-hoc order.

**No role assertion on the cart actions, on purpose** — §8 allows a guest to buy without an account.
Which is exactly why each action re-validates its key against the active catalogue instead of
trusting the form.

**No pay button.** Cashfree is not wired up (§9), so the page says so in a sentence rather than
offering a CTA that could only fail.

**Money and weight placeholders must be typed `{x, number}` in the message files.** A bare `{price}`
is interpolated as a raw string, so Intl never sees it: the cart rendered `₹1700` while the detail
page rendered `₹1,700` for the same amount. Fixed across both locales; do not add an untyped
numeric placeholder.

### 18.7 Customer account — built 15 Sep 2026

Four routes under `/account`, gated by `requireRole("customer")` in the segment layout **and** by
`assertRole("customer")` inside every server action, per §8. Everyone signed in is at least a
customer, so staff and admins reach their own account here too.

| Route | Contents |
|---|---|
| `/account` | Details at a glance, default address, first-delivery date, recent orders, the role you hold |
| `/account/profile` | Name and mobile. Email is shown read-only — it is the login identifier |
| `/account/addresses` | Add, edit, delete, choose a default. PIN-gated on save |
| `/account/orders` | Order history. Empty until checkout lands (§14 phase 5) |

`/account/subscription` and `/account/orders/[id]` from §12 are **not** built: there is no
subscription and no order to show one of yet.

**Storage.** `USER#<id> / PROFILE` and `USER#<id> / ADDR#<addrId>` in `fewgrams-users`, declared in
`src/lib/db/entities.ts` like every other key (§4.5). They share the partition with the Auth.js
rows, which is what SPEC §4 intended: one Query returns a person and everywhere they want things
delivered, and deleting the partition deletes the person completely — which is what a DPDP erasure
request asks for. Neither entity declares a GSI, because GSI1 on that table belongs to the
adapter's `EMAIL#<email>` lookup and a profile row appearing in it would be returned by
`getUserByEmail`. `src/lib/db/keys.test.ts` asserts that neither writes `GSI1PK`.

**Why the profile is a separate row rather than more attributes on the adapter's user item.** That
item is owned by `@auth/dynamodb-adapter`, which writes it with `PutCommand` on link and update, so
attributes we added could be dropped by a library upgrade without warning. `role` is the deliberate
exception (§8) — it has to be readable in the same `GetItem` that authorises a request.

#### The single-default invariant

Exactly one address per customer carries `isDefault`. DynamoDB cannot express a constraint across
items on a non-key attribute, so it is maintained in `src/lib/repo/profile.ts` at all three write
paths: the first address saved is always the default whatever the checkbox said; marking one
default clears the others; deleting the default promotes the oldest survivor. Verified against
DynamoDB Local, not only in unit tests.

#### PIN gating happens on save, not only at checkout

`validateAddress` applies §7's allowlist when an address is stored. Catching an unserviceable PIN
here is the difference between "we don't deliver to 110001 yet" while the customer is browsing and
the same sentence appearing on the payment screen. The browser attributes on the form
(`required`, `pattern`, `inputMode`) exist to fail fast on a phone keyboard and are not the gate.

#### Delivery location: browser geolocation, no map provider

Optional latitude/longitude with an accuracy figure, captured from `navigator.geolocation` behind a
"use my current location" button. A map picker would mean a keyed, billed provider; this needs
neither, and a written address in a large Bengaluru layout is often not enough to find a door.
Every failure path — permission refused, unsupported, timeout — still lets the address save, and
the stored pin is visible on the address card so the customer can see what they shared.

`maximumAge: 0` is deliberate: a cached fix from another part of the city is worse than no fix.

#### Known limitation: `080` landlines

`normalisePhone` strips a leading `0`, which cannot distinguish a mobile typed with a dialling
prefix from a Bengaluru landline — `080-4123 4567` and the mobile `8041234567` are the same eleven
digits, because Bengaluru's STD code is `080` and `80xx` is a live mobile series. Every other metro
code (`011`, `022`, `033`, `040`, `044`) normalises to a leading digit no mobile uses and is
rejected. Accepted deliberately: rejecting the leading-`0` form would cost a retype to everyone who
types it, and the number is shown back on the address card, so a wrong one is visible before
Saturday. Pinned by a test so it is not "fixed" without reading why.

#### Errors cross the wire as keys, not sentences

Server actions return `{ status: "error", code, field?, values? }`; the component resolves `code`
against `account.errors` in the active locale. A server action has no business choosing English
wording (CLAUDE.md), and this is what lets the same validation serve both languages.

`FormState` and `IDLE` live in `src/app/[locale]/account/form-state.ts` rather than in
`actions.ts`, because a `"use server"` file may export **only async functions** — exporting the
`IDLE` object from there fails the build with *"A 'use server' file can only export async
functions, found object"*.

### 18.8 Interaction affordance and destructive confirmation

**Every CTA shows `cursor: pointer` and changes colour on hover.** The cursor
half is a base rule in `globals.css`, not a utility class per button: Tailwind
v4 removed `button, [role="button"] { cursor: pointer }` from Preflight and
defers to the browser default of `cursor: default`, so a fresh Tailwind v4 site
has no clickable affordance anywhere. A per-button class would work but
guarantees the next button added is missing it. The rule also covers `summary`
and checkbox/radio labels, whose hit area is the whole label.

Keyboard focus uses a 2px forest `:focus-visible` outline with a 2px offset
rather than the browser's blue, which clashes with the palette. `:focus-visible`
specifically, not `:focus`, so a mouse click leaves no ring behind — that is the
annoyance that leads people to remove focus styles altogether. The offset matters
on the terracotta confirm button: it places the ring on the cream panel behind,
where contrast is high, instead of on the dark button itself.

**Destructive actions confirm through `ConfirmSubmit`, never `window.confirm`.**
The native dialog cannot be styled, announces itself as "localhost:3005 says",
and is suppressible by the user — which would silently downgrade a guarded
delete to an unguarded one.

It is built on the native `<dialog>` element, which supplies the top layer (no
z-index fight with the sticky header), a focus trap, Escape to dismiss and
`::backdrop`. Two details are load-bearing:

- **`m-auto` on the dialog.** A modal `<dialog>` is centred by the UA
  stylesheet's `inset: 0; margin: auto`, and Tailwind's Preflight zeroes margins
  on every element — without it the panel pins to the top-left corner under the
  header. Caught by measuring: it sat at (0, 0) instead of centred.
- **The dialog renders inside the caller's `<form>`**, so the confirm button is
  a plain `type="submit"` for that form and needs no JavaScript to act. Only
  opening and closing needs the client.

`w-[calc(100%-2rem)] max-w-sm` pairs with the centring: `max-w-sm` alone left a
384px panel with 3px of margin on a 390px phone.

### 18.9 Admin variety table

The saved varieties are an editable table with a client-side filter, not a stack
of cards — the cards cost about four times the vertical space per variety.

It is a **CSS grid, not a `<table>`**, because three server actions act on one
row (save, toggle active, delete) so the row needs three `<form>` elements, and
a `<form>` may not nest inside another nor sit inside `<tbody>`. The alternative
— one hidden form per row plus `form="..."` attributes on every input — breaks
`useFormStatus`, which only reports on a form that is an *ancestor* of the
component calling it. `display: contents` on each inner form resolves it: the
forms keep owning their fields while their children participate directly in the
row's grid, so the columns align with the shared header template. Below `lg` the
`contents` is dropped and each row becomes a stacked card.

The filter is client-side because every row is already in the page: the
catalogue is dozens of varieties, not thousands, and a round trip per keystroke
would both be slower and discard unsaved edits in the other rows. It normalises
the query through `sanitiseKey`, so typing "Pea Shoots" finds `pea-shoots`.

**`sanitiseKey` and `isValidContentKey` live in `src/lib/content/content-key.ts`,
not in `varieties.ts`.** Client components need them, and importing from
`varieties.ts` pulls `node:fs/promises` into the browser bundle, which fails the
build outright with "the chunking context does not support external modules".

### 18.9.1 Admin plans screen — rebuilt 15 Sep 2026

The screen was one long hardcoded-English form: six text inputs for a plan's name and blurb in two
languages, a highlights textarea, a card-colour select, and **four text fields taking
comma-separated variety keys** for the rotation. Four decisions replaced it.

#### 1. There is no "add a plan"

**There are three plans and there will only ever be three** (§5.1), and which three exist is decided
by the files in `content/plans/`. So the screen renders **a row per content file** and `savePlan` is
an upsert keyed on `contentKey` — it reuses the row's `id` if there is one and mints a UUID on first
save. A plan that has never been priced shows its row with empty numbers and "not set up yet".

This deletes a whole class of mistake rather than validating it, because the key is no longer typed:
no mistyped key, no duplicate key, no row pointing at a file that does not exist.

`removePlan` survives for exactly one case — a row whose content file has been deleted. Nothing
about such a plan can be shown to a customer, so it is listed last, flagged, and is the only
deletable row. The action re-checks that server-side: a hidden button is not a rule (§8).

#### 2. The numbers only

Name, tagline, description and highlights are `content/plans/<key>.json` (§5.1.1). Not one prose
field is left on the screen. Card colour is gone too — derived from position, §18.4.

#### 3. The rotation is a searchable multi-select per week

Three iterations, and the reasoning for each is worth keeping:

| | Problem |
|---|---|
| Comma-separated **typed keys** | Accepted anything, so `mustrad` saved happily and the card listed a variety that does not exist. Asked for identifiers where the operator thinks "Broccoli". Hid grow days, the only figure the choice turns on |
| Flat **checkbox list** per week | Right about the interaction, wrong about scale: four weeks × every variety, so the screen grows by four rows per green added. Twenty varieties is eighty checkboxes |
| **Searchable multi-select** per week | Current. The list is behind a trigger and has a filter, so it is flat in cost as the catalogue grows |

What survived all three iterations, because it was the point: **grow days beside every variety**,
and the list **ordered by grow days**. §5.2 puts the quick crops in week 1 and the slower ones sown
that same Sunday in week 2, and that call cannot be made without the number in front of you;
ordering by it puts each week's candidates at the top of its list.

The trigger **names** what is in the week ("Mustard, Red Amaranthus") rather than counting it, and
falls back to a count past two. The filter normalises the query through `sanitiseKey`, so "red cab"
finds `red-cabbage`.

The popup's checkboxes are **presentation only**. The value is carried by one
`<input type="hidden" name="week-N">` per chosen key, which is what makes `FormData.getAll` return
exactly the picked varieties whether the popup is open, filtered or closed. Real checkboxes would
work too, until the day the popup unmounts when closed.

A week with nothing picked is **omitted rather than stored empty**, and `putPlan` treats the posted
set as the whole rotation and **deletes** any week missing from it — otherwise clearing week 3 left
the old row behind and the card kept counting a week the operator had just emptied.

Consequence of allowing a gap: the rotation timeline indexes the delivery schedule by the week's own
number, not by its position in the array. With `schedule[i]`, a rotation of weeks 1, 2 and 4 printed
the *third* Saturday against week 4.

#### 4. Rows are cards, not a grid

The one deliberate divergence from §18.9's variety table: four pickers do not fit in a table cell.
`active` is a checkbox inside the save form rather than its own toggle form, because a plan with no
row yet has nothing to toggle.

### 18.10 Variety detail page — built 15 Sep 2026

`/microgreens/[key]` (and `/kn/microgreens/[key]`). Renders the **whole** content
contract from `content/varieties/<key>.json` — short description, description,
flavour notes, nutrition table plus its qualitative-levels note, benefits,
cautions, growing tips and the five FAQs — joined to the three
numbers the DynamoDB row owns: price per 100 g, grow days, and that it is sown
on the Sunday after an order.

**The URL segment is the content key, not the id.** `red-amaranthus` is
readable and shareable, and survives a display-name change; the UUID stays
internal (§4.3).

**Two lookups, both must succeed, and the failure mode is 404 in all three
cases:**

| Missing | Why 404 rather than a partial page |
|---|---|
| DynamoDB row | Nothing sets a price, so the variety is not sold |
| Row `active: false` | Withdrawn from sale — a live page would take orders for it |
| Content file | Cannot be named, so cannot be described |

That matches `/microgreens`, which skips exactly the same rows, so a variety is
never linked from the grid and dead on arrival. Verified against DynamoDB
Local by toggling `active` and observing 200 → 404 → 200.

**Photographs are a picker under the main image, not a band further down.**
Changed the same day it was built: a separate "Closer look" section put the
second photograph a full screen below the first, where it read as a different
subject. Now the hero is the main image *and* the first thumbnail, so the strip
is the complete set rather than "the others" (`VarietyGallery.tsx`).

- A shot is **mounted the first time it is selected** and then kept. Mounting
  all of them on load would fetch every full-size photograph and hand LCP a
  queue; mounting only the active one would re-fetch and flash on every switch.
  Switching is an opacity change after the first visit.
- Inactive shots carry `aria-hidden` — two descriptions of one visible image is
  noise for a screen reader.
- Arrows are **measured, not counted**: a `ResizeObserver` compares
  `scrollWidth` to `clientWidth`, because how many thumbnails fit depends on the
  viewport. At two photographs the strip and arrows do not render at all.
- **`min-w-0` on every nested level of the picker is load-bearing.** A grid item
  defaults to `min-width: auto`, so the strip's intrinsic content width
  overrides its column. Found by padding a gallery to nine photographs: at 390px
  the strip stopped scrolling, pushed the page **378px** wide, and — since
  `scrollWidth` then equalled `clientWidth` — the arrows measured themselves as
  unnecessary and vanished exactly where they mattered most. A single `min-w-0`
  on the outer element is not enough; each child re-introduces the default.
  Verified 0px page overflow and working arrows at 1440 / 1024 / 768 / 390.
- **The frame is 3:2 with `object-contain`, not square with `object-cover`.**
  Nine of the ten photographs are 1536x1024, so a square frame was discarding a
  third of the width of each one — on the broccoli hero it cut the tray and half
  the title. `cover` buys a guaranteed-full frame with a guaranteed crop, which
  is the wrong trade for a photograph the grower composed. At 3:2 nine of ten
  render at **zero crop and zero letterbox** (measured at 1440 / 1024 / 768 /
  390); `red-amaranthus/hero.jpg` is 1254x1254 and letterboxes 104px a side.
- **`bg-sand` behind the frame is measured, not picked.** The studio backdrop in
  these photographs reads about rgb(240, 231, 225) along its top and bottom
  edges; `--color-sand` is #f2ebe3 = rgb(242, 235, 227). A letterbox therefore
  looks like more photograph rather than like bars.
- Thumbnails are 3:2 too (84x56 phone, 96x64 desktop). A square thumbnail would
  crop differently from the image it opens, so what you tap would not be what
  you get.
- **Photography spec and the baked-in-title problem are in
  `public/varieties/README.md`.** The current heroes have "<Name> / Microgreens"
  rendered into the top-left, which cannot be translated for `/kn`, duplicates
  the `<h1>` beside it, and is cropped away by the square grid tiles. Photographs
  should carry no text.
- Thumbnails are keyed by index as well as `src`: a content file may
  legitimately list the same filename twice, so `src` alone is not unique.

**No quantity selector and no add-to-cart, deliberately.** §18.6 puts both on
this page, but `/cart` and checkout are phase 5 (§14), and a button that cannot
add to a cart is worse than no button. The page states the price and the grow
window, so it already answers "what is it and what does it cost". The selector
lands with the cart.

**The FSSAI note under the benefits list is required, not decorative.** The copy
in the content files is already limited to nutrient-function claims (§4.3), and
the note says so in words so a reader cannot read the list as a health promise.

FAQs are native `<details>`: keyboard accessible, no JavaScript, and the answers
sit in the HTML whether or not they are open, so a crawler indexes all five.

`priority` on the hero emits `<link rel="preload" as="image">` in the head under
Next 16 rather than `loading="eager"` on the `<img>`. Both are correct; the
preload is the newer form. Do not "fix" the absent `loading` attribute.

---

## 19. Racks — computed pricing

**A rack's price is calculated from what it is made of, never typed in.**

This is the owner's requirement, in their own words: *"the cost of the bolt can
change, the cost of the bushes can change or even the shelf price can change, so
I don't want to recalculate the prices again."* Storing a finished price per rack
makes every vendor requote a spreadsheet exercise across the whole range;
storing the components makes it one edited number.

The alternative was considered and rejected: entering each rack's dimensions and
its total cost directly. It is less code and it fails the one requirement above.

### 19.1 The formula

Confirmed against the vendor's quote and verified by hand by the owner on
16 Sep 2026:

```
cost = legsPerRack × heightFt × ratePerFt      four legs, angle priced by the foot
     + shelves × platePrice                    one plate per shelf
     + shelves × boltSetsPerShelf × boltSet     8 bolt+nut pairs per shelf
     + bushesPerRack × bushPrice                4 per rack — NOT per shelf
```

**The plate is the brace.** That is why the bill has no horizontal or diagonal
members: four legs plus the shelves is the entire frame, and it is why a plate
is priced by footprint rather than by the foot.

The owner's worked example, which `src/lib/racks/pricing.test.ts` pins as the
acceptance test for the whole feature — 6 ft, 5 shelves, 1¼ × 3 ft plate, 1.4 mm
powder-coated angle:

| Line | Working | ₹ |
|---|---|---|
| Shelves | 5 × 250 | 1,250 |
| Legs | 4 × 6 ft × 40 | 960 |
| Bolts + nuts | 5 × 8 pairs × 2 | 80 |
| Bushes | 4 × 5 | 20 |
| | | **2,310** |

If the code ever disagrees with that figure, the disagreement is a bug and not a
revision of the price list.

Two derived rules:

- **Retail price rounds up, never to nearest.** ₹2,310 at 0% markup rounded to
  the nearest ₹50 is ₹2,300 — under cost. Direction is not cosmetic.
- **Shelf count is `height − 1`, fixed.** `shelvesForHeight(heightFt)`. The
  vendor's rule, confirmed 17 Sep 2026: 6 ft takes 5 shelves, 5 ft takes 4,
  down to 2 ft taking 1. It is an **identity, not a ceiling** — a 6 ft frame
  with 2 shelves is not something they build — so shelf count is never a choice
  anyone makes. The add form shows it as a readout and posts nothing; the
  server derives it from the height rather than trusting a field.

  This replaced a `shelfPitchInches` setting ("minimum clear height per tier"),
  which produced the same numbers at 14 in but expressed a cap, and so let a
  rack be published with fewer shelves than it physically has. The setting was
  removed from the type, the entity, the seed and the form.

  Heights must be **at least 2 ft**, rejected on save: 1 ft would give a frame
  with no shelves, and rejecting the height beats clamping the count.

### 19.2 Three layers

Split by how often each changes, which is what saves the recalculation:

| Layer | Changes | Stored as |
|---|---|---|
| Rates — what parts cost | often, when the vendor requotes | `RACKSPEC / SETTINGS`, `PLATE#<id>`, `ANGLE#<id>` |
| Build rules — how a rack assembles | rarely | `RACKSPEC / SETTINGS` |
| Models — the racks actually sold | when the range changes | `RACKSPEC / MODEL#<id>`, `AMODEL#<id>` |

One partition, so the whole screen loads in four small Queries. Keys are pinned
by `src/lib/db/keys.test.ts` alongside every other entity.

Plates are priced **per size, never per square foot**: the vendor's figures are
not linear in area — 1 × 3 ft works out at ₹67/sq ft and 2 × 3 ft at ₹92/sq ft,
because thickness climbs with depth. An area formula would misprice most of the
range.

**Powder coat only, and `finish` is gone.** From 17 Sep 2026 every rack is
powder-coated, so the `"painted" | "powder"` field had one possible value and
was removed from the type, the entity and the form. It was worse than merely
redundant: the add form defaulted it to `Painted`, so the easiest thing to do
with the screen was enter a grade Fewgrams does not sell. Powder coat is now a
fact about the range, stated once in copy. Bring the field back only if a
second finish really is sold.

**There is exactly one angle grade: 1.4 mm powder coat at ₹40/ft.**

The vendor's sheet also listed 1 mm at ₹25 and 1.2 mm at ₹30, both painted grey,
and both were seeded `active: false` for a day on the reasoning that what the
vendor quoted and what Fewgrams offers are different things worth keeping apart.
The owner corrected that on 17 Sep 2026: *"we dont have 1 and 1.2 mm painted
slotted angles, its only 1.4 mm different colored combination."* They are not
stock that was retired — they were never available. So they are **deleted, not
deactivated**, from the seed and from the database: an inactive row invites the
click that puts an unbuildable rack on sale.

The consequence is not small. **Every rack's legs are ₹40/ft with no cheaper
gauge to fall back on** — ₹960 on a 6 ft rack before a single shelf, which lifts
the cheapest 6 ft five-shelf rack from ₹1,600 to ₹1,960. Within the grade the
only thing that varies is colour, and colour changes nothing about the cost.

**Colour belongs to the angle grade, not to the rack**, because the vendor
couples them: each gauge comes in its own finish and its own colours. A rack picks a grade and then a colour *from that grade*, so a 1 mm green
rack is not enterable. Enforced in the form and again in the server action,
because a server action is addressable without its form. The admin screen
carries a standing note saying so — a painted grade offering grey alone reads
as a broken dropdown until you know the rule.

Colours come from a **fixed palette of swatches** (`src/lib/racks/colours.ts`),
picked rather than typed. Free text let "grey", "Grey" and "gray" become three
colours, and a rack referencing any of them would then fail the colour check on
its own grade. **Slugs are stored, labels are resolved** — the database holds
`orange` and the word comes from `admin.racks.colours.orange`, exactly as
`finish` already worked. That is what lets the customer view print a colour in
Kannada later without rewriting stored rows. `hex` lives in code and is not
translatable: a filled circle settles what the vendor's "purple" and yours
might not.

Adding a colour is a one-line edit plus a label. That is a real cost against
the rule that the admin screen stands alone, accepted because the alternative
is a second CRUD screen with a colour picker for a side product, and ten
colours already cover any powder-coat range.

### 19.3 A rate edit reprices every rack, immediately

**Changed 17 Sep 2026**, on the owner's instruction: *"we need to add logic to
update prices of all variants as soon as primary raw material cost is updated,
No need of approval."* §19.3.1 records what the previous design was and what
the change costs.

`RackModel.price` is **stored, and rewritten whenever a rate it depends on
changes.** Saving a rate calls `repriceAllRacks()`
(`src/lib/racks/reprice.ts`), which recomputes every published rack in **all
three ranges** and writes back the ones that moved. There is nothing to approve
and nothing to accept row by row.

It is stored rather than computed on read, which matters for three reasons: a
cart, a receipt and an order line each need one concrete figure to quote; a
rack whose parts have been retired keeps its last good price instead of reading
as ₹0; and `costAtPublish` remains as the record of which cost the stored price
came from, which is what the margin column and the integrity flag are built on.

**All three ranges, from any one screen.** The markup, the rounding, the heights
and the corner leg count are shared by every range, and the angle rate prices
the legs of both steel ranges — so an edit on `/admin/racks` can move prices on
`/admin/pipe-racks`. A cascade covering only the screen it was triggered from
would leave the other two quietly wrong, so there is one cascade and every
rate-writing action calls it. It also revalidates all three routes.

**Which mutations cascade, and which deliberately do not:**

| Action | Cascades | Why |
|---|---|---|
| Save settings (incl. markup, rounding) | yes | can move every price with no material rate changing |
| Save a plate, an angle grade, the pipe rates | yes | a material cost moved |
| Save a footprint (frame or pipe size) | yes | dimensions move the running feet, which moves the cost |
| Seed the vendor sheet | yes | it writes rates |
| **Add** a plate, grade or footprint | no | no existing rack references it |
| **Toggle or delete** one | no | it makes racks *unpriceable*, not cheaper — see below |

Two kinds of row are never written by a cascade, both in `repricedRows`:

- **Unpriceable ones.** A retired plate or an absent pipe rate means the cost is
  unknown, not zero. The row keeps its last good price and stays flagged.
- **Unchanged ones.** Both the price *and* the cost are compared, not the cost
  alone — a markup edit moves the price while the cost stands still, and
  rounding means a small cost move often leaves the price where it was. This is
  what stops ₹2 → ₹2.01 rewriting a hundred rows and restamping every
  `publishedAt`.

Every row a single cascade touches gets **one shared `publishedAt`**, so the
sweep reads as one event in the data rather than a hundred near-simultaneous
ones.

Setting a price by hand still works and still re-baselines `costAtPublish`, but
its meaning has narrowed: **a typed price holds until the next rate edit, which
overwrites it.** The screens say so. If a permanent per-rack override is ever
wanted, it needs a flag on the model for the cascade to respect — deliberately
not added, because nothing asked for one.

The three row states survive, with the middle one changed from a workflow into
an alarm:

| State | When | Behaviour |
|---|---|---|
| Live | `costNow === costAtPublish` | nothing to do — the normal state after any rate edit |
| Cost moved | they differ | **should not happen through the UI.** Flagged with both figures and a Republish button, kept as the repair for a write that bypassed the app |
| Cannot price | its plate, grade or footprint has been retired | flagged; never zeroed |

### 19.3.1 What the cascade gives up, and what still protects an order

The design it replaced froze the price at publish so that a rate edit could
never move a price a customer was looking at. That was worth stating plainly
before removing it:

- **An order that exists is safe either way.** An order line snapshots its name
  and price at purchase (§4.3), so no cascade can reach it. This was always the
  stronger half of the protection.
- **What the cascade does expose is the gap between basket and payment.** A
  customer can add a rack at one price and pay at another. Closing that is
  checkout re-reading the model and confirming the price at payment time, which
  belongs with the cart work (§12) — **noted here as a requirement of that
  phase rather than left implicit.**
- **A hundred rows of frozen prices with a queue of approvals was the worse
  failure.** It is the hand recalculation this whole feature exists to remove,
  and at three ranges it had stopped being a review step and become a chore
  nobody would finish.

**Display order is derived, not typed.** Racks list shortest-first
(`listRackModels`: height, then shelves, then shelf size, then colour). A
manual `sortOrder` existed until 17 Sep 2026 and went for two reasons — height
is what racks are compared by, so the order is a fact rather than a decision,
and the field carried its own bug: `Number("")` is `0`, so a rack added with the
box left empty read as a deliberate zero and every one of them sorted together.
Deriving it also simplified the key, from `MODEL#<sortOrder>#<id>` to
`MODEL#<id>`.

**One column per attribute.** The rack was one string — `6 ft · 5 shelves ·
1.25 × 3 ft · 1.4 mm Green` — in a single column, which read as a sentence
rather than as data: it wrapped, and it was not comparable down the column,
which is the only reason to list racks together. Height, shelves, shelf size,
gauge and colour each have a column, so two racks differing in one respect
differ in one column. Twelve tracks fit the shell's 1100px measure in about
990px; a first pass at comfortable widths came to 1148px and pushed the Live
toggle and Delete link behind a horizontal scroll, which is worse than any
amount of narrowness in a numeric column.

### 19.3.2 Filling out the range is a script, not a button

**`scripts/racks-fill.mjs`**, run as `node --env-file=.env.local
scripts/racks-fill.mjs` (`--dry` to preview). It publishes every rack either
rate card can build that is not already on sale — **one per height**, in every
**active** shelf size or footprint and gauge, at the current markup with
`costAtPublish` recorded. At five heights (2–6 ft), one gauge, five plates and
six footprints that is 25 plated racks and 30 open-frame ones.

There were two bulk buttons on the admin screens — "add every missing
combination" and "republish all stale" — and both were **removed on 17 Sep
2026** at the owner's instruction: *"do not build too many UI elements to load
the different combination or accept the prices. The UI should be simple enough
to add different combination, but the missing combination can be added directly
into the DB from your end."* Adding one rack is a three-field form; filling out
a thirty-row grid is a data job, and a data job does not need a UI. Accepting a
recomputed cost stays one button on the one row it applies to, where the two
figures being compared are visible.

The script is additive and idempotent — existing racks are matched on config and
skipped, so a hand-set price, an override or a deactivated row survives every
run. Inactive parts are excluded, so it cannot resurrect a retired plate as a
rack. An unpriceable config is skipped rather than written at ₹0.

An earlier generator enumerated every shelf count from 1 to a cap and produced
75 plated racks, of which 50 were frames the vendor does not build; `height − 1`
(§19.1) removed the enumeration.

**The script holds a second copy of the arithmetic**, because it is plain ESM
and cannot import TypeScript on Node 20. That is the one dangerous thing about
it — a divergence would write wrong *frozen* prices, which do not correct
themselves — so `src/lib/racks/script-parity.test.ts` imports both and asserts
they agree across the whole range, including the rounding step. Every pure
function in the script is exported for that reason, and its DynamoDB entry point
is guarded on `process.argv[1]` so importing it writes nothing.

**Each add form shares its table's `COLUMNS`**, so a new row's inputs are
exactly as wide as the saved rows above it. With their own equal-column grids
the boxes were visibly different widths from the row they were about to become,
which read as two unrelated forms. The submit button spans the action tracks,
which have no field to align with. Only from `lg`, where the tables are
unscrolled; below that both stack and matching widths would only mean matching
narrowness. The racks table is the exception — its add form picks from labelled
options (`1 × 2 ft — ₹180`) where the row shows resolved values (`1 × 2`), so
one width cannot serve both.

Rounding means a cost change often leaves the price where it was (₹2,310 and
₹2,330 both round up to ₹2,350), so the button's label switches to *"Accept —
price stays ₹X"* rather than naming a price that is not changing.

### 19.3.3 No cost matrix

One existed: every shelf size against every angle grade, at a selectable
height, recomputed live so a rate edit had a visible consequence. **Removed
17 Sep 2026.**

It was redundant. `Racks on sale` already lists live cost, selling price and
margin for every rack actually offered, and it recomputes from the same rate
card — so the matrix's only unique contribution was the fifteen combinations
nobody sells. The owner asked what it was for twice, which was the answer.

`PriceMatrix.tsx`, the `?h=` search-param plumbing and the six `matrix*`
message keys were deleted rather than left unreachable.

What it did that nothing else now does: show what an *unlisted* combination
would cost, before adding it. That question is answerable by adding the rack
and reading its row, then deleting it if the figure is wrong — one more step,
for a decision taken once per rack rather than daily.

### 19.4 No "trays per shelf" figure

The admin screen briefly computed and displayed trays per shelf, from a 10 × 20 in
tray. **Removed 16 Sep 2026.** A rack goes to whoever buys it and they use
whatever tray they already own, so the number was an assumption presented as a
specification. `traysPerShelf` and `ASSUMED_TRAY` were deleted along with it
rather than left unread.

The underlying finding is still worth knowing, as buying information rather than
as a published figure: **footprint runs out long before load does.** Three trays
of wet medium is roughly 15 kg against a 40 kg shelf, and on a 10 × 20 in tray
only the 2 ft-deep shelf (24 × 36 in) takes three — a 10 in-wide tray needs 20 in
of depth to sit sideways, and nothing shallower has it. That is what separates a
growing rack from a storage rack, and it should inform which racks lead the
range even though the site does not claim it.

Revive the column only if Fewgrams sells a rack bundled with a known tray, keyed
to that tray's real dimensions.

Capacity in kilograms stays: it is the vendor's own figure, and the rack row
shows it multiplied by the shelf count.

### 19.5 What was deliberately not built, and what superseded it

- **No customer view of the *models*.** The owner asked for the admin screen
  first. `RackModel` therefore carries no customer-facing name and nothing
  writes to the product catalogue: a rack model becomes a `ProductVariant` when
  there is a page to render it on. Half a projection would be a second answer to
  "what racks do we sell". A model is identified by what it is — *6 ft ·
  5 shelves · 1¼ × 3 ft · 1.4 mm Green* — which is what the admin table shows
  and what a packing slip needs.
- **No per-rack markup override.** One global figure until there is a reason for
  two.

**Both of those held for about an hour.** `/shop/racks` was built on
17 Sep 2026 to show the three *ranges* with no models and no prices, and then
the owner asked for add-to-cart the same day — so §19.5 now describes a
decision that has been superseded rather than one still standing. What replaced
it is §19.7.

The part of the reasoning that survived is worth keeping: a rack model still
carries **no stored customer-facing name**, and it is still not a
`ProductVariant`. It is described from its own figures at read time
(`rackLineName`), which is exactly what §19.5 said a model is identified by. The
projection §19.5 refused was a *stored* one.

### 19.6 `/shop/racks` — the three ranges

One card per range: the photograph, the name, one sentence on what a level is
made of, a **from-price** (the cheapest published model in the range), the
three-day delivery date, and six properties scrolling behind the cut-out on
hover.

It replaced an empty state. That URL was served by `/shop/[category]`, which
reads racks out of `ProductEntity` and finds none — because a rack is computed
from a rate card rather than entered as a SKU — so the category strip and the
footer both led to "no products in racks yet" while three admin screens quietly
priced the whole range.

**From-price, not price**, because a range is not one product: the height and
the shelf size a customer picks are what decide the real figure. A range whose
models are all unpublished or deactivated is **not rendered at all**, rather
than linked to a page that would 404.

**The properties are six different things, not the range name repeated** — the
owner's instruction: *"so that it is clear that we are showing different
properties not the same text getting scrolled"*. The two steel ranges share four
of their six, because they are the same steel; what separates them is "Steel
shelf plates" against "Open on every level" and "Takes an LED tube". None of
them may restate a figure the admin screens tune — no price, no height, no shelf
count — so "Built to your size" and "Load rated" carry those ideas instead.

### 19.7 `/shop/racks/[range]` — choosing one, and buying it

Three option rows — **height, shelf size, colour** — then the price and
add-to-cart. Colour is offered only where there is a choice: a pipe rack gets a
sentence saying white is the only finish UPVC comes in, because a selector with
one option invites a tap that does nothing.

**The choice is in the URL** (`?h=6&s=1.25x3&c=orange`), not in client state,
and the options are `Link`s. Three reasons, in order of weight:

1. **The price is computed on the server.** A rack's price is per model, so a
   client-side selector would need every model's price *and* twenty
   pre-formatted totals for each — 45 models on the pipe range alone. With the
   choice in the request, the page resolves one model and formats one set,
   exactly as the tray page does.
2. **Choosing needs no JavaScript**, and the chosen rack is in the address bar
   to be shared or bookmarked.
3. **`AddToCart` needed no changes**, because its key is fixed again once the
   request decides it.

The cost is a round trip per tap. For a page whose whole content is one price
only the server can compute, that is the honest trade.

**Nothing 404s on a bad option.** An unknown *range* does — it is a route
segment and there are three — but a height, size or colour that does not exist
falls back to the nearest offered one, because those come from a query string
that a stale bookmark or a retired part can invalidate. The one exception is
deliberate: when a height and a size are each offered but not *together*, the
page says so rather than silently moving the customer to a rack they did not
pick.

**Heights and sizes are listed from what is published**, not from
`RackSettings.heightsFt` — a height whose models have all been deactivated must
not be offered.

The **SKU is shown** as a fact. It is what a packing slip and a WhatsApp message
about the order will both say, and a customer who can quote it is one we can
answer quickly.

### 19.8 Three days, inside Bengaluru

The owner's figure, 17 Sep 2026: *"for racks within Bangalore location, the
delivery timeline is three days"*. It lives in `src/lib/racks/lead-time.ts` as
`RACK_LEAD_DAYS`.

**One constant, not a per-row field** — the opposite of a tray's `leadDays`
(§23.1), and the two look alike from a distance. A tray's is per row because
three items already come from two suppliers; a rack has **no supplier**. It is
assembled to order from a rate card, so three days is our own build time and
every range goes through the same bench. If a range ever gets its own timeline,
that is the moment to move it onto the model — not before.

**"Within Bangalore" is the scope of the promise, not a condition the code
checks.** Fewgrams delivers only to serviceable Bengaluru PIN codes and refuses
everything else at checkout (§7), so there is no slower option to qualify
against. Repeating the condition in code would imply one exists. It appears in
the *copy* because a buyer reading "three days" about a made-to-order steel rack
will reasonably wonder whether that is a city figure or a national one.

The module throws on import if the constant ever exceeds `MAX_LEAD_DAYS`, which
`daysFromToday` would otherwise clamp — printing a nearer date than the constant
claims, silently.

### 19.9 The cart learned a fourth kind

`CART_KINDS` is `variety | seed | tray | rack`, coded `v | s | t | r`.

**A rack is the first kind whose key is not a content key**, and that forced the
cart's key validation to become kind-aware (`isValidKeyFor`) rather than be
loosened for everyone. A content key is lowercase letters and hyphens with **no
digits** — that ban is the whole point of the rule, because `amaranth-2` is the
naming failure it exists to prevent. A rack is identified by precisely those
digits: 6 feet, 5 shelves, a 1.25 × 3 ft footprint, 1.4 mm steel.

So a rack is keyed by **its SKU**, which already existed for packing slips on
the argument that a readable identifier beats a UUID "when the person picking it
is the person who priced it". Lowercased, because a cart key is also a URL
segment. The two key sets are provably disjoint, pinned in `cart-key.test.ts` —
which is what stops one string addressing two products.

**Colour is in the key, not on the model.** `RackConfig` deliberately has none:
orange, green and purple are the same rack at the same price, and three models
for one product is three rows to keep in step. Colour is chosen at purchase, and
the cart has no per-line attributes — a line is a kind, a key and a quantity.
Appending it to the key reconciles those two facts and gets the behaviour right
for free: two racks of one size in two colours are two lines, because they are
two things to build. A pipe rack has no colour segment; appending `-white` would
imply a choice nobody is offered.

**A rack has no content file, so its name is composed** (`rackLineName`) —
"Shelf racks · 6 ft · 5 shelves · 2 × 3 ft · Purple", localised, with plain
decimals rather than the admin table's `1¼`. §4.3 still requires an *order* line
to snapshot that name at purchase; this composes the current one, and checkout
is where it would be frozen.

**`Timing` gained a fourth arm, `build`**, distinct from a tray's `supplier`
even though both are a flat number of days: one is somebody else's dispatch and
varies per row, the other is our own build time and is one constant. Collapsing
them would make the next change to either touch both.

**`item.grams === null` stopped meaning "a pack".** It had been the test for
"unweighed" while trays were the only such kind, and a rack priced "per pack"
and counted in "packs" is the exact class of wrong number that survives review
because the code reads fine. The cart page now branches on the kind
(`lineUnits`, `stepKey`).

Verified end to end on a five-line cart — a tray, a green, a shelf seed, a pipe
rack and a purple shelf rack: one consolidated date, 200 g of weight from the
two weighed lines only, and a correct subtotal. And on a crafted cookie: a
colour the grade does not offer and a height never published are both reported
as no longer on sale, while a pipe key carrying a colour and outright junk are
dropped by the parser.

### 19.10 Still not built

- **No rack in an order.** Checkout does not exist (§9), so nothing snapshots
  the composed name or the price, and nothing tells the owner to build the rack.
  Identical to the gap trays have (§23.9) and now with a bigger number attached.
- **No delivery charge.** §7 sets racks at a flat ₹500 and the cart charges
  nothing yet, so a ₹6,900 rack currently quotes free delivery by omission.
- **The markup is a test value.** `RackSettings.markupPercent` is 80 in the dev
  database and every price on the site is computed from it. Confirm it before
  these pages are public.
- **No per-rack markup override.** One global figure until there is a reason for
  two.
- **One photograph per range, not per model.** A 4 ft and a 6 ft rack of one
  range show the same picture, which is honest — it is the same object at two
  heights — but a cart line for a 2 ft rack shows a photograph of a taller one.

### 19.11 The range photography

Three cut-outs, supplied by the owner on 17 Sep 2026, at
`public/racks/<range>/cutout.webp`. Details and the two known caveats — the
steel is orange rather than the brand green, and the `angle` master is clipped
at its left edge — are in `public/racks/README.md`; prompts are in
`docs/TRAY_PROMPT.md`.

**4:5 portrait and normalised on height**, which is the opposite of the variety
cut-outs (§17.4). Punnets are all roughly one shape, so a common *width* gives
them a common size; racks are all the same kind of tall object at different
widths, so a common *height* is what makes three ranges read as one set. Their
widths land at 74%, 79% and 83%, which is the rack rather than the photography.

**No `hero.jpg` for any of them.** A hero is a photograph flattened onto the
ground of the frame it sits in, and the only rack frame that exists is a cut-out
panel. There is no rack gallery to design a background for yet.

Racks are also the first category with a photograph on its **tile** — the home
page and `/shop` both render the `shelf` range through `CategoryMedia`, which is
where the four category tiles' media decision now lives. One tile serves the
category, so the other two ranges appear only on `/shop/racks`.

### 19.12 Open with the vendor

Both change the numbers, neither blocks the screen:

1. **Is angle cut to length, or sold in fixed sticks?** Slotted angle usually
   ships in 8 ft or 10 ft lengths. If so a 6 ft rack buys four 8 ft sticks for
   its legs and uses 24 ft of the 32 — ₹1,280 rather than ₹960 at ₹40/ft — and
   the model becomes `× ceil(height / stockLength)` with offcut waste at every
   non-standard height.

   **This now matters far more than it did.** An open-frame rack (§20) is
   almost entirely angle: a 6 ft 1 × 4 ft one takes 94 running feet in 29
   separate pieces. How those pieces are cut from stock lengths, and who eats
   the offcuts, is the single largest open question in the rack range.
2. **What is the bush?** A foot, or a leg coupler. Four per rack either way
   today, but a coupler would scale with how the legs are made up rather than
   with the rack.

Two figures in the vendor's sheet are also worth confirming: the 1 × 2 ft plate
claims 20 kg at 0.4 mm while the 1 × 3 ft claims 10 kg at the same thickness
(plausible on the shorter span, but a 2× jump), and 1¼ × 3 and 1½ × 3 are both
0.6 mm over the same 3 ft span yet differ 20 vs 30 kg.

---

## 20. Angle racks — the open-frame range

**A second rack category, added 17 Sep 2026: a rack built entirely from slotted
angle, with no steel shelf plates at all.** Its own admin screen,
`/admin/angle-racks`. The plated range keeps `/admin/racks`, relabelled
**Shelf racks** — one of two rack tabs called plain "Racks" would be the
ambiguous one.

### 20.1 What a shelf is

The owner's description: each shelf level is a rectangle of angle — two along
the length, two across the depth — **plus one more along the length down the
middle**, which braces the span and is where an LED tube mounts. In their words:
*"if a user is asking for four feet length and one feet depth we will have 3
four ft slotted angles and two 1 feet slotted angle — two 4 feet slotted angle
will be on the either ends and one 4 feet slotted angle will be in the middle to
provide the support and also to install the LED tube lights."*

So it is five pieces, not four:

```
frameFeetPerShelf = 3 × lengthFt + 2 × depthFt
```

A 4 × 1 ft level is **14 running feet**, which `pricing.test.ts` pins as the
acceptance test for the category.

The mid-rail runs **along the length**, not across the depth. That is the axis
the owner named and the load-bearing one; a rail across a 1 ft depth would brace
nothing, and the tube it carries has to run the long way for the light to fall
down the shelf.

One consequence to keep in mind when reading the price list: **cost is not a
function of area.** 1 × 4 ft and 2 × 2 ft both cover 4 sq ft and take 14 ft and
10 ft of angle respectively, because length is counted three times and depth
twice. A long shallow shelf costs more than a short deep one of the same area.

### 20.2 The formula

```
cost = legsPerRack × heightFt × ratePerFt                  same four legs
     + shelves × (3×length + 2×depth) × ratePerFt           the framing
     + shelves × boltSetsPerShelf × boltSet                 unchanged
     + bushesPerRack × bushPrice                            unchanged
```

**Only the shelf line differs from §19.1.** A bought plate at its own price
becomes five lengths of angle at the grade's rate per foot. Shelves are still
`height − 1`; the price still follows the rates immediately (§19.3)
(§19.3); colour still belongs to the grade and not to the rack.

Bolt and nut counts are taken as **identical** to a plated rack, on the owner's
instruction: *"the nuts and bolts required would be same even for the slotted
angle there won't be any additional and even if there is any additional it will
be very negligible so we don't have to consider it."*

The owner's 6 ft 1 × 4 ft rack, at 1.4 mm / ₹40 a foot:

| Line | Working | ₹ |
|---|---|---|
| Legs | 4 × 6 ft × 40 | 960 |
| Framing | 5 × 14 ft × 40 | 2,800 |
| Bolts + nuts | 5 × 8 pairs × 2 | 80 |
| Bushes | 4 × 5 | 20 |
| | | **3,860** |

**Dropping the deck costs more, not less** — worth stating plainly because the
owner expected the opposite. On a 1 × 3 ft footprint at 6 ft, the plated rack is
₹2,060 and the open frame is ₹3,260: each shelf saves the plate's ₹200 but buys
11 ft of angle at ₹40 — ₹440 — to replace it. `pricing.test.ts` pins that direction, so
if it ever flips it will be because a rate moved and not because the model
changed. The open-frame range is therefore a *lighter, see-through, tube-lit*
rack rather than a cheaper one. Whether that is what the owner wants to sell is
a business question, not a code one.

### 20.3 One rate card, two ranges

Everything that *changes* is shared; everything that *differs* is a different
table.

| | Shelf rack | Angle rack |
|---|---|---|
| Legs | 4 × height × ₹/ft | the same |
| Bolts, bushes | 8 pairs a shelf, 4 bushes a rack | the same |
| Markup, rounding, heights | shared `RackSettings` row | the same row |
| Angle grade | `ANGLE#<id>` | the same list |
| A shelf | a bought plate: own price, own load rating | `3 × length + 2 × depth` ft of angle |

So the rates live **once**, on Shelf racks, and the angle-racks screen shows them
**read-only with a link**. A second rates form would be a second place to change
a bolt price and one of them to forget — precisely the recalculation the whole
design exists to avoid. Proven end to end: editing the bolt price from ₹2 to
₹2.50 on Shelf racks flagged all 30 open-frame racks with their old and new
cost, prices unmoved.

Both categories go through **one pricing module**, `src/lib/racks/pricing.ts`,
and a test asserts the legs, bolt and bush lines are byte-identical between
them — so a future requote cannot be applied to half the range.

### 20.4 Footprints have no price and no capacity

`FrameSize` is `{ id, depthFt, lengthFt, active }` and nothing else. Both
absences are deliberate:

- **No price.** A frame is not a part the vendor sells. Storing one would be
  storing the answer to a sum, which is what §19 exists to prevent.
- **No capacity.** There is no deck to load. The vendor's `capacityKg` rates a
  steel plate; what an open frame holds depends on what the buyer rests on it,
  and inventing a figure would repeat the "trays per shelf" mistake (§19.4).

In place of a load column the table shows **total running feet of angle** —
legs plus framing, 94 ft for the owner's 6 ft 1 × 4 ft rack. On a rack that is
angle and almost nothing else, that is the figure that checks straight against a
vendor invoice.

Unlike plates, the footprint list is **Fewgrams' choice, not the vendor's**: any
size is buildable from angle by the foot. The starting set is the five plated
footprints, so a buyer can compare the two ranges at the same size, plus
1 × 4 ft from the owner's example.

### 20.5 Keys

| Entity | PK | SK |
|---|---|---|
| Footprint | `RACKSPEC` | `FRAME#<id>` |
| Angle rack on sale | `RACKSPEC` | `AMODEL#<id>` |

Same partition as the rate card, because it is priced from the same rates — one
load serves both screens.

**`AMODEL#` and not `ANGLEMODEL#`**, because `ANGLE#` is already the grade
prefix and two prefixes where one is nearly the other is a `begins_with` bug
waiting to be written. `keys.test.ts` pins that `begins_with(SK, "MODEL#")`
cannot match `AMODEL#…` — the `#` is part of the prefix — because if a future
rename dropped it, the two rack screens would silently start showing each
other's racks at each other's prices.

Two entities rather than one `RackModel` with `plateId?` and `frameId?`: a row
where neither is guaranteed is a row where the applicable pricing formula is a
runtime question. Two entities make it a type-level fact.

### 20.6 Not built

**The customer view arrived on 17 Sep 2026** and is shared with the other two
ranges — `/shop/racks/angle` (§19.6, §19.7). Nothing here writes to the product
catalogue even so: a model is described from its own figures at read time rather
than projected into a SKU (§19.5).

What is still absent is the same list as §19.10: no order, no delivery charge,
and a markup that is a test value.

There is no seed button on this screen either: the footprints arrive with
`scripts/racks-fill.mjs` (§19.3.2), and the owner asked for fewer buttons here,
not more.

---

## 21. Pipe racks — the UPVC range

The third rack category, added 17 Sep 2026: **a rack built from 1 inch UPVC
pipe, joined with four-way connectors.** Admin screen at `/admin/pipe-racks`.

The owner's reason is not price: *"in this the stability is a bit important."*
Light to move, nothing to rust in a wet grow room, wipes clean. It is the
**dearest of the three ranges**, and by some margin.

### 21.1 The bill

```
cost = legs × height_ft × pipe_rate_per_ft              uprights
     + shelves × 2 × (length + depth) × pipe_rate_per_ft   shelf frames
     + legs × shelves × connector_price                 a four-way per junction
     + legs × bush_price                                one bottom bush per leg

legs = 4 + (length_ft >= 4 ? 2 : 0)
```

Owner's rates: pipe **₹25/ft**, four-way connector **₹110 each**, bottom bush
**₹10 per leg**.

Worked example — 6 ft, 5 shelves, 1½ × 3 ft:

| Line | | ₹ |
|---|---|---|
| Uprights | 4 legs × 6 ft = 24 ft × 25 | 600 |
| Shelf frames | 5 × 2 × (3 + 1.5) = 45 ft × 25 | 1,125 |
| Connectors | 4 legs × 5 levels = 20 × 110 | **2,200** |
| Bushes | 4 × 10 | 40 |
| | | **3,965** |

Shelves are still `height − 1` and retail still rounds **up** — the two rules
every range shares, which is why all three go through
`src/lib/racks/pricing.ts`. And like the other two, a pipe rack reprices itself
the moment a rate it depends on changes (§19.3) — including the shared markup,
which is edited on `/admin/racks`.

### 21.2 Three findings worth knowing before quoting

**The fittings, not the pipe, set the price.** Twenty connectors at ₹110 come to
₹2,200, more than all 69 ft of pipe in the same rack. `pricing.test.ts` pins the
direction, so a requote that flips it is flagged rather than absorbed.

**So height is expensive and depth is cheap.** Every extra foot of height is
another shelf level, and a level is four more connectors before a single foot of
pipe — ₹440 of fittings against ₹175 of pipe on a 1 × 2½ ft level. Depth, by
contrast, adds pipe and no junctions at all: 1 × 3 ft to 2 × 3 ft at 6 ft tall
is ₹250 on a ₹3,840 rack.

**It is the dearest range, not the cheapest** — the same surprise as §20, in the
same direction. At 6 ft on a 1½ × 3 ft footprint:

| Range | Cost |
|---|---|
| Plated steel (§19) | ₹2,810 |
| Open angle frame (§20) | ₹3,460 |
| UPVC pipe (§21) | ₹3,965 |

Pinned as an ordering in `pricing.test.ts`, so a flip means a rate moved rather
than the model changing.

### 21.3 A pipe shelf has no mid-rail — the leg goes underneath

The one thing that separates the two open ranges, and it is easy to get wrong.
An **angle** shelf takes a third length down the middle to brace the span and
mount an LED tube, so `3 × length + 2 × depth` (§20.1). A **pipe** shelf is the
perimeter only, `2 × (length + depth)`, and braces its span from *underneath*
with the middle support leg instead.

Consequences:

- A 4 ft pipe level is four pieces; a 4 ft angle level is five.
- Pipe cost per shelf **is** a function of perimeter — 1 × 4 ft and 2 × 3 ft
  come out identical. Angle cost is not, because length counts three times.
- The middle support adds **no** horizontal footage. It stands under the
  existing long rails at their midpoint; two halves of a 4 ft rail are still
  4 ft of pipe. What it adds is two uprights, two bushes and — the expensive
  part — **two more connectors at every level**.

**Two mid-support legs, not one, is an inference.** The owner said "a supporting
leg", singular. Both long rails span the length, so propping only one would
leave the other exactly as it was, and the reference photo shows the mid legs in
a pair. At 6 ft on a 2 × 4 ft footprint it is the difference between ₹5,760 and
₹5,050, so it is **flagged for confirmation** rather than assumed silently.
`PIPE_MID_SUPPORT_LEGS` is one number to change.

### 21.4 What it shares, and the one thing that makes this screen different

| | Shared with §19/§20 | This range's own |
|---|---|---|
| Corner legs | 4, from `RackSettings.legsPerRack` | — |
| Heights, markup, rounding | the same `SETTINGS` row | — |
| `shelvesForHeight`, `retailPrice` | the same functions | — |
| Material rates | — | pipe, connector, bush — `PIPESETTINGS` |
| Footprints | — | `PIPESIZE#` |
| Bushes | — | per **leg**, not four per rack |
| Fasteners | — | none; the joint *is* the fitting |

**This is the only rack screen with a rates form on it.** The angle screen has
none deliberately (§20.3) because every rate it uses belongs to the plated range
too, so a second form would be a second place to change a bolt price. Nothing
else in the catalogue buys UPVC pipe, four-way connectors or pipe bushes, so
those three rates have no other home. What *is* shared is still edited only on
`/admin/racks` and shown here read-only with a link.

Hence the second settings row rather than three more fields on `RackSettings`:
on the shared row they would be three attributes the plated rates form neither
renders nor writes, which is the unread schema field CLAUDE.md says to cut.

### 21.5 No gauge, no colour — and a height cap

**One pipe spec, and it is white.** So a footprint plus a height is the whole of
a model: `PipeRackConfig` has three fields where `RackConfig` has four, the add
form asks two questions instead of three, and both tables are a column narrower.
The range is a third smaller per footprint than the other two.

**Six feet is the ceiling.** `PIPE_MAX_HEIGHT_FT`, the owner's figure — a 1 inch
upright gets springy above it. A constant and not a setting, because the
`heightsFt` list is shared with two steel ranges that have no such limit: if 8 ft
is ever added there, this stops the pipe range following it into something that
wobbles. Enforced in three places for the usual reason — the add form does not
offer it, `allPipeRackConfigs` filters it, and the server action re-checks it,
since an action is addressable over HTTP without its form.

### 21.6 Footprints — a different grid from the steel ranges

Three depths by three lengths, the owner's own list: **1, 1½, 2 ft deep** by
**2½, 3, 4 ft long**. Nine sizes.

Two differences from the plated footprints, both theirs: **1¼ ft depth is gone**
and **2½ ft length is new**. That is why it is a separate list rather than a
shared one with an `offeredIn` flag — two product ranges with different size
grids are two lists.

**One thing to confirm.** The owner wrote *"we will not have depth of 1 and
1.25"* and then, in the same sentence, *"what we will have is 1 feet depth, 1 and
a half feet depth, and 2 feet depth. That's it."* The explicit list is taken as
authoritative — it is more specific and it closes with "that's it" — and dropping
1¼ ft alone gives exactly that list from the plated set, which reads like the
intended edit. If 1 ft depth really is out, deactivate three rows.

No price and no capacity on any footprint, for the reasons in §20.4. The table
shows two derived figures instead: pipe per shelf, and **the leg count** — which
jumps from 4 to 6 as you type a length of 4, because that is the only place a
footprint's length has a consequence an operator cannot otherwise see.

### 21.7 Keys

| Entity | PK | SK |
|---|---|---|
| Pipe rates | `RACKSPEC` | `PIPESETTINGS` |
| Footprint | `RACKSPEC` | `PIPESIZE#<id>` |
| Pipe rack on sale | `RACKSPEC` | `PMODEL#<id>` |

Same partition as the rest, so one load serves all three screens — `loadRateCard`
is now six parallel Queries.

**`PIPESETTINGS`, not `PIPE#SETTINGS`**, so a `begins_with(SK, "PIPESIZE#")`
listing the footprints cannot sweep up the rates row — the same class of mistake
`ANGLEMODEL#` would have been (§20.5). `keys.test.ts` now asserts that **each of
the seven list prefixes on this partition matches exactly one of the nine key
shapes**, and that neither settings row is caught by any of them.

Footprint ids are `pp-1.5x3`, not `p-1.5x3`: the plated plate already owns `p-`,
and one character between two id spaces is not enough.

### 21.8 Filling the range and the script's second copy

`scripts/racks-fill.mjs` (§19.3.2) now fills all three ranges in one pass —
25 plated, 30 angle, 45 pipe. Additive and it never overwrites, so a hand-set
price survives every run.

The script duplicates the pipe arithmetic for the reason given in §19.3.2 —
plain ESM cannot import TypeScript on Node 20 — and the duplication now includes
**three constants as well as the formulas**. `script-parity.test.ts` compares
both copies across the whole range and asserts the constants match, because a
height cap that differed would publish racks the screen refuses to build, and a
mid-support threshold that differed would misprice every 4 ft rack by ₹710.

### 21.9 Not built

**The customer view arrived on 17 Sep 2026** — `/shop/racks/pipe` (§19.6,
§19.7). The three ranges come to **100 racks** in DynamoDB, and that count is
what settled the shape of it: a list was never going to work, so the page offers
two axes — height and footprint — and resolves one model. Pipe is the range
where it matters most, with 45 of the 100.

It is also the only range with **no colour choice**: one pipe spec, and it is
white, so the page shows a sentence where the other two show chips.

Still absent, as §19.10: no order, no delivery charge, and a test markup.

---

## 22. Seeds — stock sold by weight

The third catalogue with a page per item, after microgreens (§18.6) and the
rack ranges (§19–§21). Built 17 Sep 2026 on the owner's two instructions:

> *"Next, I would like to build the admin page for the seeds. Basically I
> should be able to add the number of grams of seed that I hold today for
> selling, I should be able to add different varieties of seeds. And also each
> seed will have its own description like microgreens. We can reuse the entire
> template of microgreen details page to show the seeds information. Adding to
> the cart should always be limited to the quantity that I hold and minimum
> order quantity of each seeds would be 100 grams. Once it is out of stock we
> should show out of stock message on the seeds display page."*

> *"I feel we have to get rid of products menu from the admin page since it's a
> generic form built for multiple products which isn't suitable. So we need
> seed specific inventory page similar to microgreen where I can enter the seed
> information and also the available quantity and its price per 100 grams."*

**The first quotation's stock rule was superseded the same day** — "limited to
the quantity that I hold" and the out-of-stock message are gone, replaced by a
delivery rule. See §22.2. The 100 g minimum from that quotation survives
unchanged.

### 22.1 A seed is shaped like a variety, not like a product

`Seed` is its own entity (`src/lib/types.ts`), modelled on `Variety`:

| | In DynamoDB | In `content/seeds/<key>.json` |
|---|---|---|
| `Seed` | `pricePer100g`, `stockGrams`, `active` | name, description, sowing, specs, uses, cautions, FAQ |

It is deliberately **not** a `Product` with `category: "seeds"` and a
`stockGrams` variant, which is what §3 originally described. Three reasons, all
of which the old `/admin/products` screen demonstrated:

1. **`Product.name` is typed into the admin UI.** Every catalogue entity a
   customer reads about moved its text to content files on 15 Sep 2026 (§4.3),
   and a seed has more to say than a tray does, not less.
2. **Variants earn their place on trays** (virgin vs PP, 10×20 vs 10×10). A
   seed has one axis — how much you want — and that is a quantity, not a
   variant. "100 g / 250 g / 500 g" as three SKUs would multiply the rows and
   then have to keep three stock figures honest against one sack.
3. **Stock on a variant is stock per SKU.** The owner holds one sack, and one
   number is the honest model of one sack. It also makes the decrement at
   checkout an `UpdateItem` with a condition on one attribute, rather than a
   read-modify-write of a nested list that cannot be made safe under two
   concurrent orders (§15).

Trays and snacks stay on `Product` until they get screens of their own. Racks
were pulled out for a different reason — computed pricing (§19).

### 22.2 The stock rule: any quantity, and the shelf sets the date

**Rewritten 17 Sep 2026, hours after it was first built.** The original rule
was the owner's: stock was a hard cap, anything under 100 g read as out of
stock, and every card printed the grams held. They replaced it the same day:

> *"one thing to fix is for seats we don't have to show how much we hold in our
> inventory in the customer facing UI we should let them allow to order how much
> ever they want but the delivery logic changes if the ordered amount is less
> than the amount that we are holding we will deliver on the next day if they
> are ordering beyond our capacity then we will order it in the vendor website
> and deliver to the customer within 10 days."*

("seats" is a dictation slip for "seeds".)

**Stock stopped being a limit and became a speed.** The reason the change is
sound is that seed is a shelf-stable commodity with a supplier: you cannot
re-order a tray of greens that takes fourteen days to grow, but you can buy
another kilo of mustard seed. So nothing is refused; what moves is the date.

| Ordered | Source | Promise |
|---|---|---|
| ≤ grams held | our shelf | **next day** |
| > grams held | the vendor | **within 10 days** |

One module still owns it, `src/lib/seeds/stock.ts`:

- `SEED_MIN_ORDER_GRAMS = 100` — unchanged, and still the cart's unit (§18.6),
  so "at least one unit" already enforces it. `stock.test.ts` asserts the two
  constants are equal, so a future 250 g minimum fails a test instead of
  shipping a control that lies.
- `SEED_VENDOR_LEAD_DAYS = 10` — the owner's figure, and it is a **worst case
  stated as a promise**, not an estimate. A seed order that arrives early costs
  nobody anything.
- `seedSourcing(orderedGrams, stockGrams)` → `"shelf" | "vendor"`. **Equal
  amounts count as the shelf**: ordering exactly the 200 g we hold is a
  next-day order, because the seed is there.
- `seedReadyDate(sourcing)` — tomorrow, or the lead time, day-granular in IST.
- `shelfPacks(grams)` / `shelfGrams(grams)` — **operator-facing only**, for the
  admin table's derived column. Never a customer-facing ceiling.

**The defensive reads are asymmetric on purpose.** A nonsense `stockGrams`
resolves to `"vendor"`, a slower promise the business can always beat;
`"shelf"` on a seed we do not have is a next-day delivery that cannot happen.

#### What the customer sees, and what they do not

**The grams held appear on no customer-facing page.** Removed from the grid
card, the detail facts, the buy box and the cart line. It is an internal figure
that moves every time a sack is opened, and printing it both published
inventory and implied a ceiling that no longer exists.

| Surface | Before | Now |
|---|---|---|
| `/seeds` card | `₹340/100 g · 200 g in stock`, or `Out of stock` | `₹340/100 g` |
| detail facts | `On the shelf 200 g` + `Minimum order 100 g` | `Minimum order 100 g` + the undated dispatch policy |
| buy box | stepper capped at stock; sold-out panel at zero | stepper to 20; **a dated line per quantity** |
| cart line | `In stock`, or a terracotta over-stock flag | `From our shelf · Fri 18 Sept` or `Ordered in for you · by Sun 27 Sept` |
| `/admin/seeds` | `Sells as 2 packs` / `Out of stock` | `Next day: 2 packs` / `All bought in` |

**The dated line in the buy box is computed per quantity**, one pre-formatted
string for each of the twenty the stepper can reach, because the answer changes
with the amount: the same seed is next-day at 100 g and a vendor order at
900 g. Stepping past the shelf changes the promise *in front of the customer,
before they commit*, rather than surprising them at checkout.

The undated fact beside it — "Next day from our shelf", with "order more than
we hold and we bring the rest in for you" underneath — is the policy, identical
for every seed and every reader. The dated version is the one that knows the
quantity.

**Accepted leak:** a determined reader can infer roughly what we hold by
stepping the quantity until the date flips. That is the price of an accurate
delivery promise, and an accurate promise is worth more than a hidden number
(§5.3 makes the delivery date the site's most important expectation-setting).

#### Consequences

**"Sold out" no longer exists for a seed**, anywhere. A seed at 0 g keeps its
page, its price and its stepper; every order for it simply goes on the vendor
run. The admin column therefore says "All bought in" in plain stone, not "Out
of stock" in terracotta — colouring it as a fault would send the owner looking
for a problem that is not there while the site happily takes orders.

**Nothing is refused any more, so the three-layer cap is gone.** `sellable()`
in the cart actions no longer reads stock at all; `hydrateCart` reads it only
to pick a date. What survives is the per-line cap of **20 packs (2 kg)**, which
is a wholesale threshold rather than an inventory one and applies to greens
identically (`MAX_UNITS_PER_LINE`). The over-stock flag, the `soldOut` and
`stockShort` error codes and the sold-out panel were all deleted.

**A seed line no longer splits.** Order 500 g of something we hold 200 g of and
all 500 g arrive together on the vendor's date — the same "one order, one trip,
slowest line" rule §18.6 applies to a mixed grow-day cart, now shared by both
kinds through `latestDate`.

**A seed-only cart finally has a delivery date.** It used to have none, because
§7 had set no dispatch rule for ad-hoc seed. It has one now, which closed that
gap; a delivery *charge* for seed is still unset (§7).

**Still a promise, not a reservation.** Two customers can both be told "next
day" for the same 200 g, because nothing decrements stock until something takes
payment (§9). The stakes are lower than they were under the cap — the second
order is late rather than impossible — but checkout should still decrement
under a `ConditionExpression` so the second customer is told the vendor date
rather than the shelf one. §15's "two concurrent orders cannot oversell the
same stock" becomes "cannot both be promised next day".

### 22.3 `/admin/seeds` replaced `/admin/products`

The generic screen is **deleted**, with its actions and its nav entry. It was
one pipe-delimited textarea — `SEED-RAD-100 | pack=100g | 120 | 2500` — serving
racks, trays, seeds and snacks at once, every string hardcoded in English, and
the one category with real stock had to express it as a variant attribute.
Nothing was lost: the table held zero product rows.

`/admin/seeds` owns **two numbers and a toggle**, like `/admin/varieties`:

- **Price per 100 g** and **grams held**, editable in the row.
- A derived **"Next day"** column — whole packs, live as you type. It used to
  read "Sells as" and flip to a red "Out of stock" below 100 g; both were
  rewritten when §22.2 made stock a speed rather than a limit. An empty shelf
  now reads **"All bought in"** in plain stone, because colouring it like a
  fault would tell the owner a seed is unsellable while the site is still
  taking orders for it.
- Zero grams is a **legitimate value**, not an empty field. An empty field is
  refused — the bug that once put every rack on sort order 0.
- **A field error in a row is now printed, not just outlined** (17 Sep 2026).
  `NumberField`'s compact variant returns a bare input so the row stays aligned
  with its header, which meant a refused figure showed a red border and
  `aria-invalid` and no sentence. Both this table and `/admin/trays` render the
  message at row level.
- A seed with no content file is flagged in red with the exact path and stays
  off the site, exactly as a variety is.

**Stock is set, never adjusted.** The field takes what the owner just weighed,
not "+500 g received". A running total is only as good as every receipt and
every order ever recorded; a count is right the moment it is typed and wrong
only until it is re-counted.

The admin overview's Products card became a Seeds card. Racks are still not
counted there: three ranges of ~100 published models would be the loudest
number on the page and the least actionable.

### 22.4 One more content template, on the shared engine

`content/seeds/<key>.json`, with its own contract
(`src/lib/content/seed-contract.ts`) over the shared checker
(`content-contract.ts`, extracted from the variety contract on 17 Sep 2026).
The loader is shared too — `src/lib/content/source.ts`, which is
`varieties.ts`'s folder reading, field-by-field English fallback, per-request
cache and image URLs, parameterised by folder.

Fields, and why they differ from a variety's:

| Variety | Seed | Why |
|---|---|---|
| `flavourNotes` | — | a seed is not tasted before it is sown |
| `growingTips` | `sowing` | for a seed this is the main event, not an aside |
| `nutrition` | `specs` | same two-column table: germination, treatment, soak, sow rate, harvest window |
| `nutritionNote` | `specsNote` | same honesty about how firm those figures are |
| `benefits` | `uses` | what the seed is *for*, not what a nutrient does in the body |

Two structural differences, both deliberate:

- **`images` is optional.** The packet photography does not exist, and the
  detail page falls back to the Sprout mark. A contract that failed on it would
  block the copy being written — the wrong order of work.
- **A day count is allowed in the prose.** The variety ban exists because
  `growDays` lives in DynamoDB and copy would contradict it (§4.3). A seed has
  no such field, and "uncover on day two" is the advice a grower wants.

**Seed keys and variety keys are separate namespaces.**
`content/seeds/radish.json` and `content/varieties/radish.json` are two
different things to buy. `keys.test.ts` pins that they land on different
DynamoDB partitions and different GSI1 partitions despite sharing a content
key.

### 22.5 `/seeds` and `/seeds/[key]`, not `/shop/seeds`

Its own route, exactly as microgreens has one, because each seed carries a page
of its own copy rather than being an interchangeable SKU in a grid.
`/shop/seeds` **redirects** to `/seeds`, so a guessed URL and any old link
still work, and `CATEGORY_HREF` in `src/lib/shop.ts` is the one place that
mapping lives — the home tiles, the /shop index, the category strip and the
footer all read it.

**The detail page is the variety page.** `@/components/catalogue/DetailPage`
was extracted from `/microgreens/[key]` and now renders both, with the gallery
and the tile extracted alongside it
(`components/catalogue/{Gallery,Tile,AddToCart}.tsx`). The layout decisions in
it were each made against a real complaint — the tasting note moved out of the
buy column to fill the hole beside it, the list column gained a header so its
first line aligns with the table's first row, the price moved into the buy box
because two copies of one number on one screen is where they start disagreeing
(§18.10) — and none of that was worth discovering twice. The page passes
already-translated labels and a buy-box slot; it resolves no messages itself,
so a variety's "What is in it" and a seed's "What you are buying" stay in their
own namespaces.

**No seed page can be sold out** since §22.2 was rewritten. An empty shelf
changes the date in the buy box, not the availability, so the page keeps its
copy, its price and a working stepper. The sold-out panel that used to render
at `max < 1` is deleted along with the branch that chose it — nothing in the
catalogue is now listed-but-unbuyable, because a withdrawn item 404s instead.

### 22.6 The cart learned about kinds

A cart line is now **kind plus content key plus units**, wire format
`v:broccoli:3|s:radish:2`. Keying on the content key alone would merge `radish`
the green and `radish` the seed into one line and quote one of the two prices
for both.

> **A third kind followed the same day**, when trays became buyable: `t:` for a
> tray or a drainage mat (§23.7). That is also where "a unit is 100 g" stopped
> being true of every line, which had wider consequences than the extra letter.

A **two-part chunk is read as a variety**, which is every cookie written before
17 Sep 2026 — cheaper than a migration nobody can run, since the cookies are on
other people's machines. It can go once no live cookie predates the change;
they expire 30 days after their last write.

What the cart page shows per kind, since §22.2 gave seed a dispatch rule:
a green gets "Ready: Sat 26 Sept", a seed gets "From our shelf · Fri 18 Sept"
or "Ordered in for you · by Sun 27 Sept". **Every line has a date and so does
every cart**, including a seeds-only one, which used to quote none. A cart
holding both says that seed travels on the same delivery (§7), and a cart whose
date is being set by a vendor order says so rather than leaving ten days
unexplained.

### 22.7 The shelf was loaded from the owner's supplier list

On 17 Sep 2026 the owner supplied `Microgreen_Seed_Price_List_50g.pdf` —
eighteen varieties with a price per **50 g pack** — and said *"this is what I
have … each I have 200 gms"*. That is the whole shelf, and it is now in
DynamoDB with copy for every one of the eighteen.

**The list is per 50 g and the column is per 100 g, so every figure was
doubled.** `Seed.pricePer100g` is what the site sells by, because the minimum
order is 100 g (§22.2), and a 100 g pack is two 50 g packs — linear, not a
discount tier. The arithmetic lives in `scripts/seeds-fill.mjs` and is pinned
by `src/lib/seeds/script-parity.test.ts`.

| Seed | Key | List ₹/50 g | ₹/100 g |
|---|---|---|---|
| Spinach | `spinach` | 15 | 30 |
| Mustard | `mustard` | 20 | 40 |
| Sunflower | `sunflower` | 30 | 60 |
| Radish Pink | `radish` | 40 | 80 |
| Pak Choi | `pak-choi` | 45 | 90 |
| Alfalfa | `alfalfa` | 60 | 120 |
| Dill | `dill` | 60 | 120 |
| Beet Root Red | `beetroot` | 75 | 150 |
| Onion Red | `red-onion` | 75 | 150 |
| Red Amaranthus | `red-amaranthus` | 75 | 150 |
| Rocket Cultivated | `rocket` | 90 | 180 |
| Swisschard | `swiss-chard` | 105 | 210 |
| Kale | `kale` | 115 | 230 |
| Garden Cress | `garden-cress` | 120 | 240 |
| Basil Green | `basil` | 160 | 320 |
| Cabbage | `cabbage` | 170 | 340 |
| Broccoli | `broccoli` | 175 | 350 |
| Cabbage Red | `red-cabbage` | 270 | 540 |

**The unresolved question is whether that list is a sell price or a cost.** It
has been loaded as the sell price, which is the reading of *"this is what I
have"* that needs no assumption about margin. If it turns out to be what the
seed was bought for, the fix is one command —
`node --env-file=.env.local scripts/seeds-fill.mjs --markup=<percent>` — which
is why the flag exists instead of eighteen hand edits on the admin screen.

**Supplier word order is not URL order.** "Cabbage Red" is keyed
`red-cabbage`, because the key is the URL segment and the display name is
"Cabbage (red)". That made the grid's sort visible: `listSeeds` returns GSI1
key order, so the shelf ran …Radish, Red Amaranthus, Cabbage, Onion, Rocket…
`/seeds` now sorts on the **displayed name** with a locale-aware collator,
because the name lives in the content file and the repository does not read it.

**Two cultivar claims were softened to match the list.** The supplier says
"Radish Pink", so the content no longer names China Rose specifically. The
sunflower file still says "black oil", which is what microgreen sunflower seed
is in practice — confirm it against the supplier's own description.

**200 g of each is a thin shelf under a 100 g minimum: every seed sells as
exactly two packs.** That is correct behaviour, not a bug, but it is worth
knowing that the shelf is one two-pack order per seed away from sold out.

### 22.8 Open

- **Whether the supplier list is a sell price or a cost is unconfirmed** — see
  §22.7. Loaded as the sell price; one flag re-runs it at any markup.
- **Stock is 200 g of each**, as reported on 17 Sep 2026. Under §22.2 that is
  no longer a ceiling — it is the line between a next-day order and a ten-day
  one, so at 200 g a customer ordering three packs of anything is quoted the
  vendor date. Re-count and re-enter on `/admin/seeds` as it moves.
- **The vendor lead time is one constant for every seed.** Ten days is the
  owner's figure and it is applied uniformly, but eighteen seeds do not all
  come from one supplier at one speed. If they diverge it belongs per seed
  (a `vendorLeadDays` on the row), not as a worse single average.
- **Nothing tells the owner a vendor order is needed.** The customer is
  promised ten days and the admin row still just shows grams; there is no
  "to order" list, because there are no orders yet (§9). When checkout lands,
  a paid line whose quantity exceeded stock is the trigger for a purchase —
  that is the operational half of §22.2 and it is unbuilt.
- **No photography, now across eighteen seeds.** `public/seeds/<key>/` is
  empty, so every seed page and card renders the Sprout fallback. The card
  treatment with the tilt and the marquee needs a transparent cut-out
  (§17.4).
- **The spec figures are ours to stand behind.** Germination, treatment, soak,
  sow rate, blackout and harvest window in all eighteen content files are the
  honest general figures for those seeds, not a lab report on a specific lot.
  This seed is bought in and resold, so the supplier's own lot figures should
  replace them as they arrive.
- **Snacks still have no admin screen.** They had one only in the sense that the
  generic form could write them; nothing did. Trays got theirs the same day
  (§23); snacks need one when they are actually sold.

---

## 23. Trays & drainage — bought in, never held

Built 17 Sep 2026, on the owner's instruction:

> *"Next final product that I would like to have admin UI is for trays and drainage cells …
> even these are ordered based on the request this would take minimum of seven days to deliver.
> Can you add this three products into the trays and drainage cell category? And add same price
> that is shown on the website … the drainage cell length and width is 50 centimeter L / 25 cm W"*

Fourth purpose-built catalogue kind, after varieties, plans and seeds. Three items, from two
suppliers, at the suppliers' own listed prices.

### 23.1 One record shape for two different objects

A drain cell mat is not a tray. It is in the same entity anyway, because what the record models is
**not the object — it is the way the object is sold**, and on that the three items are identical:

| | Seed (§22) | Tray & drainage (§23) |
|---|---|---|
| Held in stock | yes, in grams | **never** — the supplier holds it |
| Fast path | next day off our shelf | **none** |
| Every order is | maybe a purchase order | **always** a purchase order |
| Sold by | weight, any quantity | the pack, at a fixed price |
| Delivery promise | next day, else 10 days | a per-item lead time, floor **7 days** |

The absence of a fast path is the whole difference. A seed's stock figure decides *which* of two
promises a customer gets; a tray has one promise and the only question is how long it is.

So there is no `kind` discriminator on the row. A field nothing branches on is a field that drifts,
and the category is labelled **"Trays & drainage"** — the owner's own words — so the label carries
the honesty instead.

**Two rows, not one row with two variants.** The two tray kits are exactly the virgin-vs-recycled
pair §3.0.1 anticipated, and they are still two rows: the owner asked for three products, the
prices differ by ₹110, and with no detail page there is nowhere for a variant selector to live.
Two cards side by side is what a buyer can actually compare.

**The record holds two numbers and a toggle:**

```ts
type Tray = {
  id: string          // UUID, never derived from the key
  contentKey: string  // names content/trays/<key>.json
  price: number       // ₹ for the whole pack, not per piece
  leadDays: number    // 7..14, per item — see below
  active: boolean
}
```

**`leadDays` is per row, not a constant**, and that is the one place this chapter deliberately
diverges from §22. Seven days is the owner's floor and all three launch items sit on it — but they
already come from two suppliers, so a single global figure would be an average pretending to be a
promise. §22.8 still lists exactly that as an open problem for eighteen seeds on one hard-coded ten
days; here the divergence was visible on day one, so it went on the row.

The bounds live in `src/lib/trays/lead-time.ts` and nowhere else:

- **Floor 7**, the owner's figure. A shorter figure is **refused, not rounded up** — an operator
  typing 3 means something the business cannot do, and quietly correcting it hides the
  disagreement.
- **Ceiling 14**, which is not a business rule at all: it is `MAX_LEAD_DAYS` from
  `delivery-date.ts`, imported rather than restated. That module *clamps* to 14 as a last defence
  against a bad constant printing a nonsense date, so accepting 30 on the admin screen would mean
  an operator seeing 30 and a customer seeing a date 14 days out. The form refuses it instead. If a
  supplier genuinely needs longer, both numbers move together.
- `trayReadyDate` falls back to the **ceiling** for an unreadable figure, never the floor — the
  same asymmetry as `seedSourcing`. A date the business can beat is recoverable; one it cannot meet
  is a broken promise.

### 23.2 The thinnest content template in the repo

`content/trays/<key>.json`, with its own contract (`tray-contract.ts`) on the shared checker, and
the shared loader (`content/source.ts`) parameterised by folder. Four fields:

| Field | What it is |
|---|---|
| `name` | Short form. Two tray kits differ only by their plastic, so the name has to tell them apart |
| `shortDescription` | **One line of judgement** — who should buy this one rather than the other |
| `specs` | At least four rows: pack contents, size, thickness, material |
| `imageAlt` | Optional; falls back to the name |

What it drops from the seed template, and why:

| Seed | Tray | Why |
|---|---|---|
| `description` | — | the detail page is four facts, a gallery and a buy box (§23.3) |
| `sowing` | — | you do not sow a tray |
| `specsNote` | — | a seed's germination is a lot-by-lot fact worth qualifying; a tray's 60 × 30 cm is 60 × 30 cm |
| `uses`, `cautions`, `faq` | — | a card cannot carry them, and an unread field is worse than an absent one |

A variety has five FAQs because a person decides what to eat by reading. A tray is decided by four
facts and one sentence, and demanding a seed-shaped file for a sheet of moulded plastic gets met
with padding.

**Never write the price or the lead time into copy.** Both are printed from DynamoDB and both get
tuned, so copy that restates either makes the card contradict itself — the same rule as the
`growDays` ban on variety copy. `tray-contract.test.ts` enforces it as a scan for a rupee figure or
a day count in either language, because this one is about *values* appearing in prose rather than a
field existing.

What *does* belong in the file is the supplier's own figures, which **do not change**: a 3 mm wall
is 3 mm forever. That is why they get a git diff rather than an admin field, and it is also why the
admin form stayed at two numbers instead of growing eight.

### 23.3 `/shop/trays/[key]` — the detail page, after one reversal

The first version of this chapter argued this page should not exist: a tray is
four facts and a price, so a detail page would be a spec table and nothing else.
The owner reversed it within the hour:

> *"We need to build details page for Trays & drainage, very minimal to display
> images, price, add to cart and dimension and quality and material."*

The original reasoning was right about the **content** and wrong about what a
page is *for*. Two things it missed:

1. **Photographs need somewhere to live.** A grid card holds one square. A tray
   with its drain hole, the same pair stacked, and a mat interlocked with its
   neighbour are three pictures that sell the object, and there was nowhere to
   put the second and the third.
2. **Add to cart needs a page.** Three cards cannot carry three steppers and
   three live totals without becoming a form, and somebody deciding between
   ₹160 and ₹270 wants the specs and the price in one eyeful.

**"Very minimal" is honoured literally.** `DetailPage` makes everything except
the gallery, the title, the facts and the buy box optional, and this page passes
nothing else — no long description, no FAQ, no cautions, no two-column band. The
four spec rows from the content file *become* the facts, laid out two by two,
which is the dimension, the grade and the material the owner asked for.

The spec table is deliberately **not** rendered underneath as well. On a seed
page the facts and the table say different things; here they would be the same
four rows twice.

**The card/page split:** the card carries the facts, so three items stay
comparable at a glance; the page carries the photographs and the buy box. The
price appears only in the buy box — two copies of one number on one screen is
where they start disagreeing (§18.10).

**The dated promise does not move with the quantity**, and that is the one place
this page differs from a seed's. `AddToCart` takes `dispatch` as one line per
reachable quantity because a seed's promise changes as the stepper passes what
is on the shelf (§22.2). Five packs and one pack are the same single order to
the same supplier, so every entry is identical — filled anyway rather than
adding a "one string" variant to the component, because a customer stepping to
twenty should see the date *not* move.

### 23.4 `/admin/trays`

Two numbers and a toggle per row, plus an add-by-key form — the `/admin/seeds` shape with the stock
field replaced by lead days. Differences worth knowing:

- **No search box.** Eighteen seeds earn a filter; three items do not, and this is a small range of
  equipment rather than a catalogue.
- **No stock column**, because there is no stock. The question the screen answers is what a pack
  costs and how long it takes, and the second is the one an item can be wrong about in a way a
  customer notices.
- **A derived "What we promise" cell**, live as you type: `Ordered in, within 7 days`. Next to a
  field reading 7 that looks redundant and is not — the field is a number an operator types, the
  cell is the sentence a customer will read. Out of range it renders **nothing** rather than a
  wrong promise, since the save will be refused anyway.
- **Delete keeps the content file.** The row goes, `content/trays/<key>.json` stays on disk, so the
  item can be added back at any time.
- An item can be priced before its content file exists; the row is flagged in red with the exact
  path and the public page skips it.

There is **no out-of-stock state to fall into**, so the active toggle is the only way something
leaves the shelf. Verified: hiding an item drops it from the grid and the `/shop` count, and
unhiding restores it.

### 23.5 `/shop/trays` — the grid

**Its own static route**, which wins over `/shop/[category]` without a redirect, leaving that page
to serve racks and snacks off `ProductEntity` untouched. The reason is the data, not the layout:
trays left `Product` for their own entity and content files, so there is nothing for the generic
page to read, and branching inside it would have put two catalogues in one component to save a
file.

It is still a **grid** rather than a described catalogue like `/seeds`, but every card links to
`/shop/trays/[key]` (§23.3). The facts live on the card so the range is comparable in one glance;
the photographs and the buy box live on the page.

**Every card prints a real date**, computed per item from its own `leadDays` —
"Ordered in for you — with you by Thu 24 Sept" — rather than "ordered on request". Same reasoning
that put the dated promise in the seed buy box (§22.2): the one thing a buyer needs that the price
does not tell them is *when*. That makes the page dynamic, which it is anyway, and a cached date
would go stale overnight in the worst possible way — by a day, silently.

**Cards are sorted on the displayed name**, not the content key, with a locale-aware collator.
`listTrays` returns GSI1 key order and the name lives in the content file the repository does not
read, so key order is whatever the keys happen to spell — the same fix `/seeds` needed (§22.7),
applied here before it could be noticed.

**The cards link but do not buy.** Photograph, name and price are one anchor — a buyer aims at the
picture — while the spec list stays outside it, because wrapping a `dl` in an anchor turns
drag-to-select into drag-to-navigate.

**The panel is 3:2, not the square every other grid uses**, and that is an asset decision rather
than a layout one. The detail page's gallery frame is 3:2, so a square master would letterbox there
while a 3:2 master would be cropped at the sides here — one photograph could not have served both.
Matching them means one file per shot. It also suits the subject: everything in this category is a
wide flat object, and a square frame around a 60 × 30 cm tray is mostly margin.

**The cards run the §17.4 motion** as of 17 Sep 2026, when the photography arrived (§23.8). On
hover the cut-out scales out 10% and tilts 4° while the spec *labels* — "In the pack", "Size",
"Thickness", "Material" — scroll up behind it, exactly as a variety tile scrolls its nutrients.
Labels, never values, for the reason given in §17.4.

This grid is **not** the shared `Tile` component, though it shares the marquee. `Tile` is a square
carrying a name and one line of meta; a tray card carries a price, four spec rows and a dated
promise under the picture. Only the panel is common, and it is shared as `Marquee`.

### 23.6 The three items, at the suppliers' listed prices

Loaded by `scripts/trays-fill.mjs`, which is the one place the list is written down, tied to the
content folder by `src/lib/trays/script-parity.test.ts`.

| Item | Key | ₹ | Pack | Size | Supplier |
|---|---|---|---|---|---|
| Microgreen trays — pair | `tray-pair` | 160 | 2 trays, 1 drained + 1 solid | 60 × 30 × 3 cm, 3 mm | bazodo.com/product/683 |
| Microgreen trays — pair, food grade | `tray-pair-food-grade` | 270 | 2 trays, white drained + green solid | 60 × 30 × 3 cm, 3 mm | bazodo.com/product/691 |
| Drainage cell mats — pack of five | `drain-cell-mat` | 300 | 5 mats | 50 × 25 cm each, 20 mm | pasumaithottakalai.com |

**The drainage mat's dimensions came from the owner, not the page.** The listing gives the
thickness and the material and no length or width; the owner supplied *"50 centimeter L / 25 cm
W"*. The price is the pack-of-five variant, ₹300 against a ₹500 MRP.

**Whether these are sell prices or costs is unconfirmed** — the same open question as the seed price
list (§22.7). They are loaded as sell prices, which is the reading of *"add same price that is shown
on the website"* that needs no assumption about margin. If they are costs, the fix is one command:
`node --env-file=.env.local scripts/trays-fill.mjs --markup=<percent>`.

A re-run keeps each row's `id`, `active` flag **and lead days**, and rewrites only the price. A lead
time the owner has corrected by hand is better information than the figure the file launched with.

### 23.7 The cart learned a third kind

Adding the buy box meant the cart had to hold a tray, which is the change with
the widest blast radius in this chapter. Wire format is now
`v:broccoli:3|s:radish:2|t:tray-pair:1` (§22.6 for why a line carries a kind at
all), and `keys.test.ts` plus `cart.test.ts` pin that one content key can name
three different things to buy without merging.

**What a "unit" is stopped being universal.** A variety unit and a seed unit are
both 100 g; a tray unit is one pack, of two trays or five mats. Three
consequences, each of which was a latent wrong number:

| Was | Now | Why it mattered |
|---|---|---|
| `CartItem.pricePer100g` | `CartItem.unitPrice` | The field held ₹160 for a pack of two trays. A name like that is what gets multiplied by a weight two screens away |
| `CartItem.grams: number` | `grams: number \| null` | 0 g reads as "we weighed it and it came to nothing"; null forces the page to branch instead of printing "1 pack · 0 g" |
| `cartGrams = unitCount × 100` | sums the **weighed kinds only** | A cart holding one tray pack reported 100 g of nothing |

`isWeighed(kind)` in `cart.ts` is the single home for that distinction, declared
as a set rather than `kind !== "tray"` so a fourth kind has to make the decision
rather than inherit the wrong default.

**The delivery-date switch became a discriminated union.** With two kinds a
`heldGrams: number | null` on the internal `Base` type was readable; at three it
would have been two nullable numbers whose valid combinations existed only in a
comment. `Timing` is now
`{ by: "grow" } | { by: "shelf" } | { by: "supplier" }`, so the switch in
`hydrateCart` is exhaustive and a fourth kind is a compile error. It also keeps
the grams we hold off `CartItem`, which is the §22.2 instruction.

**Three per-line wordings, because the reason differs:** a green gets
"Ready: Mon 28 Sept", a seed "From our shelf · Fri 18 Sept" or "Ordered in for
you · by Sun 27 Sept", a tray "Ordered in for you · by Thu 24 Sept". The
stepper's own labels follow the kind too — "one less pack" rather than "one less
100 g" — which is wrong only to a screen reader, and therefore exactly the kind
of error that survives.

**Two copy bugs surfaced by the first real mixed basket**, both older than this
change:

- `readyTrayNote` said a tray "takes the longest". A cart with a ten-day green
  and a seven-day tray proved that false immediately. The note's job is to
  explain the wait, not to rank the lines — `readySplit` above it already says
  the order waits for the slowest thing.
- `unavailableBody` said "One **variety** in your cart is no longer on sale".
  It had been wrong for seeds since §22.6 and was plainly wrong for a tray. The
  cart cannot name the kind there anyway: an unresolvable line is a bare key,
  which is precisely why it could not be resolved. It now says "item".

**Nothing gained a stock test.** A tray has no stock (§23.1) and a seed's
stopped being a limit (§22.2), so `sellable()` is the same two questions for all
three kinds: is the row active, and does it have a content file.

### 23.8 The photography

Three shots, supplied by the owner on 17 Sep 2026 and the first photography any category other than
microgreens has had. Prompts and shot notes are in `docs/TRAY_PROMPT.md`; the assets live in
`public/trays/<key>/`.

**They arrived as transparent 3:2 cut-outs**, which is what made the §17.4 treatment possible here
at all — the drain holes are holes in the alpha channel, so the panel colour shows through them.
Each master is processed twice by `scripts/cutout.py`, because a card and a gallery want different
files:

| File | Built as | For |
|---|---|---|
| `cutout.webp` | 900 × 600, transparent WebP q85, subject at **88%** of the width | the card, where the panel and the marquee have to show through |
| `hero.jpg` | 1500 × 1000, JPEG q82, flattened onto `--color-sand`, subject at **92%** | the gallery, whose frame is `object-contain` over that same `#f2ebe3` |

Baking the ground into the hero rather than reusing the transparent file is deliberate: it costs a
fraction of the bytes of a WebP carrying alpha, letterboxes invisibly, and does not care what the
frame is restyled to later.

**88% and 92% are two numbers because only one of the two surfaces moves.** The card scales the
media 1.1 and rotates it 4° and then clips, so the subject's padding is what keeps its corners off
the edge — measured on the 419 × 279 card at 1440px, the tray is 354px wide at rest and 402px
hovered, leaving 8px each side. The gallery never moves, so the only thing 92% has to satisfy is
that the three shots match each other.

`scripts/cutout.py` was generalised from the square variety job to take `--aspect`, `--fill`,
`--width` and `--bg`. The defaults reproduce the variety assets byte for byte, which is checked
against the original algorithm rather than assumed.

**One CSS change came out of this, and it is a real fix rather than a tidy-up.** The marquee loops
by translating its block -50%, which only reads as continuous while one half of the block is taller
than the panel. The line count was tuned for a square tile and the type size was set in `vw`, so
the two stopped scaling together the moment the grid dropped to one column: measured at a 700px
viewport, the card was 652 × 435 and half the marquee 182px — a 252px band of bare panel crossing
the card once per cycle. `.mcard` is now a query container and the tray marquee sizes its type in
`cqw`, which fixes the ratio at 1.20 by construction at every width and stops the scroll speed
changing with the viewport. The variety and bundle cards are untouched.

### 23.9 Open

- ~~Trays are not in the cart.~~ **Closed 17 Sep 2026** — see §23.7.
- **Nothing tells the owner to place the supplier order.** Identical to the seed gap in §22.8 and
  worse here, because *every* tray order needs a purchase order rather than only the ones that
  exceed stock. It needs checkout (§9) to have a trigger at all.
- **The tray delivery rate is still unset** (§7). The ⟨⟩ in that section predates these rows; a
  pack of five 50 × 25 cm mats is closer to a rack than to a bag of seed.
- **Seven days is a floor, not a measured figure.** It is what the owner will promise. Neither
  supplier page confirms it — Pasumai Thottakalai states "5 to 7 working days" shipping, Bazodo
  states nothing — so the first real order is the first evidence.
- ~~No photography, across all three.~~ **Closed 17 Sep 2026** — see §23.8. What is still open is
  that each item has **one** shot. The gallery's thumbnail strip and the `images.gallery` array
  both exist and are unused, so a second angle is a file and a line of JSON.
- **The two tray kits may want to be one card with a choice.** They are the same object in two
  plastics, and a buyer comparing them is reading two cards that differ in one row of the spec
  table. Revisit if a detail page is ever built (§3.0.1).
- **Machine-written Kannada**, like the rest of the content layer. The spec rows are short and
  factual, which is the easiest kind to get right and the easiest kind to get subtly wrong.
