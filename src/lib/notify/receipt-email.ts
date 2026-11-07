import { routing, type Locale } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { contact } from "@/lib/content/contact";
import { notificationProvider, type EmailMessage } from "@/lib/notify";

/**
 * What the order and subscription confirmations share: one receipt layout,
 * the language a stored row asks for, the page a link opens, and the
 * send-or-print step. The words all arrive translated — this file writes none.
 *
 * Same shape as `signInEmail`: plain text plus a single-column HTML version
 * with inline styles (email clients ignore stylesheets), and every value
 * escaped where it enters the HTML.
 */

/** A stored `locale` is a string; anything unknown reads as English. */
export function emailLocale(raw: string | null | undefined): Locale {
  return raw && (routing.locales as readonly string[]).includes(raw) ? (raw as Locale) : routing.defaultLocale;
}

/** The live address of a page in `locale` — English on bare paths, Kannada
 *  under `/kn` (`localePrefix: "as-needed"`). From `brand.url`, never a
 *  request: the email is read long after the request that sent it. */
export function pageUrl(locale: Locale, path: string): string {
  return `${brand.url}${locale === routing.defaultLocale ? "" : `/${locale}`}${path}`;
}

/** The `Intl` locale the account pages hand `formatDeliveryDate`. */
export function dateLocaleFor(locale: Locale): string {
  return locale === "kn" ? "kn-IN" : "en-IN";
}

/** A row with an amount: an order line, a plan, or a total. */
export type ReceiptRow = { label: string; detail?: string; amount: string };

export type ReceiptContent = {
  /** `<html lang>`, so a screen reader reads Kannada as Kannada. */
  lang: Locale;
  subject: string;
  /** Small, above the heading: "Invoice FG/2627/00001". */
  reference: string;
  heading: string;
  greeting: string;
  body: string;
  /** One line set apart under the body — an order's arrival date. */
  highlight: string | null;
  itemsHeading: string;
  items: ReceiptRow[];
  /** Under the items; the last one is the grand total and is set in bold. */
  totals: ReceiptRow[];
  /** Under the total: "Inclusive of all taxes". */
  totalNote: string | null;
  /** A dated list — a subscription's Saturdays. */
  schedule: { heading: string; rows: { label: string; value: string }[] } | null;
  note: string | null;
  address: { heading: string; lines: string[] };
  link: { url: string; button: string; fallback: string };
  help: string;
};

const INK = "#1f2a24";
const FOREST = "#033923";
const MUTED = "#5f6b63";
const RULE = "#e6dfd4";

export function receiptEmail(to: string, c: ReceiptContent): EmailMessage {
  return { to, subject: c.subject, text: receiptText(c), html: receiptHtml(c) };
}

function receiptText(c: ReceiptContent): string {
  const out: string[] = [c.reference, c.heading, "", c.greeting, c.body];
  if (c.highlight) out.push("", c.highlight);
  out.push("", c.itemsHeading);
  for (const row of c.items) {
    out.push(`- ${row.label} · ${row.amount}`);
    if (row.detail) out.push(`  ${row.detail}`);
  }
  out.push("");
  for (const row of c.totals) out.push(`${row.label} · ${row.amount}`);
  if (c.totalNote) out.push(c.totalNote);
  if (c.schedule) {
    out.push("", c.schedule.heading);
    for (const row of c.schedule.rows) out.push(`- ${row.label} · ${row.value}`);
  }
  if (c.note) out.push("", c.note);
  out.push("", c.address.heading, ...c.address.lines);
  out.push("", c.link.button, c.link.url, "", c.help);
  return out.join("\n");
}

