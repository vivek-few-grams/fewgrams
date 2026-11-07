import { brand } from "@/lib/brand";
import type { Locale } from "@/i18n/routing";
import { EMAIL_LOGO } from "./email-images";

/**
 * The frame every email sits in: the logo on the cream ground, one white card,
 * and a footer under it (the owner, 7 Nov 2026: "make it better"). The words
 * all arrive translated; this file writes none.
 *
 * Built for inboxes, not browsers: tables for layout, every style inline (an
 * email client drops what it does not understand, and Gmail drops more), and
 * nothing that needs script. The one `<style>` block only narrows the padding
 * on a phone; a client that ignores it still gets a working email.
 */

export const INK = "#1f2a24";
export const FOREST = "#033923";
export const MUTED = "#5f6b63";
export const RULE = "#e6dfd4";
export const CREAM = "#f7f2ea";
export const SAGE = "#8fb877";
/** The leaf green of the logo, darkened until small text on white passes
 *  WCAG AA (4.5:1). */
export const LEAF = "#4d7a2a";

/** Quicksand is the site's display face. Apple Mail and some others load it;
 *  Gmail does not, and the stack falls back to the system's sans. */
export const DISPLAY = `'Quicksand','Trebuchet MS',Arial,Helvetica,sans-serif`;
export const BODY = `Arial,Helvetica,'Noto Sans Kannada',sans-serif`;

/** The site as a person types it — "fewgrams.com". */
export const siteName = brand.url.replace(/^https?:\/\//, "");

export type EmailFooter = {
  /** "Goodness in every gram". */
  tagline: string;
  /** Why this person got this email; none on a sign-in link, whose body
   *  already says what to do if it was not asked for. */
  why: string | null;
};

export type EmailShell = {
  lang: Locale;
  title: string;
  /** The line an inbox shows after the subject, before the email is opened. */
  preheader: string;
  /** The card's inside, already HTML. */
  content: string;
  footer: EmailFooter;
};

export function emailShell(s: EmailShell): string {
  return `<!doctype html>
<html lang="${s.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(s.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700&amp;display=swap" rel="stylesheet">
<style>
@media (max-width:600px){.fg-pad{padding:26px 20px !important}.fg-h1{font-size:23px !important}.fg-outer{padding:20px 8px 32px !important}}
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:${BODY};color:${INK};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(s.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}"><tr><td align="center" class="fg-outer" style="padding:28px 12px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 20px"><a href="${escapeHtml(brand.url)}" style="text-decoration:none"><img src="${escapeHtml(EMAIL_LOGO)}" width="110" height="93" alt="${escapeHtml(brand.name)}" style="display:block;border:0;outline:none;height:93px;width:110px"></a></td></tr>
<tr><td style="background:#ffffff;border-radius:20px;overflow:hidden">
${s.content}
</td></tr>
<tr><td align="center" style="padding:26px 24px 0;font-size:12px;line-height:1.7;color:${MUTED}">
<p style="margin:0 0 4px;font-family:${DISPLAY};font-size:14px;font-weight:bold;color:${LEAF}">${escapeHtml(s.footer.tagline)}</p>
<p style="margin:0 0 10px"><a href="${escapeHtml(brand.url)}" style="color:${FOREST};text-decoration:none;font-weight:bold">${escapeHtml(brand.name)}</a> · <a href="${escapeHtml(brand.url)}" style="color:${MUTED};text-decoration:none">${escapeHtml(siteName)}</a></p>
${s.footer.why ? `<p style="margin:0">${escapeHtml(s.footer.why)}</p>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * A button that is a button in Outlook too: the colour is on the table cell,
 * so a client that ignores padding on a link still draws the pill.
 */
export function emailButton(href: string, label: string): string {
  const url = escapeHtml(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" bgcolor="${FOREST}" style="border-radius:999px;background:${FOREST}"><a href="${url}" style="display:inline-block;padding:14px 32px;font-family:${BODY};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(label)}</a></td></tr></table>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
