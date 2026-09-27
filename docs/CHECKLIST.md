# Fewgrams — build checklist

Audited 27 Sep 2026 against the code (not the spec alone). `[x]` built and wired to real
data; `[~]` partly built (gap noted); `[ ]` not built; `[-]` decided against or deferred on
purpose. Tick items here as they land.

**Built 27 Sep 2026, after the audit:** admin order cancel + mark refunded, subscription
skip / pause / resume / cancel, `/admin/customers`, courier booking from the order page,
customer tracking links; footer "Our story" and the staff route removed.

Tests at audit time: **701 passed, 0 failed, 0 skipped** (47 files, pure logic — nothing
runs against DynamoDB Local or a gateway sandbox). `tsc --noEmit` clean. `npm run lint`
fails on 2 errors in the git-ignored `.playwright-mcp/` folder; `eslint src` is clean.

---

## 🚨 Launch blockers

- [-] **Email transport** — deferred to the AWS production setup (owner, 27 Sep 2026).
      Until then `src/auth.ts:86-117` throws in production, so magic-link sign-in only works
      once it is wired; Google login is unaffected. (SPEC §11)
- [-] **Order confirmation email** — with the email transport.
- [x] **Cancel a paid order from admin** (paid / picked / ready), stock put back; customer
      sees "Cancelled". Refund made in the Razorpay dashboard, then "Mark refunded".
- [x] **Subscription cancel, pause, resume, skip** — `/admin/subscriptions/[id]`.
- [x] **Broken links:** footer "Our story" removed (it duplicated "How we grow"); staff
      sign-ins go to `/account`, `/staff` dropped from the proxy.
- [ ] **Branded 404 / error pages** — no `not-found.tsx`, `error.tsx`, `global-error.tsx`.
- [ ] **Hosting.** No CDK stacks, no Amplify config, no `.github/` CI. Tables come from
      `scripts/create-tables.mjs` with **no PITR / deletion protection** on the orders table.
      Amplify support for `next@16.3.5` unverified (SPEC §16).
- [ ] **FSSAI registration** — `src/lib/brand.ts:52` is `fssai: null`.
- [-] **`/shop/snacks`** — stays a placeholder until snacks are built (owner, 27 Sep 2026).

---

## Customer-facing

### Browse
- [x] Home (hero, PIN check, bundles, Why microgreens, trust band)
- [x] `/microgreens` + `/microgreens/[key]` with quick add
- [x] `/seeds` + `/seeds/[key]`, sold-out under 50 g
- [x] `/shop`, `/shop/trays` (+ detail), `/shop/grow-media` (+ detail)
- [x] `/shop/racks` + `/shop/racks/[range]` (steel, angle, pipe)
- [x] `/how-we-grow` storybook
- [x] `/faq`, `/terms`, `/privacy`, `/refund-policy`, `/shipping-policy`
- [~] `/contact` — mailto / tel / WhatsApp links only, no form (deliberate)
- [x] Kannada on every customer page, parity-tested
- [ ] Product search (probably not needed at this catalogue size)

### Cart & checkout
- [x] Cookie cart, all five kinds (variety, seed, tray, rack, media)
- [x] Checkout: address step, delivery-area split for greens, live courier options per parcel
- [x] Payment via Razorpay / Cashfree, return route + webhooks → `settleOrder`
- [x] Cart cleared only once paid; greens outside the area kept in cart
- [~] Failed payment — order page shows pending / expired with a link back to the cart;
      no "retry payment" on the same order
- [ ] Coupons / discounts (SPEC §10)

### After purchase
- [x] Order page `/account/orders/[id]` as the confirmation / receipt screen
- [x] Sequential receipt number
- [x] Tracking — number plus a link to the courier's tracking page
- [ ] Receipt / invoice download (PDF)
- [-] Customer "cancel my order" — they ask on WhatsApp / email; admin cancels
- [-] Emails: confirmed, shipped, delivered — with the email transport

### Subscriptions
- [x] `/subscribe` → pay → `settleSubscription`
- [x] `/account/subscriptions` — plan, Saturdays, state, and paused / cancelled / skipped notes
- [-] Customer self-serve skip / pause / cancel — admin does it on request
- [ ] Renew button at term end
- [ ] Renewal reminder — **promised in copy** (`plans.json` `termNote`) with nothing behind it;
      needs the email transport

### Account & auth
- [~] Login — Google works; magic link waits on the email transport
- [x] Profile
- [x] Address book (save, delete, default, PIN lookup)
- [x] Order history

