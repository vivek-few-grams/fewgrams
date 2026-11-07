import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { contact, contactPhoneDisplay } from "@/lib/content/contact";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import type { Subscription } from "@/lib/subscriptions/subscription";
import { addressLines, type Translate } from "./order-email";
import type { EmailMessage } from "./provider";
import { dateLocaleFor, emailLocale, pageUrl, receiptEmail, sendOrPrint, siteName } from "./receipt-email";

/** Everything the subscription confirmation reads off a subscription — the
 *  row as it stands after `markSubscriptionPaid`, so `invoiceNo` is set and
 *  `deliveries` holds the Saturdays as finally scheduled. */
export type SubscriptionEmailFields = Pick<
  Subscription,
  "id" | "email" | "locale" | "invoiceNo" | "lines" | "total" | "deliveries" | "address"
>;

/**
 * The subscription confirmation: each plan and how many boxes of it, every
 * Saturday of the term, the total and the one-payment-no-renewal note. Pure:
 * `t` is scoped to `email.subscription`.
 *
 * The Saturdays are however many `deliveries` holds, in date order — four for
 * a term today, but the email counts them rather than promising a number.
 */
export function subscriptionEmail(
  to: string,
  sub: SubscriptionEmailFields,
  { locale, t }: { locale: Locale; t: Translate },
): EmailMessage {
  const money = (amount: number) => t("amount", { amount });
  const dateLocale = dateLocaleFor(locale);
  const saturdays = [...sub.deliveries].sort((a, b) => a.date.localeCompare(b.date));
  return receiptEmail(to, {
    lang: locale,
    subject: t("subject", { brand: brand.name, number: sub.invoiceNo ?? sub.id }),
    preheader: t("preheader", {
      date: saturdays[0] ? formatDeliveryDate(fromIstDateISO(saturdays[0].date), dateLocale) : "",
      amount: sub.total,
    }),
    reference: sub.invoiceNo
      ? t("invoiceRef", { number: sub.invoiceNo })
      : t("subscriptionRef", { id: sub.id }),
    heading: t("heading"),
    greeting: t("greeting"),
    body: t("body"),
    highlight: null,
    steps: null,
    itemsHeading: t("plansHeading"),
    items: sub.lines.map((line) => ({
      label: t("planLine", { plan: line.name, count: line.boxes }),
      detail: t("planBoxes", { count: line.boxes }),
      amount: money(line.lineTotal),
    })),
    totals: [{ label: t("total"), amount: money(sub.total) }],
    totalNote: t("deliveryIncluded"),
    schedule: {
      heading: t("saturdaysHeading"),
      rows: saturdays.map((d, i) => ({
        label: t("boxN", { n: i + 1 }),
        value: formatDeliveryDate(fromIstDateISO(d.date), dateLocale),
      })),
    },
    note: t("termNote"),
    address: { heading: t("addressHeading"), lines: addressLines(sub.address) },
    link: { url: pageUrl(locale, "/account/subscriptions"), button: t("button"), fallback: t("fallback") },
    help: t("help", { email: contact.email, phone: contactPhoneDisplay }),
    footer: { tagline: t("tagline"), why: t("why", { site: siteName }) },
  });
}

/**
 * Emails the subscription confirmation in the language it was taken out in.
 *
 * **Never throws** — the same rule as `sendOrderConfirmation`: the payment is
 * already recorded, so every error is logged and swallowed. A subscription
 * with no email address on it is logged and skipped.
 */
export async function sendSubscriptionConfirmation(sub: SubscriptionEmailFields): Promise<void> {
  try {
    if (!sub.email) {
      console.warn(`[email] subscription ${sub.id} has no email address; confirmation not sent`);
      return;
    }
    const locale = emailLocale(sub.locale);
    const t = await getTranslations({ locale, namespace: "email.subscription" });
    await sendOrPrint(
      subscriptionEmail(sub.email, sub, { locale, t }),
      `Subscription confirmation ${sub.id}`,
    );
  } catch (err) {
    console.error(`[email] subscription confirmation for ${sub.id} failed`, err);
  }
}
