import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { lineUnits } from "@/lib/cart/line-display";
import { contact, contactPhoneDisplay } from "@/lib/content/contact";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import type { Order } from "@/lib/orders/order";
import type { EmailMessage } from "./provider";
import { lineThumb } from "./email-images";
import { dateLocaleFor, emailLocale, pageUrl, receiptEmail, sendOrPrint, siteName } from "./receipt-email";

/** A translator: next-intl's `t`, or a stand-in in a test. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Everything the order confirmation reads off an order — the row as it
 *  stands after `markOrderPaid`, so `invoiceNo` is set. */
export type OrderEmailFields = Pick<
  Order,
  | "id"
  | "email"
  | "locale"
  | "invoiceNo"
  | "lines"
  | "deliveryCharge"
  | "deliveryMethod"
  | "total"
  | "deliveryDate"
  | "address"
>;

/**
 * The order confirmation, built from the order as it was sold. Pure: `t` is
 * scoped to `email.order` and `cart` to `cart`, whose line wording
 * (`lineUnits`) is the order page's, so a line reads the same in the inbox as
 * on the site — grams for a weighed line, packs, blocks, racks for the rest.
 *
 * The lines are the stored lines. Greens set aside at checkout because the
 * address was outside the delivery area were never put on the order
 * (`splitByArea`), so there is nothing to filter here.
 */
export function orderEmail(
  to: string,
  order: OrderEmailFields,
  { locale, t, cart }: { locale: Locale; t: Translate; cart: Translate },
): EmailMessage {
  const money = (amount: number) => t("amount", { amount });
  const arrives = formatDeliveryDate(fromIstDateISO(order.deliveryDate), dateLocaleFor(locale));
  /* The order page's tracker: an order with greens is growing, the rest is
     being packed (`heroStage`). Just paid, so it is on that second step. */
  const greens = order.lines.some((l) => l.kind === "variety");
  return receiptEmail(to, {
    lang: locale,
    subject: t("subject", { brand: brand.name, number: order.invoiceNo ?? order.id }),
    preheader: t("preheader", { date: arrives, amount: order.total }),
    reference: order.invoiceNo
      ? t("invoiceRef", { number: order.invoiceNo })
      : t("orderRef", { id: order.id }),
    heading: t("heading"),
    greeting: t("greeting"),
    body: t("body"),
    highlight: t("arrives", { date: arrives }),
    steps: {
      labels: [
        t("steps.placed"),
        greens ? t("steps.growing") : t("steps.packing"),
        t("steps.onTheWay"),
        t("steps.delivered"),
      ],
      current: 1,
    },
    itemsHeading: t("itemsHeading"),
    items: order.lines.map((line) => ({
      kind: t(`kind.${line.kind}`),
      label: line.name,
      detail: lineUnits(line, cart),
      amount: money(line.lineTotal),
      image: lineThumb(line),
    })),
    totals: [
      /* An order from while delivery was free has no method and no charge
         — the order page leaves the row out for those, and so does this. */
      ...(order.deliveryMethod
        ? [
            {
              label: t("delivery"),
              amount: order.deliveryCharge > 0 ? money(order.deliveryCharge) : t("deliveryFree"),
            },
          ]
        : []),
      { label: t("total"), amount: money(order.total) },
    ],
    totalNote: t("inclusive"),
    schedule: null,
    note: null,
    address: { heading: t("addressHeading"), lines: addressLines(order.address) },
    link: {
      url: pageUrl(locale, `/account/orders/${order.id}`),
      button: t("button"),
    },
    help: t("help", { email: contact.email, phone: contactPhoneDisplay }),
    footer: { tagline: t("tagline"), why: t("why", { site: siteName }) },
  });
}

/** The address as the order page prints it, a line each. */
export function addressLines(a: Order["address"]): string[] {
  return [a.recipient, a.line1, a.line2, a.landmark, formatPlace(a), formatPhone(a.phone)].filter(
    (x): x is string => Boolean(x),
  );
}

/**
 * Emails the order confirmation in the language the order was placed in.
 *
 * **Never throws.** It is called after the payment has been recorded, and a
 * failed email must not fail — or retry — a payment: every error is logged
 * and swallowed. An order with no email address on it is logged and skipped.
 */
export async function sendOrderConfirmation(order: OrderEmailFields): Promise<void> {
  try {
    if (!order.email) {
      console.warn(`[email] order ${order.id} has no email address; confirmation not sent`);
      return;
    }
    const locale = emailLocale(order.locale);
    const [t, cart] = await Promise.all([
      getTranslations({ locale, namespace: "email.order" }),
      getTranslations({ locale, namespace: "cart" }),
    ]);
    await sendOrPrint(orderEmail(order.email, order, { locale, t, cart }), `Order confirmation ${order.id}`);
  } catch (err) {
    console.error(`[email] order confirmation for ${order.id} failed`, err);
  }
}
