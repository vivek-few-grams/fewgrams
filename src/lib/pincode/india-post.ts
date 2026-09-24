/**
 * PIN code → district and state, from the Department of Posts' own directory
 * on data.gov.in ("All India Pincode Directory", resource
 * `5c2f62fe-5afa-4119-a499-fec9d604d5bd`). Official, and free with a key.
 *
 * Why a lookup and not the digits: the first two digits of a PIN are the
 * postal circle, so the state *could* be derived — but the district cannot.
 * Eight Bengaluru PINs are split between Bengaluru Urban and Bengaluru Rural
 * (560060, 560067, 560068, 560082, 560083, 560090, 560091, 560099, checked
 * 23 Sep 2026), and 560068 is one we deliver to. The directory is the only
 * source that knows.
 *
 * Plain `fetch`, as for Cashfree and Delhivery. Contract checked against live
 * calls on 23 Sep 2026: one record per post office, each carrying `district`
 * and `statename` in capitals.
 *
 * Only `placeForPin` (`./place.ts`) calls this; it caches the answer.
 */

const ENDPOINT = "https://api.data.gov.in/resource/5c2f62fe-5afa-4119-a499-fec9d604d5bd";

/** Filling two form fields is not worth making anyone wait for. Past this
 *  the customer types them, which the form always allows. */
const TIMEOUT_MS = 4_000;

export type PinPlace = { district: string; state: string };

type Directory = {
  records?: Array<{ district?: string; statename?: string }>;
};

/** Words kept lower-case inside a place name: "Jammu and Kashmir",
 *  "Dadra and Nagar Haveli and Daman and Diu". */
const MINOR = new Set(["and", "of", "the"]);

/** The directory shouts (`BENGALURU URBAN`); a form field should not. */
export function placeCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * One place for a PIN out of its post offices.
 *
 * The district is the one **most** of the PIN's offices are in, because a
 * split PIN has to be filled with something and the majority is the likeliest
 * door. The customer can still correct it — the field stays editable. Ties go
 * to whichever the directory listed first, so the answer is stable.
 *
 * Null when the directory has no usable record: an unknown PIN, or a body
 * that is not the shape we checked.
 */
export function parseDirectory(body: unknown): PinPlace | null {
  const records = (body as Directory | null)?.records;
  if (!Array.isArray(records)) return null;

  const counts = new Map<string, { place: PinPlace; n: number }>();
  for (const r of records) {
    const district = r.district?.trim();
    const state = r.statename?.trim();
    if (!district || !state) continue;
    const key = `${district}|${state}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, { place: { district: placeCase(district), state: placeCase(state) }, n: 1 });
  }

  let best: { place: PinPlace; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.place ?? null;
}

/**
 * Ask the directory. Throws on a transport or HTTP failure so the caller can
 * tell "the directory does not know this PIN" (null) from "the directory did
 * not answer" (throw) — only the first is worth remembering.
 */
export async function fetchPinPlace(pincode: string, apiKey: string): Promise<PinPlace | null> {
  if (!/^\d{6}$/.test(pincode)) throw new Error(`Not a PIN code: ${pincode}`);
  const url = new URL(ENDPOINT);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "100");
  url.searchParams.set("filters[pincode]", pincode);

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    /* The key is in the query string, so the URL is never logged. */
    throw new Error(`India Post directory lookup for ${pincode} failed: ${res.status}`);
  }
  return parseDirectory(await res.json());
}
