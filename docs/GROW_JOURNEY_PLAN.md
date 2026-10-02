# Grow-along journey — build plan

Written 1 Oct 2026, at the end of the session that built the interactive tray.

> **Status, later on 1 Oct 2026: built.** Slice 1 *and* steps 3–9 are in —
> `/garden` "Play garden", the badge, the home section at the bottom. What was
> built, and the rules it follows, is **SPEC §25**; this file stays as the
> plan and the list of ideas not yet done (§7 below). Owner decisions taken:
> route `/garden` "Play garden"; badge hidden on cart and checkout; the
> sanitiser is genuinely food grade, so the bottle and copy say so.

---

## 1. The idea (the owner, 1 Oct 2026)

A playful, step-by-step page where a visitor grows a virtual tray of microgreens
from scratch, and meets each product we sell at the moment they would need it:

> touch a grown tray → pick a tray → clean it → soak the coco peat → fill → sow
> → blackout → light & water → harvest

It is reached three ways:

1. **A floating badge**, bottom-right, on every customer page, always visible.
   It is an unusual button, so it gets noticed, and it reaches the garden
   without scrolling.
2. **The interactive tray section on the home page**, moved to the **bottom**
   of the page so it no longer pushes the main content down. It carries a
   clear button into the journey.
3. Links between the journey and `/how-we-grow` (see §6).

Each step has its own call to action. **Step 1** has two buttons: *order these
microgreens* (→ `/microgreens`) and the big one, **"Want more fun? Let's build
a virtual microgreen tray — we'll take you through the journey"**, which starts
step 2.

---

## 2. What exists today (uncommitted at the time of writing)

Run `git status` first. These are the files from this feature, **not yet
committed**. Commit them before starting Slice 1 so the new work has a clean
diff:

| File | What it is |
|---|---|
| `src/components/home/TrayPlay.tsx` | Home section: heading + body + panel (server component) |
| `src/components/home/TrayPlayStage.tsx` | Client: still image (`<picture>`, wide/narrow), lazy-loads the scene, fades the canvas in, pointer/touch hint |
| `src/components/home/tray-play/field.ts` | Spring field: a grid of damped springs (the physics) |
| `src/components/home/tray-play/field.test.ts` | 6 tests: swipe, overshoot, settle, fast > slow, hover parts, clamp |
| `src/components/home/tray-play/scene.ts` | three.js scene: moulded black tray pairs, instanced stems + cupped leaves, shaders, pointer, loop |
| `public/brand/tray-play.webp`, `tray-play-narrow.webp` | Stills captured from the scene (2608×1120, 1344×1010) |
| `messages/{en,kn}/home.json` → `trayPlay` | heading, body, hintPointer, hintTouch, alt |
| `src/app/[locale]/page.tsx` | `<TrayPlay />` currently between `<Process />` and `<WhyMicrogreens />` |
| `package.json` | `three` + `@types/three` added |

Other modified files in `git status` (`shop/page.tsx`, `globals.css`,
`CategoryMedia.tsx`, `OtherProducts.tsx`, `MarqueeCard.tsx`, `public/shop/*-photo.webp`)
were **already modified before this feature**. They are not part of it; ask the
owner before committing them alongside.

### How the tray works (so it can be reused)

- **Physics** (`field.ts`): 112×48 cells of 2D "bend" with spring + damping +
  neighbour coupling, stepped at 1/120 s. `brush()` is the hand: drags stems
  along the motion (∝ speed²) and gently parts them under a resting cursor.
  Tuned calm on purpose: `DAMPING_RATIO 0.32`, `DRAG 3.2`, `COUPLING 25`.
- **Rendering** (`scene.ts`): one `InstancedBufferGeometry` per tray (stem tube +
  two cupped leaves), bent in the vertex shader by sampling the field texture.
  Per-variety knobs: colours, `height`, `stemWidth`, leaf `shape`/size/`notch`/
  `cup`/`arch`/`open`, `density`, and `flex` / `sway` / `bounce` (sunflower is the
  lively one: 1.35 / 2 / 0.22; the others 1 / 1 / 0).
- **Trays**: `trayGeometry()` sweeps a moulded cross-section (flared wall, rolled
  lip) round a rounded rectangle; `trayPair()` nests the grow tray in a water
  tray. Black satin plastic, lit by a `RoomEnvironment`. **Size and camera
  angle were chosen by the owner — do not change them** (the real 2:1, 3 cm
  shape was tried and reverted).
- **Owner decisions already made**: seed hulls removed (they read as beetles);
  radish 0.58 and sunflower 0.68 tall; density 470 / 290 / 160; tray 3 stems thin.
- **Fallbacks**: the still image is the server render; the canvas appears only with
  JS + WebGL + `prefers-reduced-motion: no-preference`; three.js is fetched only
  when the panel is within a screen of the viewport, and the loop pauses
  off-screen and in hidden tabs.

