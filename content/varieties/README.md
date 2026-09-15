# Variety content

One file per variety. **Every word a visitor reads about a variety lives here,
not in DynamoDB and not in a component.** The admin UI owns only what is
operational — price, yield per tray, grow days, seed rate, tier, active.

Loader and the reasoning behind the split: `src/lib/content/varieties.ts`.
SPEC §4.3.

## Naming

The filename is the **content key**, and it is also the public URL segment:

```
content/varieties/red-amaranth.json   →   /microgreens/red-amaranth
```

Plain lowercase kebab-case, digits allowed, 60 characters max. No UUID suffix:
the UUID is the DynamoDB primary key and you never need to see it. A family of
similar varieties is exactly where a descriptive key earns its keep —
`red-amaranth` cannot be confused with anything, where `amaranth-2` can.

Files beginning with `_` are ignored, so a template or a note can live here
without becoming a variety.

## Adding a variety

Either order works.

1. In **admin → varieties**, type the key and set the price, yield, grow days
   and seed rate. Files that already exist here appear as suggestions.
2. Create `<key>.json` in this folder. English is required; Kannada optional.
3. Drop its photos in `public/varieties/<key>/`.

Until step 2 is done the admin row is flagged in red with the exact path to
create, and every public page skips the variety rather than showing a nameless
card. So declaring a variety before its copy is written is safe — it just
stays off the site.

## Renaming

To change a **display name**, edit `en.name` here. The filename, the URL, the
DynamoDB id and every historical order line stay exactly as they are.

To change the **key** — which should be close to never — rename the file,
update the key on the variety in admin, and add a redirect from the old URL.

## Shape — one fixed template, enforced by a test

**Every file follows the same structure.** Copy `_template.json` and fill it in.
The contract lives in `src/lib/content/variety-contract.ts` and
`variety-contract.test.ts` runs it over every file in this folder, so a missing
field, a renamed field or four FAQs instead of five fails the test run. A
template that only lives in a README is a suggestion; this one is a rule.

Language-independent facts (`images`) sit at the top level. Everything a human
reads is nested under its locale.

| Block | Required fields |
|---|---|
| `images` | `hero`, `gallery` (at least one) |
| `en` | all eleven fields below |
| `kn` | **the same eleven fields** — full parity |

**Kannada is not optional and not a subset.** A missing key falls back to
English silently, which means a Kannada reader gets paragraphs of English with
nothing to signal the translation was never written. Three tests enforce it:
every field present, every Kannada string actually containing Kannada script,
and no value a verbatim copy of its English.

### The eleven English fields, in order

| Field | What goes in it |
|---|---|
| `name` | Short form. Also the page title — there is no separate `title` field, because two names for one thing drift apart |
| `shortDescription` | One line for cards and listings |
| `description` | The main paragraph on the variety page |
| `flavourNotes` | What it tastes like, honestly |
| `growingTips` | Soak, sow density, days, how to cut |
| `nutrition` | At least 5 `{ label, value }` rows |
| `nutritionNote` | Why the values are qualitative |
| `benefits` | At least 3. **Nutrient-function claims only** — see below |
| `cautions` | At least 1. Allergens, interactions, who should be careful |
| `faq` | Exactly 5 `{ question, answer }` pairs |
| `imageAlt` | Describes the hero photo |

### Health claims: what you may and may not write

**Never write that a food prevents, treats or cures a disease.** India's Food
Safety and Standards (Advertising and Claims) Regulations 2018 prohibit it, and
it would be false anyway.

Write **nutrient-function** claims instead — what a nutrient does in the body:

- Good: *"Vitamin C contributes to normal immune function."*
- Good: *"Iron contributes to reducing tiredness and fatigue."*
- Not allowed: *"Cures colds."* *"Prevents cancer."* *"Controls diabetes."*

Every claim should name the nutrient and the function. If you cannot name the
nutrient doing the work, do not make the claim.

### Nutrition values are qualitative on purpose

`High`, `Good source`, `Moderate`, `Present` — not milligrams. Microgreen
nutrient content swings with seed lot, light and harvest day, so a precise
figure would imply a consistency no honest grower can promise. `nutritionNote`
says so on the page.

### Example

```json
{
  "images": { "hero": "hero.jpg", "gallery": ["bunch.jpg"] },

  "en": {
    "name": "Radish",
    "shortDescription": "Peppery, fast and forgiving — the everyday microgreen.",
    "description": "Two or three sentences for the variety page.",
    "flavourNotes": "Sharp and peppery, like a mild radish bulb.",
    "growingTips": "Soak 6 hours, sow dense, harvest day 7.",
    "nutrition": [
      { "label": "Vitamin C", "value": "High" },
      { "label": "Vitamin K", "value": "High" },
      { "label": "Folate", "value": "Moderate" },
      { "label": "Potassium", "value": "Moderate" },
      { "label": "Glucosinolates", "value": "Present" }
    ],
    "nutritionNote": "Levels are qualitative — content varies with seed lot and harvest day.",
    "benefits": [
      "Vitamin C contributes to normal immune function.",
      "Vitamin K contributes to normal blood clotting.",
      "Folate contributes to normal blood formation."
    ],
    "cautions": [
      "Rinse before eating. Grown in soil and cut fresh, not washed and packed."
    ],
    "faq": [
      { "question": "How hot is it?", "answer": "Peppery, not chilli-hot." },
      { "question": "Can I cook it?", "answer": "Add it off the heat." },
      { "question": "How long does it keep?", "answer": "Five to seven days." },
      { "question": "Can children eat it?", "answer": "Yes, in small amounts." },
      { "question": "What do I use it for?", "answer": "Sandwiches and salads." }
    ],
    "imageAlt": "Tray of freshly cut radish microgreens"
  },

  "kn": {
    "name": "ಮೂಲಂಗಿ",
    "shortDescription": "ಖಾರ, ವೇಗ ಮತ್ತು ಸುಲಭ — ದಿನನಿತ್ಯದ ಮೈಕ್ರೋಗ್ರೀನ್.",
    "flavourNotes": "ಚುರುಕು ಮತ್ತು ಖಾರ, ಸೌಮ್ಯ ಮೂಲಂಗಿಯಂತೆ.",
    "imageAlt": "ತಾಜಾ ಕತ್ತರಿಸಿದ ಮೂಲಂಗಿ ಮೈಕ್ರೋಗ್ರೀನ್ಸ್ ಟ್ರೇ"
  }
}
```

`images` names files; it never contains image data. They resolve through
`varietyImageUrl()` to `public/varieties/<key>/` today and to CloudFront at
launch, so nothing here changes when storage moves.
