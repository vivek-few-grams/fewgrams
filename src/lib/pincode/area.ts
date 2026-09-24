import type { PinPlace } from "./india-post";

/**
 * The delivery area — SPEC §7. **A district, not a list of PIN codes.**
 *
 * Until 23 Sep 2026 this was eighteen hand-typed PINs in `brand.ts`, so a
 * Bengaluru PIN nobody had typed in (560072) was refused. Now a PIN is in the
 * area when India Post places it in a served district; new PINs and
 * re-drawn boundaries arrive with the directory, not with a code change.
 *
 * **Bengaluru Urban only** — the owner's decision, 23 Sep 2026. Bengaluru
 * Rural reaches 40+ km out (Doddaballapura), past the own same-day run.
 *
 * **The fallback when India Post cannot answer** — no key configured, the
 * directory down, a PIN it does not know — is "starts with 560", Bengaluru's
 * sorting district. So an outage never closes the shop. It is looser than
 * the district rule (eleven 560 PINs are partly Bengaluru Rural) and misses
 * nothing the district rule would allow except outskirts on 561/562 PINs;
 * it is only ever the answer while the lookup is unavailable.
 *
 * A split PIN (560068 has offices in both Bengaluru districts) is judged by
 * the district most of its offices are in — `parseDirectory` — never by what
 * the customer typed into the district field, which is for the label.
 */
export const SERVED_DISTRICTS: readonly string[] = ["Bengaluru Urban"];

/** Bengaluru's first three PIN digits — the fallback, see above. */
export const FALLBACK_PREFIX = "560";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Pure, so the rule is testable without the directory. */
export function inDeliveryArea(pincode: string, place: PinPlace | null): boolean {
  if (!/^\d{6}$/.test(pincode)) return false;
  if (place) return SERVED_DISTRICTS.some((d) => norm(d) === norm(place.district));
  return pincode.startsWith(FALLBACK_PREFIX);
}
