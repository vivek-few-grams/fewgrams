import { routing, type Locale } from "@/i18n/routing";
import type { EmailMessage } from "./provider";
import { DISPLAY, FOREST, MUTED, RULE, emailButton, emailShell, escapeHtml } from "./email-layout";

/** How long a sign-in link lasts — the email provider's `maxAge` in `src/auth.ts`. */
export const SIGN_IN_LINK_MINUTES = 15;

/**
 * The language to write a sign-in email in. Auth.js does not know the
 * visitor's locale, but the link carries the page they will land on
 * (`callbackUrl`), and a Kannada page lives under `/kn/…`.
 */
export function signInEmailLocale(url: string): Locale {
  try {
    const callback = new URL(url).searchParams.get("callbackUrl");
    if (!callback) return routing.defaultLocale;
    const first = new URL(callback, "https://callback.invalid").pathname.split("/")[1];
    return (routing.locales as readonly string[]).includes(first) ? (first as Locale) : routing.defaultLocale;
  } catch {
    return routing.defaultLocale;
  }
}

export type SignInEmailCopy = {
  /** `<html lang>` — the language the copy is in. */
  lang: Locale;
  subject: string;
  heading: string;
  body: string;
  button: string;
  fallback: string;
  ignore: string;
  /** "Goodness in every gram", under the card. */
  tagline: string;
};

/**
 * The sign-in email, already translated, in the frame every email shares
 * (`emailShell`): plain text and an inbox-safe HTML version. The link is the
 * only thing in it that came from outside, and it is escaped.
 */
export function signInEmail(to: string, url: string, copy: SignInEmailCopy): EmailMessage {
  const text = [copy.heading, "", copy.body, "", url, "", copy.ignore].join("\n");
  const content = `<div class="fg-pad" style="padding:34px 36px 32px">
<h1 class="fg-h1" style="margin:0 0 12px;font-family:${DISPLAY};font-size:25px;line-height:1.25;color:${FOREST}">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55">${escapeHtml(copy.body)}</p>
${emailButton(url, copy.button)}
<p style="margin:0 0 4px;font-size:12px;color:${MUTED}">${escapeHtml(copy.fallback)}</p>
<p style="margin:0 0 24px;font-size:12px;word-break:break-all"><a href="${escapeHtml(url)}" style="color:${FOREST}">${escapeHtml(url)}</a></p>
<p style="margin:0;padding:18px 0 0;border-top:1px solid ${RULE};font-size:12px;line-height:1.55;color:${MUTED}">${escapeHtml(copy.ignore)}</p>
</div>`;
  const html = emailShell({
    lang: copy.lang,
    title: copy.subject,
    preheader: copy.body,
    content,
    footer: { tagline: copy.tagline, why: null },
  });
  return { to, subject: copy.subject, text, html };
}