function receiptHtml(c: ReceiptContent): string {
  const cell = (style: string, inner: string, align = "left") =>
    `<td align="${align}" style="padding:10px 0;border-top:1px solid ${RULE};vertical-align:top;${style}">${inner}</td>`;

  const items = c.items
    .map(
      (row) =>
        `<tr>${cell(
          "font-size:14px",
          `<strong style="color:${FOREST}">${escapeHtml(row.label)}</strong>${
            row.detail ? `<br><span style="font-size:12px;color:${MUTED}">${escapeHtml(row.detail)}</span>` : ""
          }`,
        )}${cell(`font-size:14px;white-space:nowrap;padding-left:16px;color:${FOREST}`, escapeHtml(row.amount), "right")}</tr>`,
    )
    .join("\n");

  const totals = c.totals
    .map((row, i) => {
      const last = i === c.totals.length - 1;
      const size = last ? "font-size:17px;font-weight:bold" : "font-size:14px";
      return `<tr>${cell(`${size};color:${last ? FOREST : MUTED}`, escapeHtml(row.label))}${cell(
        `${size};white-space:nowrap;padding-left:16px;color:${FOREST}`,
        escapeHtml(row.amount),
        "right",
      )}</tr>`;
    })
    .join("\n");

  const schedule = c.schedule
    ? `<h2 style="margin:28px 0 8px;font-size:16px;color:${FOREST}">${escapeHtml(c.schedule.heading)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${c.schedule.rows
  .map(
    (row) =>
      `<tr>${cell(`font-size:12px;color:${MUTED}`, escapeHtml(row.label))}${cell(
        `font-size:14px;font-weight:bold;color:${FOREST}`,
        escapeHtml(row.value),
        "right",
      )}</tr>`,
  )
  .join("\n")}
</table>`
    : "";

  const href = escapeHtml(c.link.url);
  return `<!doctype html>
<html lang="${c.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:24px;background:#f7f2ea;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 6px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED}">${escapeHtml(c.reference)}</p>
<h1 style="margin:0 0 16px;font-size:22px;color:${FOREST}">${escapeHtml(c.heading)}</h1>
<p style="margin:0 0 6px;font-size:15px;line-height:1.5">${escapeHtml(c.greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${escapeHtml(c.body)}</p>
${c.highlight ? `<p style="margin:0 0 24px;padding:12px 16px;background:#f7f2ea;border-radius:12px;font-size:15px;font-weight:bold;color:${FOREST}">${escapeHtml(c.highlight)}</p>` : ""}
<h2 style="margin:0 0 8px;font-size:16px;color:${FOREST}">${escapeHtml(c.itemsHeading)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${items}
${totals}
</table>
${c.totalNote ? `<p style="margin:4px 0 0;font-size:12px;color:${MUTED};text-align:right">${escapeHtml(c.totalNote)}</p>` : ""}
${schedule}
${c.note ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${INK}">${escapeHtml(c.note)}</p>` : ""}
<h2 style="margin:28px 0 8px;font-size:16px;color:${FOREST}">${escapeHtml(c.address.heading)}</h2>
<p style="margin:0 0 28px;font-size:14px;line-height:1.6">${c.address.lines.map(escapeHtml).join("<br>")}</p>
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;background:${FOREST};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 28px;border-radius:999px">${escapeHtml(c.link.button)}</a></p>
<p style="margin:0 0 6px;font-size:12px;color:${MUTED}">${escapeHtml(c.link.fallback)}</p>
<p style="margin:0 0 24px;font-size:12px;word-break:break-all"><a href="${href}" style="color:${FOREST}">${href}</a></p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(c.help)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends through this environment's transport, or — with none, which is local
 * development (`notificationProvider` refuses a production build without one)
 * — prints it to the terminal the way `src/auth.ts` prints a sign-in link.
 * Throws whatever the transport throws; the callers catch.
 */
export async function sendOrPrint(message: EmailMessage, label: string): Promise<void> {
  const provider = notificationProvider();
  if (!provider) {
    console.log(
      [
        "",
        "┌─────────────────────────────────────────────────────────────",
        `│ ${label} → ${message.to}`,
        `│ ${message.subject}`,
        "│",
        ...message.text.split("\n").map((line) => `│ ${line}`),
        "└─────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }
  await provider.sendEmail({ ...message, replyTo: message.replyTo ?? contact.email });
}
