/**
 * The taste chips in the empty search box — SPEC §27.2.
 *
 * A chip types its own label into the box, so `search.tastes.<key>` **is the
 * query**, and in each language it has to be a word that language's
 * descriptions actually use. That is why the Kannada chips are not
 * translations of the English ones: "Nutty" is "ಕಾಯಿಯ ರುಚಿ" because that is
 * how the Kannada files say it. `match.test.ts` fails on a chip that finds
 * fewer than two products in either language.
 *
 * **Tastes only.** No nutrient chip ("Vitamin C", "Iron"): a chip is a
 * prompt to buy on that basis, which makes it a nutrient claim under the FSS
 * (Advertising and Claims) Regulations 2018.
 */
export const TASTES = ["peppery", "mild", "nutty", "sweet", "earthy"] as const;
export type Taste = (typeof TASTES)[number];
