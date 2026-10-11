import { routing, type Locale } from "@/i18n/routing";
import type { EmailMessage } from "./provider";

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
  subject: string;
  heading: string;
  body: string;
  button: string;
  fallback: string;
  ignore: string;
};

/**
 * The sign-in email, already translated: plain text and a single-column HTML
 * version with inline styles (email clients ignore stylesheets). The link is
 * the only thing in it that came from outside, and it is escaped.
 */
export function signInEmail(to: string, url: string, copy: SignInEmailCopy): EmailMessage {
  const href = escapeHtml(url);
  const text = [copy.heading, "", copy.body, "", url, "", copy.ignore].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f2ea;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<h1 style="margin:0 0 12px;font-size:22px;color:#033923">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapeHtml(copy.body)}</p>
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;background:#033923;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 28px;border-radius:999px">${escapeHtml(copy.button)}</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#5f6b63">${escapeHtml(copy.fallback)}</p>
<p style="margin:0 0 24px;font-size:12px;word-break:break-all"><a href="${href}" style="color:#033923">${href}</a></p>
<p style="margin:0;font-size:12px;color:#5f6b63">${escapeHtml(copy.ignore)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
  return { to, subject: copy.subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
