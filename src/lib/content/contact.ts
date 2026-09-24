import raw from "../../../content/contact.json";

/**
 * How a customer reaches us — `content/contact.json`, edited in git like the
 * rest of `content/` (the owner's call, 24 Sep 2026, over an admin screen).
 *
 * - `email` — customer care; the footer and "Order by email".
 * - `phone` — ten digits, as a customer would dial it in India.
 * - `whatsapp` — international form, digits only (`91` + the number), the
 *   form `wa.me` links take; `null` hides every "WhatsApp us".
 *
 * **Not the sign-in sender.** `brand.email` is the "from" on login emails
 * (`src/auth.ts`) and stays put, so changing the care inbox here cannot
 * break sign-in.
 *
 * Imported, not read from disk, because the outside-area card that offers
 * WhatsApp and email runs in the browser. Checked on import: a typo in the
 * file fails the build and the test, not a customer's tap on a dead link.
 */
export type Contact = { email: string; phone: string; whatsapp: string | null };

export function parseContact(v: unknown): Contact {
  const c = v as Partial<Record<keyof Contact, unknown>>;
  if (typeof c?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
    throw new Error("content/contact.json: `email` must be an email address");
  }
  if (typeof c.phone !== "string" || !/^[6-9]\d{9}$/.test(c.phone)) {
    throw new Error("content/contact.json: `phone` must be a ten-digit Indian mobile number");
  }
  if (c.whatsapp !== null && (typeof c.whatsapp !== "string" || !/^\d{11,15}$/.test(c.whatsapp))) {
    throw new Error("content/contact.json: `whatsapp` must be digits with the country code (91…), or null");
  }
  return { email: c.email, phone: c.phone, whatsapp: c.whatsapp ?? null };
}

export const contact: Contact = parseContact(raw);

/** `98450 12345` — the same display form as every phone number on the site. */
export const contactPhoneDisplay = `${contact.phone.slice(0, 5)} ${contact.phone.slice(5)}`;

export const contactTel = `tel:+91${contact.phone}`;

export function whatsappHref(text: string): string | null {
  return contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoHref(subject: string, body: string): string {
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
