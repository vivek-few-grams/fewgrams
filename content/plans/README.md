# Plan content

One file per plan. **Every word a visitor reads about a plan lives here**, not
in DynamoDB and not in a component. Admin → plans owns only what is
operational: monthly price, grams per box, sort order, recommended, active,
and the four rotation weeks. The card's ground colour is not even that — it is
derived from the card's position (SPEC §18.4).

Loader and the reasoning behind the split: `src/lib/content/plans.ts`.
Same decision, and the same shape, as `content/varieties/`. SPEC §4.3.

## Why plan copy moved here (15 Sep 2026)

A plan used to carry `name`, `blurb` and `highlights` in DynamoDB, typed into
the admin form. `highlights` was the tell: a plain `string[]`, so there was no
locale to put a Kannada bullet list in, and the Kannada home page rendered the
English one. `name` and `blurb` were `LocalisedString`, which meant typing a
paragraph of Kannada into a web form — with no diff, no review and no history.

## Naming

The filename is the **content key**:

```
content/plans/build-your-own.json   →   admin → plans, key `build-your-own`
```

Plain lowercase kebab-case, letters and hyphens only, 60 characters max. No
UUID suffix: the UUID is the DynamoDB primary key and you never need to see it.
Files beginning with `_` are ignored, so the template can live here without
becoming a plan.

## These files decide which plans exist

**There are three plans and only three** — Essential, Exotic and Build Your Own
(SPEC §5.1). Admin → plans creates and deletes nothing: it renders **one row
per file in this folder** and saving a row sets that plan's price, box weight,
order and four rotation weeks.

So a fourth plan means adding a fourth file here, which is a reviewable change
rather than a form submission. Until the numbers are saved in admin the plan is
listed there as "not set up yet" and does not appear on the home page.

A row whose file has been **deleted** is the one thing admin → plans will let
you remove, because nothing about such a plan can be shown to a customer.

## Renaming

To change a **display name**, edit `en.name` here. The filename, the DynamoDB
id and every historical order line stay exactly as they are.

To change the **key**, rename the file. The old row becomes an orphan in admin,
flagged in red — delete it there and save the new row.

## Shape — one fixed template, enforced by a test

Copy `_template.json`. The contract lives in
`src/lib/content/plan-contract.ts`, and `plan-contract.test.ts` runs it over
every file in this folder, so a missing field, a renamed field or two
highlights instead of three fails the test run.

| Block | Required fields |
|---|---|
| `en` | all five fields below |
| `kn` | **the same five** — full parity |

There is no top-level block: a plan has no photography of its own. The card
renders the generated `Sprout` mark.

| Field | What goes in it |
|---|---|
| `name` | "Everyday Essentials", "Pick Your Own". The card title |
| `badge` | The pill above the card — "Recommended", "Most flexible". Two or three words |
| `tagline` | One line under the title. Was `blurb` |
| `description` | The paragraph at the top of the rotation modal |
| `highlights` | At least 3. The ticked list on the card |

**Every plan carries a badge, and each should say something different and
true.** "Best value" on the dearer plan is the failure mode — the card prints
₹ per 100 g a few lines below the pill, so a claim the figures contradict is
worse than no pill at all. Whether a pill is the filled, emphasised variant is
not set here: that is `recommended` in admin → plans, because which plan you
push changes far more often than what you call it.

### The five fields, in order

**Kannada is not optional and not a subset.** A missing field falls back to
English silently, which means a Kannada reader gets English with nothing to
signal the translation was never written. Three tests enforce it: every field
present, every Kannada string actually containing Kannada script, and no value
a verbatim copy of its English.

### Never write the price or the box weight

`monthlyPrice` and `gramsPerBox` live in DynamoDB, are printed on the card by
the component, and are the two figures the owner is expected to tune. Copy that
restates them goes stale the first time either moves — and then the card
contradicts itself a few pixels apart. **The contract test fails on it**, in
both scripts and both digit sets.

- Good: *"Enough greens for a salad a day"*, *"Priced by weight"*
- Not allowed: *"₹1,200 a month"*, *"400 g every Saturday"*, *"ತಿಂಗಳಿಗೆ ೧೨೦೦ ರೂ"*

Say what the plan is worth, not what it costs.

### Example

```json
{
  "en": {
    "name": "Everyday Essentials",
    "badge": "Recommended",
    "tagline": "The everyday greens, cut the morning they reach you.",
    "description": "The basics, on rotation. No two boxes in a month are the same.",
    "highlights": [
      "Sown only once you order",
      "Cut on the morning of your delivery",
      "Delivery included, on the Saturday run"
    ]
  },

  "kn": {
    "name": "ದಿನನಿತ್ಯದ ಮೂಲ ಸೊಪ್ಪು",
    "badge": "ಶಿಫಾರಸು",
    "tagline": "ದಿನನಿತ್ಯದ ಸೊಪ್ಪು, ನಿಮ್ಮ ಮನೆಗೆ ಬರುವ ಬೆಳಿಗ್ಗೆಯೇ ಕತ್ತರಿಸಿದ್ದು.",
    "description": "ಮೂಲಭೂತ ಸೊಪ್ಪುಗಳು, ಸರದಿಯಲ್ಲಿ. ಒಂದು ತಿಂಗಳಲ್ಲಿ ಯಾವ ಎರಡು ಡಬ್ಬಿಗಳೂ ಒಂದೇ ಅಲ್ಲ.",
    "highlights": [
      "ನೀವು ಆರ್ಡರ್ ಮಾಡಿದ ನಂತರವೇ ಬಿತ್ತನೆ",
      "ನಿಮ್ಮ ಡೆಲಿವರಿಯ ಬೆಳಿಗ್ಗೆಯೇ ಕತ್ತರಿಸಲಾಗುತ್ತದೆ",
      "ಶನಿವಾರದ ಸುತ್ತಿನಲ್ಲಿ ಡೆಲಿವರಿ ಸೇರಿದೆ"
    ]
  }
}
```

The Kannada in the three files here was written during the build and **has not
had a native review** — SPEC §16 carries that as an open item for all Kannada
in the repo.