### Retaking the stills (needed whenever the scene changes)

Playwright, `deviceScaleFactor: 2`, scroll the canvas into view, wait 4 s, hide
the hint `<p>`, screenshot the canvas element at `scale: 'device'`:

- wide: viewport **1440×900** → canvas 1304×559 → 2608×1120
- narrow: viewport **768×1024** → canvas 672×504 → 1344×1010

Then `cwebp -q 82 in.png -o public/brand/tray-play{,-narrow}.webp`, and make
sure `WIDE` / `NARROW` sizes in `TrayPlayStage.tsx` match the files. Do this
for any new journey stills too.

---

## 3. Slice 1 — build next session

Goal: the entry points and step 1, plus step 2 (pick a tray). Ship it, then
judge whether people use it before building steps 3–9.

### 3.1 Move the home section to the bottom

- In `src/app/[locale]/page.tsx`, move `<TrayPlay />` to **after `<TopSeeds />`,
  before `<TrustTags />`** (the trust band stays the closing note). Update the
  section list in that file's doc comment.
- Update **SPEC §18.3** (home page section order): add the row and the reason
  (moved to the bottom on 1 Oct 2026 so it does not add scroll before the main
  content).
- Add the journey button to the section (see 3.3 for its wording).

### 3.2 Floating badge — every customer page

- New `src/components/chrome/GardenBadge.tsx`, rendered from the locale layout,
  so it is on every customer page.
- **Not** in the admin subtree (`/admin/*`), and **not** on the garden page itself
  (it would link to where you are).
- **Open question for the owner:** the owner asked for "always", but on cart and
  checkout it can distract from paying. Confirm before showing it there.
- Bottom-right, `fixed`, `env(safe-area-inset-bottom)` padding. Check it does
  not cover anything else fixed. Today the fixed elements are in `PinnedColumn`,
  `Marquee`, `ScatterMarquee`, `Bundles`, `HeroCarousel`, `LeafBackdrop`,
  `KindIcon` and `StoryFace`; there is no WhatsApp float yet.
- Looks deliberately playful (a small sprouting tray / seedling mark) but follows
  house rules: an icon in a circle is `bg-forest text-cream`; hover colour +
  `transition-colors`; no `cursor-pointer` class (base rule covers it);
  `:focus-visible` ring from `globals.css`.
- A gentle attention motion (an occasional sway), off under reduced motion.
- Accessible name from messages; `Link` from `@/i18n/navigation` (keeps `/kn`).

### 3.3 The journey page

- **Route:** owner to confirm. Suggestion: `/grow` ("Grow with us"). Alternative:
  `/garden` ("Play garden"). Add `localeAlternates`, metadata, and the page to
  SPEC §12 (page inventory) plus a new SPEC section (e.g. §25).
- **New message file** `messages/{en,kn}/grow.json` (one file per area, the
  project rule), registered wherever namespaces are listed, and added to the
  table in `CLAUDE.md`. Kannada required for every key (the parity test fails
  otherwise).
- **Step state lives in the URL** (`/grow?step=pick` or `/grow/[step]`) so the
  browser back button works and a step can be linked; progress dots; **Back**
  and **Skip** on every step. A remembered step in `localStorage` is a nice
  touch only (wrap it in try/catch).
