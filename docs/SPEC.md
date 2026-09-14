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
| Infrastructure as code | **AWS CDK** for DynamoDB, S3, SES and IAM — see §2.2 |
| Region | `ap-south-1` (Mumbai) |
| Database | DynamoDB, **single-table design** (§4) |
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
tables to its own schema conventions, which would fight the hand-designed single-table model in §4,
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
| **Microgreens** | Subscription only. Weekly delivery, min 1 month, prepaid | **No stock.** Variety catalogue carrying yield + grow-day metadata |
| **Seeds** | One-off, buy anytime | **Real stock in grams.** Orders blocked above stock on hand |
| **Racks** | One-off, buy anytime | **None** — outsourced, assumed always available |
| **Trays** | One-off, buy anytime. **Variants:** virgin plastic / PP plastic | **None** — same as racks, assumed always available |
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

## 4. Data model — DynamoDB single table

One table `fewgrams`, keys `PK` / `SK`, with two GSIs.

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| User profile | `USER#<id>` | `PROFILE` | `EMAIL#<email>` | `USER` |
| Address | `USER#<id>` | `ADDR#<addrId>` | — | — |
| Variety | `VARIETY#<id>` | `META` | `VARIETY` | `<slug>` |
| Product (seed/rack/value-add) | `PRODUCT#<id>` | `META` | `CAT#<category>` | `<slug>` |
| Plan definition | `PLAN#<planId>` | `META` | — | — |
| Plan rotation week | `PLAN#<planId>` | `WEEK#<1..4>` | — | — |
| Subscription | `SUB#<subId>` | `META` | `USER#<userId>` | `SUB#<createdAt>` |
| Subscription week | `SUB#<subId>` | `WEEK#<deliveryDate>` | `DELIVERY#<date>` | `SUB#<subId>` |
| Order (one-off) | `ORDER#<orderId>` | `META` | `DELIVERY#<date>` | `ORDER#<orderId>` |
| Order item | `ORDER#<orderId>` | `ITEM#<n>` | — | — |
| Weekly cycle | `CYCLE#<deliveryDate>` | `META` | — | — |
| Sow plan line | `SOWPLAN#<sowDate>` | `VARIETY#<id>` | — | — |
| Coupon | `COUPON#<code>` | `META` | — | — |
| Coupon redemption | `COUPON#<code>` | `REDEEM#<userId>` | — | — |
| Payment | `PAYMENT#<id>` | `META` | `ORDER#<orderId>` | `PAYMENT#<id>` |
| PIN code | `PIN#<pincode>` | `META` | — | — |
| Settings | `CONFIG` | `SETTINGS` | — | — |

**GSI2** (`GSI2PK` = `STATUS#<status>`, `GSI2SK` = `<createdAt>`) serves admin list screens filtered
by order or subscription status.

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

**`name` deliberately stays in DynamoDB and is not repeated here.** It is needed in admin lists,
cart lines, sow plans and order snapshots, so it needs exactly one home. Content files carry
editorial copy only.

Order and subscription line items **snapshot the name and price at purchase time** rather than
referencing the live record, so later renames or price changes never alter historical orders.

**Cost to accept:** one entity spans two stores and can drift. Add a **build-time check that every
`active` variety and product slug in DynamoDB has a key in the matching `*.en.json` file**, failing
the build if not. Missing `kn` keys are a warning, not a failure — they fall back to English.

### 4.4 Localisation

English is the default; Kannada is the second locale. `next-intl` with locale-prefixed routes.

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

---

## 5. Subscription model

### 5.1 The three plan types

| Plan | Contents decided by | Pricing |
|---|---|---|
| **Essential** | Owner (curated) | **Flat monthly price** |
| **Exotic** | Owner (curated) — premium varieties *plus* the Essential basics | **Flat monthly price** |
| **Build Your Own** | Customer picks varieties and quantities | **Computed by weight** — sum of `pricePer100g × quantity` |

Flat pricing on the curated packs is deliberate: it lets the owner substitute varieties week to
week without the customer's price moving.

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
- PIN check is available on the home page, not just at checkout — no one should reach payment
  before discovering you don't deliver to them.
- Delivery charging via `ShippingRateProvider`:
  - **v1, rules-based:** subscription price *includes* delivery, but the amount is computed and
    itemised at payment; racks a flat **₹500**; seeds calculated at payment; ⟨trays — rate rule
    still to be set; they are bulky like racks but lighter⟩.
  - **v2, dynamic:** adapter for a courier partner quoting from the full address.
- Everything consolidates onto the **same Saturday run**.

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

### 8.1 Authentication

- Auth.js (NextAuth) with the DynamoDB adapter. **Google SSO + email/password.** Zero recurring cost.
- Guest checkout auto-provisions a passwordless account from the delivery details; the claim email
  lets them set a password and see their order.
- **AWS Cognito magic link** to be explored during the build as an alternative — not a blocker.
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
| `/` | Hero, PIN serviceability check, category tiles, how-it-works strip, plan teaser, testimonials |
| `/subscribe` | The three plans compared side by side |
| `/subscribe/essential`, `/subscribe/exotic` | What arrives in each of the 4 rotation weeks, price, first-delivery date |
| `/subscribe/build` | **BYO builder** — variety picker with quantities, live price, grow-group segregation, week-by-week schedule preview |
| `/microgreens` | Variety library (informational — greens are not individually buyable) |
| `/microgreens/[slug]` | Variety detail: flavour, nutrition, grow days, linked recipes |
| `/shop` | Seeds, racks, trays, value-added items |
| `/shop/[slug]` | Product detail with variant selector (e.g. tray material); seeds show available grams |
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
`/admin/plans` (curate the Essential/Exotic rotation weeks) · `/admin/products` (seeds with gram
stock, racks, trays with variants, value-add) · `/admin/cycles` (list, lock a cycle) · `/admin/sow-plan/[sowDate]` (the
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
2. **Catalogue (admin first)** — `/admin/varieties` and `/admin/products` with yield, grow days,
   seed gram stock and tray variants, plus the variety content-file loader and its build-time
   completeness check. Nothing downstream can be built or tested without real variety data.
3. **Public catalogue** — home, `/microgreens`, `/shop` and their detail pages. PIN checker.
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
- **Tray delivery rate not set.** Racks are a flat ₹500; trays are bulky but lighter, so they need
  their own rule in the `ShippingRateProvider`.
- **Trays carry no stock count**, so an order can be accepted that the supplier cannot fill by
  Saturday. Acceptable for now; the manual out-of-stock toggle is the cheap fix if it bites.
- **Kannada content coverage** is a standing cost, not a one-off task. Every new variety or recipe
  needs a second content file or it silently falls back to English.
- Brand name and logo should come from **one config file** so the visual identity can change
  cheaply.
