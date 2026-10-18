# GST features — test plan

Built 17–18 Oct 2026, uncommitted. Design: `docs/SPEC.md` §26. Work through the sections in order;
tick each check, and report back by ID ("C1 fails: …").

## 0. Setup

1. `npm run db:local` in one terminal, `npm run dev` in another (port 3005).
2. **Admin:** open `/login`, enter the admin email; the sign-in link prints in the `npm run dev`
   terminal.
3. **Customer:** a second, non-admin email, in a private window. Give it two saved addresses: one in
   Karnataka (PIN 560xxx) and one outside it (e.g. Kerala, PIN 682001).
4. **Payments:** Razorpay is in test mode locally. Pay with Razorpay's test UPI ID
   `success@razorpay`, or a test card from Razorpay's docs. No real money moves.

**Already in your local database from my run** (all placed by a dummy user, so they don't appear in
your customer's account; admin can open them):

| What | IDs |
|---|---|
| Orders | `FGJYNEYDRHH7` (Karnataka, business GSTIN), `FG43SSK3MPTD` (Kerala, refunded, credit note `CN/2627/00001`), `FG2RJ9S2MN8H` (Puducherry) |
| Subscription | `FS115W0FP54N` |
| Vendors | The five real ones from `scripts/vendors-fill.mjs` (18 Oct 2026). The test vendors and their bills were deleted the same day |
| GST | October GSTR-2B upload, payment `CPIN26100000001` |

Your new invoices will continue the series from `FG/2627/00005`.

---

## A. Terms page

- [x] **A1** `/terms` → "Who we are" shows `GSTIN: 29HTUPS6000Q1ZI`; "Prices and payment" says we
  are registered and prices include any GST that applies. Repeat on `/kn/terms`: both in Kannada.

## B. Cart and checkout (customer)

- [x] **B1** Add trays, cocopeat and a microgreen to the cart. `/cart` total shows "Inclusive of all
  taxes" (and in Kannada on `/kn/cart`).
- [x] **B2** `/checkout`, choose the **Karnataka** address. Under the total: "Inclusive of all taxes"
  and a small "Buying for a business? Add GSTIN" link. Click it → GSTIN and business-name fields
  open. "Remove" closes them and clears both.
- [x] **B3** Open the business fields, type GSTIN `29AABCT1332L1ZB` (wrong check digit) and a name,
  press Pay → no payment screen; under the GSTIN, in red, "That GSTIN doesn't check out…" (no
  browser bubble). **The typed GSTIN and name stay in the fields.** Pay with the box open and empty →
  "Enter the 15-character GSTIN, or press Remove."; empty name → "Add the business name…".
- [x] **B4** Correct it to `29AABCT1332L1ZA`, pay with the test UPI. You land on the order page:
  "Invoice FG/2627/000NN" and a **Download invoice** button.
- [x] **B5** Place a second order to the **Kerala** address with trays only, no business GSTIN. Pay.
- [x] **B6** Place a third order with **microgreens only** (Karnataka). Pay.

## C. Invoices

Open each invoice with **Download invoice** on the customer's order page: the print dialog opens
straight away on the invoice (no page in between), and Save as PDF names the file "Fewgrams invoice
FG-2627-000NN".

- [x] **C1 (B4's order)** Title "Tax invoice", subtitle "Invoice-cum-bill of supply". Check:
  - seller block: Fewgrams, proprietor, address, GSTIN;
  - buyer block: recipient, business name and GSTIN, address, "Place of supply: Karnataka (state
    code 29)";
  - item rows: HSN (0709 greens, 3926 trays, 53050040 cocopeat), quantity, taxable value, rate
    ("Exempt" for greens), **CGST and SGST** columns;
  - **one** Delivery line: rate "Mixed" when the parcel carried goods at several rates, and the
    note "Delivery is charged at the GST rate of the goods it carries, shared by their value.";
  - totals: taxable value + CGST + SGST = **total paid**, to the paisa, equal to what you paid.
- [x] **C2 (B5's order)** Tax invoice with a single **IGST** column, "Place of supply: Kerala (state
  code 32)", no business line.
- [x] **C3 (B6's order)** Titled **"Bill of supply"**, no subtitle, "Bill number" / "Bill date";
  columns Item, HSN, Quantity, Amount only (no rate or tax); just "Total paid"; notes only the
  exemption and "computer-generated". PDF named "Fewgrams bill of supply FG-2627-…".
- [x] **C4** If any order had seeds: the notes include "Seeds are supplied for sowing only."
- [x] **C5** The print preview shows **only the invoice**, starting at the top of the page (no site
  header, menu, order details or buttons, and no blank pages after it). Save one as PDF and open
  it. Cancel the dialog → the order page is unchanged, and Ctrl+P on it prints the order page
  itself.
- [x] **C6** Same from `/kn/account/orders/…`: button and labels in Kannada, figures identical.
- [x] **C7** There is no invoice page: `/account/orders/<id>/invoice` is a **404** for everyone.
  Sign in as a third customer and open `/account/orders/<B4's id>`: **404** — so they cannot reach
  its invoice either.
- [x] **C8** Admin → Orders → open B4's order: header shows the invoice number; "GST included ₹… ·
  place of supply Karnataka (29) · Business buyer …"; **Print invoice** on the action row opens the
  print dialog on the invoice, nothing else.

## D. Credit notes

- [x] **D1** Admin → B5's order → Cancel (confirm) → Mark refunded (confirm). The admin order page
  now has **Print credit note** beside **Print invoice**.
- [x] **D2** The credit note: titled "Credit note", number `CN/2627/000NN`, "Against invoice
  FG/2627/… of <date>", the same rows and total, "Total refunded", note "The order was cancelled
  and the full amount refunded."
- [x] **D3** Customer's view of B5's order: "Refunded", with **Download credit note** beside the
  refund policy link (opens the print dialog on the credit note). "Download invoice" is still there
  and prints the invoice, not the credit note.

## E. Subscriptions

- [x] **E1** As the customer, `/subscribe`, take a plan, pay. `/account/subscriptions` → **Download
  invoice** → print dialog: "Bill of supply" (no tax columns), HSN 0709, "N boxes a week", total =
  what you paid.
- [x] **E2** Admin → Subscriptions → that subscription → **Print invoice** prints the same bill of
  supply.

## F. Vendors (admin → Finance → Vendors)

- [x] **F1** Add "Test Vendor KA", registered, GSTIN `29AABCT1332L1ZB` → refused ("doesn't check
  out"); **name and GSTIN stay typed**. Fix to `29AABCT1332L1ZA` → "Vendor added", form clears; the
  list shows "GSTIN … · Karnataka".
- [x] **F2** Add one "Not registered" and one "Outside India" vendor: no GSTIN field shows for
  either.
- [x] **F3** Edit a vendor, untick "Offered on new bills", save → shows "Inactive" and disappears
  from the vendor picker on a new bill.
- [x] **F4** "Delete" shows only on vendors with no bills.
- [x] **F5 Vendor pickers** Admin → Seeds: each row shows "Seed Delivery LLP" (AllThatGrows) under
  its name; Trays: tray pairs → Bazodo, drain mats → Pasumai; Grow media → Mourian; Shelf and
  Angle racks → "Bought from: Goodluck"; Pipe racks → Pipes and Connectors both "Add vendor". Open a
  picker, tick a second vendor, Save → both names show; untick → back. "+ New vendor" in the picker
  opens the vendor form; Cancel returns to the list.
- [x] **F6 Bill offers only the vendor's items** Purchases → New bill → no vendor yet: the "Stock to
  sell" line says "Choose the vendor first" and its item list is empty. Vendor Bazodo → only the two
  tray pairs and "+ New product…"; there is no switch to show other items. A vendor with no products
  ticked shows "isn't set to supply any product yet".

## G. Purchases (admin → Finance → Purchases)

Before G1: none of the real vendors is in Karnataka, so add "Test Vendor KA" again (registered,
`29AABCT1332L1ZA`) and tick it in the vendor picker of **Microgreen trays — pair** on admin → Trays
& drainage (a bill offers only the vendor's own items). Note that tray's stock and cost.

- [x] **G1** Enter a bill: your KA vendor, a bill number, today's date.
  - Line 1: "Stock to sell" → that tray item, quantity 10, value 1000, 18%. The grey CGST/SGST
    placeholders read 90.00 / 90.00; the description fills itself.
  - Line 2: "Courier", value 500 → its credit switches to "Shared" by itself.
  - Totals: ₹1,500.00 / ₹270.00 / ₹1,770.00.
  - Attach a PDF. Save → back on the list, status "Waiting for vendor".
- [x] **G2** The tray's stock went up by **10**, and its cost is now **₹118.00** (₹1,180 ÷ 10 —
  the courier line is not shipping on the bill, so it is not shared in), with "Bill <number>" under
  it linking to the bill; the sell price followed with the row's own margin.
- [x] **G3** Open the bill: the file link opens your PDF. Change quantity 10 → 8, save → stock is
  now +8.
- [x] **G4** Type CGST `900` on a line → refused, "more than a rupee away". Type `90.40` → accepted.
- [x] **G5** A bill from **Bazodo Enterprises** (Tamil Nadu) shows a single **IGST** field (180.00 on
  ₹1,000 at 18%).
- [x] **G6** A bill from the "Outside India" vendor: note shows we pay the GST; saved, its status is
  **Reverse charge**, "in October 2026".
- [x] **G7** A bill from **Pasumai Thottakalai** (not registered): rate shows "No GST"; status **No
  GST to claim**.
- [x] **G8** Attach a file over 3 MB → "The file is over 3 MB…". A `.txt` → "must be a PDF, JPEG,
  PNG or WebP". Entries kept in both cases.
- [x] **G9** Filters: Bill month and Standing pills narrow the list; totals row follows.
- [x] **G10** On a waiting bill → "Claim by hand" → choose October → Save claim → status
  "Claimed · in October 2026". Only open months are offered.
- [x] **G11** Delete a stock bill → stock comes back down by its quantity, and the cost goes back
  to what it was before, labelled "From before bills".

**Costs from bills, new products, stocktake, sowing** (built 18 Oct 2026, SPEC §26.6.1–2):

- [x] **G12 Shipping is shared in** New bill, vendor Seed Delivery LLP: line 1 radish 500 g, ₹250,
  0% (exempt); line 2 "Shipping on this bill", ₹100 at 18%. The shipping line's credit reads
  **None** by itself; radish's line says "Sets its cost to ₹73.60 per 100 g" (₹250 + ₹118 over
  500 g). Change radish's rate to 18% → shipping's credit follows to **Full**; set it back.
- [x] **G13 + New product** On a stock line, item list → "+ New product…" → kind Seed, key `radish`
  → refused ("already exists"); key `test-fenugreek` → added, picked on the line, description
  filled. Save the bill (with a quantity and value). Admin → Seeds: `test-fenugreek` is there,
  **hidden**, costed from the bill, flagged for its content file, with Seed Delivery LLP as its
  vendor.
- [x] **G14 Seeds screen** No add form, no cost input. Radish shows the bill's cost and "Bill
  <number>"; the others "From before bills". Mustard ₹25 → ₹50, spinach ₹15 → ₹30, sunflower ₹35 →
  ₹70, radish (before the bill) ₹50 → ₹90.
- [x] **G15 Stocktake** The pencil beside a count → type `abc` → "Type the grams you counted"; type
  a real count → saved, the packs column follows. Same on Trays and Grow media (whole packs only).
- [x] **G16 Sowing takes seed** Admin → Sowing log: sow 40 g of radish → radish's grams drop by 40.
  Sow more mustard than is held → saved, with a red note to count it; mustard shows 0. Edit that
  sowing down to 25 g → mustard comes back to what it held less 25 g. Delete it → all of it back.
- [x] **G17** Delete the G12/G13 bill → radish back to "From before bills" at its old cost;
  `test-fenugreek` back to unpriced and hidden. Delete `test-fenugreek` on the seeds screen, and
  correct radish's count by stocktake.

## H. GST returns (admin → Finance → GST returns)

- [x] **H1** Quarter pill "Oct–Dec 2026". Due strip: PMT-06 Oct (25 Nov), PMT-06 Nov (25 Dec),
  GSTR-1 (13 Jan), GSTR-3B (22 Jan).
- [x] **H2 Summary** October shows your invoices and credit notes; sales by category add up to
  "Sales (GST included)" (net of the refunded order); taxable + exempt + GST = sales.
- [x] **H3 Monthly payments** October card: tax on sales so far, credit available, cash needed, to
  pay. Try "Record" with no amount → "Enter the amount paid…" and **the CPIN stays typed**. Then
  record the "To pay" amount → the card's "Still to pay" drops to ₹0.00; the payment is listed and
  can be deleted (confirm).
- [x] **H4 GSTR-1**
  - B4's order in table 4 (B2B), split 18% / 5%;
  - B5's order netted out of table 7 by its credit note;
  - greens and plans in table 8;
  - table 12 rows per HSN with sensible quantities;
  - table 13 invoice and credit-note ranges.

  Each "CSV" downloads.
- [ ] **H5 Offline Tool (real check)** Install the GST Offline Tool from the portal, create a GSTR-1
  for Oct–Dec, and **Import CSV** for b2cs, exemp, hsn and docs. Report any section it refuses, with
  its message.
- [x] **H6 GSTR-3B**
  - 3.1(a) equals GSTR-1's taxable sales and tax;
  - 3.1(d) shows the foreign bill;
  - 4A(5) is the claimed bills' GST;
  - the "How 4B(1) was worked out" line gives the exempt share;
  - 6.1 shows IGST credit spent before CGST/SGST credit.
- [x] **H7 Credit match** Upload `.playwright-mcp/gstr2b-102026.json`.
  - G11 deleted the G1 bill, so first enter a fresh one from Test Vendor KA (G1's shape).
  - Then edit the file so one invoice uses Test Vendor KA's GSTIN and that bill number, with spaces instead
    of slashes, and its taxable/CGST/SGST match your bill.
  - After upload: your bill is "Claimed this quarter".
  - The other invoice is under "On the portal, not in your register".
  - A file for another GSTIN → "That GSTR-2B is for …".
- [x] **H8 Mismatch** Edit a matched bill's value by ₹100 and re-upload the same file → it moves to
  "Reported differently".
- [x] **H9 Unplaced state** GSTR-1 lists `FG2RJ9S2MN8H` only if its state was never set. Open it from
  there, pick a state → the GSTR-1 warning clears.
- [x] **H10 Filing**
  - The checklist reflects H7–H9.
  - Mark GSTR-1 filed (date + any ARN), then GSTR-3B.
  - "Filed — closed" appears.
  - A bill claimed in October opens read-only with the locked note.
  - Payments show no Delete.
  - The 2B upload is replaced by the locked note.
  - Undo GSTR-3B (confirm) → everything reopens.

## I. After the first real month

- [ ] **I1** After 14 Nov: download October's **real** GSTR-2B JSON from the portal and upload it
  (H7 with the real file). Report if it says "isn't a GSTR-2B".
- [ ] **I2** Compare the PMT-06 figure with the portal's own before paying by 25 Nov.

## Progress and changes (18 Oct 2026)

**Passed:** A1, B1–B6, C1–C8, D1–D3, E1, E2, F1–F6, G1–G17 (G run by Claude in the browser, every
step checked against the database). H1–H4, H6–H10 (run by Claude in the browser, figures recomputed
from the raw orders and bills). **Next:** H5 (the owner, Offline Tool), then I. D1's stock-back check
(one more drain mat and cocopeat block after the cancel) was not confirmed by the owner.

**Changed while testing** (all uncommitted, all verified in the browser, tests/types/lint green):
- Checkout: the "Ready …" line headers are gone (one flat list); the order card grows instead of
  scrolling, pinned by its bottom when taller than the window (`PinnedColumn`).
- Checkout GSTIN: our own inline errors (missing / wrong check digit / no name), no browser bubble;
  Pay is blocked client-side, the action still checks.
- Invoice: one **Delivery** line (rate "Mixed" + a note when several rates); figures never wrap;
  number block stays right when it wraps; a **bill of supply** (greens only) drops tax columns,
  tax totals and the GST/reverse-charge notes, and says "Bill number/date".
- **No invoice pages.** "Download invoice / credit note" (customer) and "Print invoice / credit
  note" (admin) open the print dialog on a hidden sheet (`PrintDoc`, `components/tax/docs.ts`);
  the PDF is named after the number. Old `/invoice` and `/credit-note` URLs 404.
- Admin: order and subscription actions on one row; menu regrouped into Sales / Growing / Shop
  products / Finance / Settings, folding, bold top level, sand submenu panel.
- Finance forms: `noValidate`, our own errors only. New GST files run through Prettier.
- Vendors: product-side **vendor pickers** (per seed/tray/medium row; one each on shelf and angle
  racks; Pipes + Connectors on pipe racks), stored as `Vendor.supplies`; bills offer the chosen
  vendor's items. Real vendors in `scripts/vendors-fill.mjs`; test vendors and their bills deleted.
- **Costs come from bills** (G12–G17): the latest bill sets a seed's, tray's or cocopeat's cost,
  GST and shared shipping included; product screens show it read-only with the bill link; products
  are added from a bill ("+ New product…"); counts move by themselves with a stocktake pencil; a
  sowing takes its seed off the shelf. Opening seed costs from the AllThatGrows invoice (mustard
  ₹25, spinach ₹15, sunflower ₹35, radish ₹50) are in the local DB; the live DB needs
  `scripts/seeds-fill.mjs` after deploy.
- Bill form: "Paid on" may be before the bill date (an advance: paid at checkout, invoiced on
  dispatch). A line with no GST (unregistered vendor, or 0%) shows no tax box and no credit
  choice, and saves its credit as None; an unregistered vendor's bill drops the tax footnote.
- Bill form: a stock line offers **only** the vendor's own items. The "Also offer items … isn't
  set to supply" switch is gone, and saving refuses another item (`itemNotSupplied`); "+ New
  product…" needs a vendor.
- **Found running G (18 Oct 2026), all fixed and re-checked in the browser:**
  - **Dropdowns reverted after a save.** React 19 resets a form after its server action and puts back
    text boxes but not dropdowns: a refused bill showed "Choose a vendor" and "Stock to sell" while
    the form still held the real choices, so the next save sent the wrong ones; a saved claim showed
    "Not claimed", so pressing Save again withdrew it. Bill, vendor, claim, GST payment and sowing
    forms now submit through `keepFields` (`src/lib/keep-fields.ts`), and the claim dropdown is
    controlled. Then, on the owner's "fix it", the three rack add forms (all fields controlled,
    back to defaults after an add) and the vendor-pickup panel too — a refused duplicate rack kept
    3 ft / 1.5 × 3; a pickup saved as "none" kept showing "none".
  - **Reverse-charge bill total** read ₹1,180 for a ₹1,000 bill; it now reads ₹1,000 with "GST we
    pay ourselves (reverse charge)" under it. Reverse-charge bills no longer show a 180-day "pay by"
    date (`owesPayBy`; s. 16(2) second proviso).
  - **Deleting a product left it on its vendors' lists**, so a new product with the same key would
    come back linked; `forgetSupply` now takes it off.
  - **A product on a bill could be deleted**, leaving that bill unopenable. Its row now shows "On N
    bills" in place of Delete (the owner's call), and the delete action refuses it.
  - **Same-day sowings listed oldest first**, though the save says the new one is at the top; the log
    now sorts by entry time within a day.
  - Wording: vendor-picker hint ("Only their purchase bills offer it"), bill and sowing delete boxes
    say the cost / seed goes back, product delete boxes no longer mention a lead time, and the
    no-cost note fits a deleted bill.
- **Found running H (18 Oct 2026), all fixed and re-checked:**
  - **A mismatched bill stayed claimed** at ₹288 against the portal's ₹270 (H8 failed). A claim from
    GSTR-2B is now withdrawn when an edit or re-upload leaves the bill disagreeing
    (`claimAfterMatch`); a claim made by hand stays.
  - **A bill entered after its month's GSTR-2B upload** stayed "Waiting for the vendor" until the
    next upload, while the match table counted it matched. Saving an unclaimed bill now matches it
    against the statements on file — also how a corrected mismatch is claimed again.
  - **Editing a saved bill's value kept the old GST** (the boxes open filled), so the total was
    wrong and the save was refused "more than a rupee away". Changing a value or rate now works the
    line's GST out again.
  - **Foreign vendor credit was in GSTR-3B 4A(3)**; it is an import of services, now 4A(2).
  - **Checkout accepted our own GSTIN** as a business buyer's (the portal rejects that GSTR-1);
    refused now, in the field and in the action, en + kn.
  - **Clean-up after H:** the G/H bills, test vendors, test payment `CPIN26100000001`, the test
    October GSTR-2B upload and the empty filing row are gone; stock and costs are back to their
    starting figures. **The test orders stay** for H5 (the CSVs are built from them) — remove after.
- **State after G:** the G5 (Bazodo, claimed by hand), G6 (foreign, reverse charge) and G7 (Pasumai)
  bills and Test Vendor KA / Foreign / Unreg are kept for H; tray pair, radish, mustard and the 1 kg
  block are back to their starting counts and costs.

## Not covered

- Courier booking with the GSTIN (booking is switched off locally).
- Invoice emails, partial refunds, the GSTR-1 JSON, and the annual Rule 42 recalculation: none of
  these are built.