### SEO & housekeeping
- [x] `generateMetadata` + hreflang on every page
- [ ] `sitemap.ts`, `robots.ts`
- [ ] OpenGraph / Twitter image and tags
- [ ] JSON-LD (Organization, Product)
- [ ] Analytics (then a consent banner, if it sets cookies)
- [ ] Remove Next boilerplate SVGs from `public/` (`file`, `globe`, `next`, `vercel`, `window`)
- [ ] Replace `Sprout` placeholder art (`src/components/ui/Sprout.tsx:8`)

---

## Admin panel

### Access
- [x] Every admin page behind `requireRole("admin")` in the layout
- [x] Every admin server action (~70) starts with `assertRole("admin")`
- [x] Customer list / detail (`/admin/customers`) — search, orders, spend, plans, addresses
- [-] Role management — later, when there is a need (owner, 27 Sep 2026)

### Catalogue (all done, DynamoDB-backed, missing-content-file flags)
- [x] Varieties
- [x] Plans (numbers + rotation multi-select)
- [x] Seeds (price, grams held)
- [x] Trays & drainage, Grow media (price, packs held)
- [x] Racks, angle racks, pipe racks (rates, plates, models, footprints, vendor pickup)
- [~] Stock — overwrite only, no adjustment history

### Orders
- [x] Board: paid → picked → ready → out for delivery → delivered / failed
- [x] Order detail: lines, per-shipment quote, address, phone, payment attempts
- [x] Tracking number typed in by hand
- [x] Cancel + mark refunded (refund itself in the gateway dashboard)
- [x] Book courier shipment + pickup via API (Delhivery, Ekart, Shiprocket) once ready for
      delivery — behind `COURIER_BOOKING=on`; each pickup must be registered on every courier
      under its admin → delivery name. **Not yet tried against a live courier.**
- [~] Shipping label — Shiprocket's label link is saved on booking; Delhivery and Ekart labels
      are printed from their dashboards
- [ ] Packing slip print view
- [ ] Search and date / customer filters
- [ ] Internal notes on an order
- [x] `tel:` / `mailto:` links on order, subscription and customer pages
- [ ] Flag for amount-mismatch payments (currently only `console.error`)

### Subscriptions & growing
- [x] Tray / sowing plan for the next four Saturdays (grams, trays, seed, sow-by, late flag)
- [x] Rotation calendar; active / pending / expired lists
- [-] Sowing plan counts subscriptions only — **by design**: one-off greens are sown the day
      they are ordered, labelled with the order number, and cut when ready
- [x] Pause / resume / skip / cancel on the customer's behalf
- [ ] Harvest & packing list per delivery date (who gets what on Saturday)
- [ ] Per-delivery status (scheduled / skipped / packed / delivered) — deliveries are stored
      as `{date, week}` only

### Dashboard & settings
- [~] `/admin` — five catalogue counts only. Worth adding just: orders to pack today,
      next Saturday's box count, stock warnings. (No reporting beyond that.)
- [~] `/admin/settings` — product-type show/hide only
- [x] `/admin/delivery` — pickup origins, green-run fee, packing grams
- [ ] Delivery area editing — hardcoded to Bengaluru Urban in `src/lib/pincode/area.ts`
      (fine unless it changes often)

### Staff
- [-] `/staff/run/[date]` — dropped for now; the role stays in the table for later, a staff
      sign-in lands on `/account`

---

## Backend & operations

- [x] Webhook signatures verified (HMAC, `timingSafeEqual`)
- [x] `settleOrder` idempotent (conditional `markOrderPaid`)
- [~] Razorpay webhooks all refused if `RAZORPAY_WEBHOOK_SECRET` is unset — LOCAL_DEV calls it
      optional; make it required in production
- [ ] Sweep for abandoned `pending_payment` orders (TTL or scheduled job)
- [ ] Scheduled jobs at all (renewal reminder, sweep) — no cron / EventBridge
- [ ] Error monitoring (Sentry or similar) — `console.*` only
- [ ] Security headers / CSP in `next.config.ts`
- [ ] Rate limit on magic-link requests
- [ ] `.env.example`; secrets manager for production keys
- [ ] CI: typecheck + tests + lint on push (add a `typecheck` script; exclude
      `.playwright-mcp/` from ESLint)
- [ ] Node 22+ (running on 20; Node 20 EOL and AWS SDK drops it Jan 2027)

---

## Owner decisions still open (SPEC §16)

- [ ] FSSAI registration
- [ ] Cashfree fee: is GST charged on top of 1.95%?
- [ ] Retail vs grow seed stock — assumption never confirmed
- [ ] Trademark search
- [ ] Ad-hoc vs subscription price gap
- [ ] "How we grow" final artwork
- [ ] Supplier purchase order for trays (stock is counted; no PO generated)
