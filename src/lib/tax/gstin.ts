/**
 * A GSTIN — SPEC §26. Fifteen characters: the state code, the holder's PAN,
 * an entity number, a `Z`, and a check digit (GSTN's mod-36 scheme).
 *
 * The check digit is what makes this worth more than a pattern: a business
 * buyer who mistypes one character loses the credit on our invoice, and we
 * report a B2B sale against a GSTIN that does not exist.
 */

import business from "../../../content/legal/business.json";

/** Ours, from `content/legal/business.json`. A buyer cannot give it: the
 *  portal refuses a GSTR-1 that reports a sale to the seller's own GSTIN. */
export const OUR_GSTIN = business.gstin;

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Upper-cased, with spaces dropped — how a GSTIN is typed is not how it is
 *  stored. */
export function normaliseGstin(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function isValidGstin(g: string): boolean {
  return SHAPE.test(g) && g[14] === gstinCheckDigit(g.slice(0, 14));
}

/** The two-digit GST state code a GSTIN was issued in. */
export function gstinStateCode(g: string): string {
  return g.slice(0, 2);
}
