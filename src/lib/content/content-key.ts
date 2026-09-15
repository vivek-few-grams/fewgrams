/**
 * Content-key rules, in a module with **no Node imports**.
 *
 * Split out of ./varieties.ts on 15 Sep 2026 because the admin form and the
 * variety table are client components and need these: importing them from
 * ./varieties.ts pulled `node:fs/promises` into the browser bundle, which
 * fails the build outright ("the chunking context does not support external
 * modules"). Anything both sides need belongs here; anything that touches the
 * filesystem stays there.
 *
 * Named `variety-key.ts` until plans moved their copy to content files too
 * (15 Sep 2026). The rule was never about varieties: a content key is the
 * filename of a content file and a URL segment, and both catalogues want the
 * same one so `content/plans/essential.json` cannot be keyed differently from
 * `content/varieties/broccoli.json`.
 */

/**
 * A content key is both a filename and a URL segment, so it is restricted to
 * **lowercase a–z and single hyphens. No digits, no spaces, nothing else.**
 *
 * Digits were allowed until 15 Sep 2026 and are not any more, by decision: a
 * numbered key is the failure mode this whole design exists to avoid.
 * `amaranth-2` tells you nothing about which amaranth, where `red-amaranth`
 * cannot be misread — and once one numbered key exists the next person adds
 * `amaranth-3` rather than naming it.
 *
 * Validated here rather than sanitised, because this is the server-side
 * check and a key that needs fixing is a mistake to report: silently
 * rewriting one would break the link between the DynamoDB row and the file
 * the operator is about to create. The admin field sanitises keystrokes as a
 * separate, additive convenience.
 */
const KEY_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;

export function isValidContentKey(key: string): boolean {
  return KEY_PATTERN.test(key) && key.length <= 60;
}

/**
 * Keeps the field to lowercase a–z and single hyphens as it is typed.
 *
 * A space or an underscore becomes a hyphen rather than vanishing, because
 * someone typing "red amaranthus" means `red-amaranthus`, and silently
 * deleting the space would give them `redamaranthus`. Everything else —
 * digits, punctuation, other scripts — is dropped. A leading hyphen is
 * refused but a trailing one is allowed while typing, or `red-` could never
 * become `red-amaranth`.
 */
export function sanitiseKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}