- **Step 1 — Touch the greens.** Full-width version of the existing tray scene
  with a short instruction ("Move your cursor across the trays" / "Swipe
  sideways…", already in `home.trayPlay`, move or duplicate into `grow`). Two
  buttons:
  - secondary: **Order these microgreens** → `/microgreens`
  - primary: **Want more fun? Let's build a virtual microgreen tray** → step 2
- **Step 2 — Pick your tray.** Show the pairs we sell (`content/trays/tray-pair`
  = black, `tray-pair-food-grade` = green grow tray on a white water tray), read
  from `listTrays` + `trayNameMap` like the shop does, active rows with content
  files only. Clicking one: it lifts, **drops onto a bench surface** with a small
  bounce and settles. Then a message: **"Well done! Now let's clean it."** →
  step 3 (or a "coming soon" end card while step 3 is not built, with links to
  the tray's shop page and to `/how-we-grow`).
  - Buy link on the chosen pair → `/shop/trays/[key]`. Price printed from
    DynamoDB, never written in copy.
- **Reuse, don't fork, the scene.** Before step 2, split `scene.ts` into modules
  the journey can share: `tray.ts` (trayGeometry, trayPair, a colour option for
  black vs green/white), `plants.ts` (varieties, plant geometry, shaders),
  `scene.ts` (renderer, camera, loop, pointer). The home section and step 1 must
  render identically after the split; compare stills before/after.

### 3.4 Done means

- `npx vitest run`: all pass, **report skipped count** (should be 0).
- `npx tsc --noEmit -p .` and `npx eslint` clean.
- Playwright: home bottom section, badge on 3 different pages (+ not on admin),
  `/grow` and `/kn/grow` steps 1→2, the drop animation mid-flight, phone size
  390×844, reduced motion (stills only, no three.js chunk requested).
- Retake stills for anything that has one.
- Ask the owner to try it on a mid-range Android phone (only measured on an
  M1 Mac so far: ~118 fps with ~5,300 stems).

---

## 4. Later slices — steps 3 to 9

Ideas agreed in principle; refine each before building. Every step: one
interaction, one short line of copy, Back/Skip, a still for reduced motion, and
where relevant one product link.

| # | Step | Interaction idea | Product moment |
|---|---|---|---|
| 3 | **Clean the tray** | Pick up the spray bottle, spray (mist particles), then drag a cotton cloth to wipe; the tray goes from dull to clean and glossy as you wipe | — (see open question on sanitiser) |
| 4 | **Soak the coco peat** | Pour water on the dry block; it **swells** (rest volume grows — the soft-body "soak" idea from this session), darkens, then crumble it apart with the cursor | Coco peat block, with "Recommended by Fewgrams" badge; add to cart in place ("put this block in your basket" as the block goes in) |
| 5 | **Fill and level** | Scoop the peat into the tray; drag to spread and press flat | — |
| 6 | **Sow** | Choose a seed (only seeds in stock, ≥ 50 g); drag across the tray to scatter evenly | Seeds, with real names/prices; sold out is never offered |
| 7 | **Blackout** | Cover the tray; a dial/scrubber runs the dark days and the shoots push up pale | — |
| 8 | **Light & water** | Move the tray under a light (a rack); tap to water each day on the dial; greens colour up | Racks |
| 9 | **Harvest** | Cut with scissors along the tray | **Starter kit**: "Add everything you used" (tray + peat + seeds as cart lines in one press); and "Or order it fresh" → `/microgreens` |

Time is a **dial, not real days**: the whole journey should take about three
minutes. A "come back tomorrow" garden is a different product.

---

## 5. Rules this feature must follow (from CLAUDE.md, check each step)

- **No hardcoded text**: every visible string (including `aria-label`, `alt`,
  button labels) in `messages/en/grow.json` + Kannada in `messages/kn/grow.json`.
- **No grow duration in copy.** "End of seven days" must not be written. Days
  are printed from the variety's `growDays` (admin-tuned); blackout/light day
  counts likewise, or not stated at all.
- **No price or stock figure in copy**; prices from DynamoDB, stock never shown.
- **No nutrient claims**, no "healthy". **No city name.**
- **Coco peat:** no expansion figure or maker's claims ("100% organic",
  "anti-fungal"); show the swelling, do not state a ratio. Keep the
  "Recommended by Fewgrams" badge.
- **Sanitiser:** only say "food grade" if it is true of what we actually use or
  sell (open question). If we do not sell it, an unbranded bottle.
- **Cart:** add lines through the existing cart actions; key by **kind + content
  key** (never content key alone); `sellable()` decides what can be added.
- **Typed placeholders**: `{price, number}`, never `{price}`.
- `Link`/`redirect`/`useRouter` from `@/i18n/navigation`.
- three.js stays lazy (dynamic `import()` on approach), never in shared bundles.
- Server render is the still; the live scene is the enhancement (reduced
  motion, no JS, no WebGL all get a complete page).

---

## 6. Open decisions for the owner

1. **Route and name**: `/grow` "Grow with us", `/garden` "Play garden", or other?
2. **Badge on cart and checkout**: show it there too, or hide it on those two?
3. **Sanitiser**: do we sell one / which do we use, and is "food grade" accurate?
4. **`/how-we-grow` overlap**: proposed split is that the storybook is *our*
   story and the journey is *your* tray, each linking to the other. OK?
5. **Starter kit at the end**: one press adding tray + peat + seeds is the
   strongest close. Fine to build it as several cart lines (no new product)?

---

## 7. After the build — what is left

- Try it on a mid-range Android phone (only measured on an M1 Mac).
- Steps 4 and 5 use one block size (the 5 kg row, first by key). If the bulk
  block should be offered too, it needs a choice in step 4.
- Only three greens can be grown (the three the home page draws). A fourth
  needs a `Look` in `tray-play/plants.ts` and a seed/variety key in
  `garden/page.tsx`.
- `/how-we-grow` ↔ `/garden` cross-links (open decision 4) are not added yet.
- Stills: `public/garden/<step>.webp` and `-narrow.webp` were captured with the
  black pair and radish; retake after any scene change (script idea: load
  `?step=<s>`, press "Do it for me", wait for Next, hide the hint/progress/tags,
  screenshot the canvas — wide at 1440×900 @2×, narrow at 390×844 @2.5×).

