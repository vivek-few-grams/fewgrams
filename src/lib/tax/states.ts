/**
 * GST state codes — SPEC §26.2. Place of supply is reported by state code
 * (GSTR-1 table 7, GSTR-3B table 3.2), and the code decides CGST + SGST
 * against IGST.
 *
 * An address's state is a free-text field, filled from India Post
 * (`placeCase`: "Jammu and Kashmir", "Andaman and Nicobar Islands") and
 * editable, so names are matched loosely: case, punctuation, "&" and
 * spacing do not matter, and the old names India Post still returns are
 * aliases.
 */

export type GstState = { code: string; name: string };

const STATES: Array<GstState & { aliases?: string[] }> = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand", aliases: ["Uttaranchal"] },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi", aliases: ["New Delhi", "NCT of Delhi"] },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha", aliases: ["Orissa"] },
  { code: "22", name: "Chhattisgarh", aliases: ["Chattisgarh"] },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  {
    code: "26",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    aliases: ["Dadra and Nagar Haveli", "Daman and Diu"],
  },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry", aliases: ["Pondicherry"] },
  { code: "35", name: "Andaman and Nicobar Islands", aliases: ["Andaman and Nicobar"] },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]/g, "");

const BY_NAME = new Map<string, GstState>();
for (const s of STATES) {
  for (const n of [s.name, ...(s.aliases ?? [])]) BY_NAME.set(squash(n), { code: s.code, name: s.name });
}

/** Every state and union territory, by code — for a select. */
export const GST_STATES: readonly GstState[] = STATES.map((s) => ({ code: s.code, name: s.name }));

/** The state a two-digit GST code names (`29` → Karnataka), or null. */
export function gstStateByCode(code: string): GstState | null {
  return GST_STATES.find((s) => s.code === code) ?? null;
}

/** Where we are registered — the first two characters of our GSTIN. */
export const HOME_STATE: GstState = { code: "29", name: "Karnataka" };

/** The GST state for a state's name as an address holds it, or null when
 *  the name is not one we know. */
export function gstStateFor(name: string): GstState | null {
  return BY_NAME.get(squash(name)) ?? null;
}

/** Karnataka's PIN codes run 560000–591999. */
export function isHomeStatePin(pincode: string): boolean {
  return /^5[6-9]\d{4}$/.test(pincode);
}

/**
 * The place of supply for a delivery address. The PIN settles Karnataka
 * either way, so a misspelt state can neither turn a local sale into an
 * inter-state one nor the reverse; elsewhere the state's name decides, and
 * a name we cannot place is null — reported as inter-state, and flagged on
 * the GST page for a person to correct.
 */
export function placeOfSupply(address: { state?: string | null; pincode: string }): GstState | null {
  if (isHomeStatePin(address.pincode)) return HOME_STATE;
  const named = gstStateFor(address.state ?? "");
  return named && named.code !== HOME_STATE.code ? named : null;
}
