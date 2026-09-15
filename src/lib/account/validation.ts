import { isServiceable } from "@/lib/brand";

/**
 * Account form validation — pure, so it can be tested without a browser, a
 * session or DynamoDB (SPEC §15).
 *
 * Every failure is returned as a *code*, never as a sentence. The account
 * pages render in two languages, so the wording has to come from
 * `messages/<locale>/account.json` like every other string (CLAUDE.md). The
 * codes here are message keys under `account.errors`.
 *
 * This is the server-side gate, not a convenience copy of the client one.
 * SPEC §8 is explicit that rules are enforced in server actions — the browser
 * `pattern` attributes on these forms are there to fail fast, and prove
 * nothing.
 */

export type Invalid = {
  code: string;
  /** Which input to point at. Used for `aria-invalid` and focus. */
  field: string;
  /** ICU arguments for the message, e.g. the PIN we do not serve. */
  values?: Record<string, string>;
};

export type Validated<T> = { ok: true; value: T } | { ok: false; error: Invalid };

const fail = (field: string, code: string, values?: Record<string, string>) =>
  ({ ok: false, error: { code, field, values } }) as const;

/** Trim and collapse runs of whitespace — paste from a PDF is the usual source. */
export const clean = (v: FormDataEntryValue | null | undefined): string =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Indian mobile number, normalised to the bare ten digits.
 *
 * Accepts the three forms people actually type — `+91 98450 12345`,
 * `098450 12345`, `9845012345` — and stores one. Indian mobile numbers begin
 * 6, 7, 8 or 9, so a short code or a non-metro landline is rejected: the
 * rider has to be able to call from the gate.
 *
 * **Known ambiguity, and it is ours specifically.** Stripping a leading `0`
 * cannot distinguish a mobile typed with a dialling prefix from a Bengaluru
 * landline: `080-4123 4567` and the mobile `8041234567` are the same eleven
 * digits. Bengaluru's STD code is `080`, and `80xx` is a live mobile series,
 * so the collision is unavoidable by format alone — every other metro code
 * (`011`, `022`, `033`, `040`, `044`) normalises to a leading digit no mobile
 * uses and is rejected here.
 *
 * Accepted deliberately, rather than rejecting the leading-`0` form outright:
 * typing `09845012345` is common and rejecting it would cost every one of
 * those customers a retype, while the landline case is rare on a form that
 * asks for a mobile and says so. The real defence is that the number is shown
 * back on the address card, so a wrong one is visible before Saturday.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

/** Display form: `98450 12345`. Never stored — storage stays canonical. */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

export type ProfileInput = { name: string; phone?: string };

export function validateProfile(fd: FormData): Validated<ProfileInput> {
  const name = clean(fd.get("name"));
  if (!name) return fail("name", "nameRequired");
  if (name.length > 80) return fail("name", "nameTooLong");

  const phoneRaw = clean(fd.get("phone"));
  // Optional here and required on an address: an account is useful before
  // there is anywhere to deliver to, but nothing ships without a number.
  if (!phoneRaw) return { ok: true, value: { name } };

  const phone = normalisePhone(phoneRaw);
  if (!phone) return fail("phone", "phoneInvalid");
  return { ok: true, value: { name, phone } };
}

export type AddressInput = {
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  pincode: string;
  notes?: string;
  geo?: { lat: number; lng: number; accuracyM?: number };
  isDefault: boolean;
};

/** Parses the three geolocation inputs, which arrive together or not at all. */
function readGeo(fd: FormData): Validated<AddressInput["geo"]> {
  const lat = clean(fd.get("lat"));
  const lng = clean(fd.get("lng"));
  if (!lat && !lng) return { ok: true, value: undefined };

  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return fail("geo", "locationInvalid");
  }
  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) {
    return fail("geo", "locationInvalid");
  }

  const accuracy = Number(clean(fd.get("accuracyM")));
  return {
    ok: true,
    value: {
      lat: latN,
      lng: lngN,
      ...(Number.isFinite(accuracy) && accuracy > 0
        ? { accuracyM: Math.round(accuracy) }
        : {}),
    },
  };
}

export function validateAddress(fd: FormData): Validated<AddressInput> {
  const recipient = clean(fd.get("recipient"));
  if (!recipient) return fail("recipient", "recipientRequired");

  const phone = normalisePhone(clean(fd.get("phone")));
  if (!phone) return fail("phone", "phoneInvalid");

  const line1 = clean(fd.get("line1"));
  if (!line1) return fail("line1", "line1Required");

  const city = clean(fd.get("city"));
  if (!city) return fail("city", "cityRequired");

  const pincode = clean(fd.get("pincode")).replace(/\D/g, "");
  if (!/^\d{6}$/.test(pincode)) return fail("pincode", "pincodeInvalid");
  // SPEC §7: the PIN allowlist is a hard gate, and it has to be applied here
  // and not only by the PIN checker on the home page.
  if (!isServiceable(pincode)) {
    return fail("pincode", "pincodeNotServed", { pincode });
  }

  const geo = readGeo(fd);
  if (!geo.ok) return geo;

  const line2 = clean(fd.get("line2"));
  const landmark = clean(fd.get("landmark"));
  const notes = clean(fd.get("notes"));

  return {
    ok: true,
    value: {
      // Blank is not an error — most people have one address and no opinion
      // about what it is called.
      label: clean(fd.get("label")) || "Home",
      recipient,
      phone,
      line1,
      ...(line2 ? { line2 } : {}),
      ...(landmark ? { landmark } : {}),
      city,
      pincode,
      ...(notes ? { notes } : {}),
      ...(geo.value ? { geo: geo.value } : {}),
      isDefault: fd.get("isDefault") === "on",
    },
  };
}
