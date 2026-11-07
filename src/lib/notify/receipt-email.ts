import { routing, type Locale } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { contact } from "@/lib/content/contact";
import { notificationProvider, type EmailMessage } from "@/lib/notify";
import { EMAIL_BANNER } from "./email-images";
import {
  CREAM,
  DISPLAY,
  FOREST,
  INK,
  LEAF,
  MUTED,
  RULE,
  emailButton,
  emailShell,
  escapeHtml,
  siteName,
  type EmailFooter,
} from "./email-layout";

export { siteName };

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
  return raw && (routing.locales as readonly string[]).includes(raw)
    ? (raw as Locale)
    : routing.defaultLocale;
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
export type ReceiptRow = {
  label: string;
  detail?: string;
  amount: string;
  /** What kind of thing it is — "Seeds", "Microgreens" — over the name, so
   *  alfalfa seed and alfalfa greens cannot be mistaken for each other. */
  kind?: string;
  /** Its thumbnail (`lineThumb`); null when the product has no photo yet. */
  image?: string | null;
};

export type ReceiptContent = {
  /** `<html lang>`, so a screen reader reads Kannada as Kannada. */
  lang: Locale;
  subject: string;
  /** The line an inbox shows beside the subject before the email is opened. */
  preheader: string;
  /** Small, above the heading: "Invoice FG/2627/00001". */
  reference: string;
  heading: string;
  greeting: string;
  body: string;
  /** One line set apart under the body — an order's arrival date. */
  highlight: string | null;
  /** The order's progress, as on its page: the steps, and which one it is on
   *  (the ones before it are done). Null for a subscription. */
  steps: { labels: string[]; current: number } | null;
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
  /** The button. No raw URL printed under it (the owner, 7 Nov 2026): a bare
   *  link is what an inbox preview or a phone notification shows when it runs
   *  out of other text, and it reads as clutter. The plain-text part keeps
   *  the URL, having no button. */
  link: { url: string; button: string };
  help: string;
  footer: EmailFooter;
};

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
  out.push("", c.link.button, c.link.url, "", c.help, "", `${c.footer.tagline} · ${brand.url}`);
  return out.join("\n");
}

const h2 = (text: string) =>
  `<h2 style="margin:0 0 6px;font-family:${DISPLAY};font-size:17px;color:${FOREST}">${escapeHtml(text)}</h2>`;

/** Placed ✓ · Packing · On its way · Delivered — dots and words, no
 *  connecting rule: a line between table cells breaks in half the clients. */
function stepsHtml(steps: NonNullable<ReceiptContent["steps"]>): string {
  const cells = steps.labels
    .map((label, i) => {
      const done = i < steps.current;
      const now = i === steps.current;
      const dot = done
        ? `background:${FOREST};color:#ffffff;border:2px solid ${FOREST}`
        : now
          ? `background:#ffffff;color:${FOREST};border:2px solid ${FOREST}`
          : `background:${CREAM};color:${MUTED};border:2px solid ${CREAM}`;
      const mark = done ? "&#10003;" : now ? "&#9679;" : "&nbsp;";
      return `<td align="center" valign="top" width="25%" style="padding:0 2px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="26" height="26" style="width:26px;height:26px;border-radius:999px;font-size:${now ? 10 : 13}px;line-height:26px;font-weight:bold;${dot}">${mark}</td></tr></table>
<p style="margin:7px 0 0;font-size:11px;line-height:1.3;letter-spacing:0.04em;text-transform:uppercase;font-weight:bold;color:${done || now ? FOREST : MUTED}">${escapeHtml(label)}</p>
</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px"><tr>${cells}</tr></table>`;
}

function itemsHtml(items: ReceiptRow[]): string {
  /* A thumbnail column only when some row has a picture; a row without one
     keeps the column with a plain square, so the names stay in line. */
  const pictured = items.some((row) => row.image);
  return items
    .map((row) => {
      const edge = `border-top:1px solid ${RULE}`;
      const thumb = !pictured
        ? ""
        : `<td width="56" valign="top" style="width:56px;padding:14px 14px 14px 0;${edge}">${
            row.image
              ? `<img src="${escapeHtml(row.image)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:0;border-radius:12px">`
              : `<div style="width:56px;height:56px;border-radius:12px;background:${CREAM}"></div>`
          }</td>`;
      return `<tr>${thumb}<td valign="top" style="padding:14px 0;${edge}">${
        row.kind
          ? `<p style="margin:0 0 2px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;font-weight:bold;color:${LEAF}">${escapeHtml(row.kind)}</p>`
          : ""
      }<p style="margin:0;font-size:15px;font-weight:bold;color:${FOREST}">${escapeHtml(row.label)}</p>${
        row.detail
          ? `<p style="margin:3px 0 0;font-size:12px;color:${MUTED}">${escapeHtml(row.detail)}</p>`
          : ""
      }</td><td align="right" valign="top" style="padding:14px 0 14px 16px;white-space:nowrap;font-size:15px;font-weight:bold;color:${FOREST};${edge}">${escapeHtml(row.amount)}</td></tr>`;
    })
    .join("\n");
}

function totalsHtml(totals: ReceiptRow[]): string {
  /* Each rule is a row of its own, one cell wide and filled with colour: a
     border, on two cells or collapsed into the row above, shows a seam where
     the cells meet. */
  const rule = (height: number, colour: string) =>
    `<tr><td colspan="2" height="${height}" bgcolor="${colour}" style="height:${height}px;padding:0;background:${colour};font-size:0;line-height:0">&nbsp;</td></tr>`;
  return totals
    .map((row, i) => {
      const last = i === totals.length - 1;
      const label = last
        ? `font-size:18px;font-weight:bold;color:${FOREST}`
        : `font-size:14px;color:${MUTED}`;
      const amount = last ? label : `font-size:14px;color:${FOREST}`;
      const pad = last ? 14 : 12;
      return `${last ? rule(2, FOREST) : rule(1, RULE)}
<tr><td style="padding:${pad}px 0;${label}">${escapeHtml(row.label)}</td><td align="right" style="padding:${pad}px 0 ${pad}px 16px;white-space:nowrap;${amount}">${escapeHtml(row.amount)}</td></tr>`;
    })
    .join("\n");
}

function receiptHtml(c: ReceiptContent): string {
  const schedule = c.schedule
    ? `<div style="margin:30px 0 0">${h2(c.schedule.heading)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${c.schedule.rows
  .map(
    (row) =>
      `<tr><td style="padding:11px 0;border-top:1px solid ${RULE};font-size:13px;color:${MUTED}">${escapeHtml(row.label)}</td><td align="right" style="padding:11px 0;border-top:1px solid ${RULE};font-size:14px;font-weight:bold;color:${FOREST}">${escapeHtml(row.value)}</td></tr>`,
  )
  .join("\n")}
</table></div>`
    : "";

  const content = `<img src="${escapeHtml(EMAIL_BANNER)}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:20px 20px 0 0">
<div class="fg-pad" style="padding:32px 36px 34px">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED}">${escapeHtml(c.reference)}</p>
<h1 class="fg-h1" style="margin:0 0 16px;font-family:${DISPLAY};font-size:26px;line-height:1.25;color:${FOREST}">${escapeHtml(c.heading)}</h1>
<p style="margin:0 0 4px;font-size:15px;line-height:1.55">${escapeHtml(c.greeting)}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.55">${escapeHtml(c.body)}</p>
${
  c.highlight
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px"><tr><td bgcolor="${FOREST}" style="background:${FOREST};border-radius:12px;padding:13px 20px;font-family:${DISPLAY};font-size:17px;font-weight:bold;color:#ffffff">${escapeHtml(c.highlight)}</td></tr></table>`
    : ""
}
${c.steps ? stepsHtml(c.steps) : ""}
${h2(c.itemsHeading)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${itemsHtml(c.items)}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${totalsHtml(c.totals)}
</table>
${c.totalNote ? `<p style="margin:2px 0 0;font-size:12px;color:${MUTED};text-align:right">${escapeHtml(c.totalNote)}</p>` : ""}
${schedule}
${c.note ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.55;color:${INK}">${escapeHtml(c.note)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 28px"><tr><td bgcolor="${CREAM}" style="background:${CREAM};border-radius:14px;padding:18px 20px">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;color:${LEAF}">${escapeHtml(c.address.heading)}</p>
<p style="margin:0;font-size:14px;line-height:1.65;color:${INK}">${c.address.lines.map(escapeHtml).join("<br>")}</p>
</td></tr></table>
${emailButton(c.link.url, c.link.button)}
<p style="margin:0;padding:18px 0 0;border-top:1px solid ${RULE};font-size:13px;line-height:1.55;color:${MUTED}">${escapeHtml(c.help)}</p>
</div>`;

  return emailShell({ lang: c.lang, title: c.subject, preheader: c.preheader, content, footer: c.footer });
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
