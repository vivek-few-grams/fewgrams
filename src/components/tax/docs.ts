import { getTranslations } from "next-intl/server";
import { lineId } from "@/lib/cart/cart";
import { lineQuantity } from "@/lib/cart/line-display";
import type { Order } from "@/lib/orders/order";
import type { Subscription } from "@/lib/subscriptions/subscription";
import type { DocLine, SheetProps } from "./TaxDocument";

/**
 * What each tax document says, built from what was stored at payment —
 * SPEC §26.3. The customer's order page, the subscriptions list and the
 * admin screens all print from these, so no two of them can print different
 * things for the same sale. Null where there is no document: unpaid, or paid
 * before GST registration.
 */

/** An order's lines beside their stored tax rows, in the order they were
 *  bought. Shared with the credit note, which lists the same goods. */
async function orderDocLines(order: Order): Promise<DocLine[]> {
  const tc = await getTranslations("cart");
  return order.lines.flatMap((line) => {
    const row = order.tax?.find((r) => r.source === "line" && r.line === lineId(line));
    return row
      ? [
          {
            key: row.line,
            name: line.name,
            quantity: lineQuantity(line.kind, line.units, tc, line.grams),
            row,
          },
        ]
      : [];
  });
}

/** An order's invoice-cum-bill of supply. */
export async function orderInvoice(order: Order): Promise<SheetProps | null> {
  if (!order.tax || !order.invoiceNo || !order.paidAt) return null;
  return {
    kind: "invoice",
    number: order.invoiceNo,
    issuedAt: order.paidAt,
    reference: { label: "order", id: order.id },
    against: null,
    address: order.address,
    buyer: order.buyer,
    placeOfSupply: order.placeOfSupply,
    lines: await orderDocLines(order),
    tax: order.tax,
    hasSeeds: order.lines.some((l) => l.kind === "seed"),
  };
}

/** The credit note reversing an order's invoice in full (Rule 53). */
export async function orderCreditNote(order: Order): Promise<SheetProps | null> {
  const invoice = await orderInvoice(order);
  if (!invoice || !order.creditNote) return null;
  return {
    ...invoice,
    kind: "creditNote",
    number: order.creditNote.number,
    issuedAt: order.creditNote.issuedAt,
    against: { number: invoice.number, issuedAt: invoice.issuedAt },
  };
}

/** A subscription's bill of supply: one payment for the term, every box
 *  fresh greens and so exempt, delivery inside the price. */
export async function subscriptionInvoice(sub: Subscription): Promise<SheetProps | null> {
  if (!sub.tax || !sub.invoiceNo || !sub.paidAt) return null;
  const t = await getTranslations("account.orders.invoice");
  const rows = sub.tax;
  return {
    kind: "invoice",
    number: sub.invoiceNo,
    issuedAt: sub.paidAt,
    reference: { label: "subscription", id: sub.id },
    against: null,
    address: sub.address,
    buyer: null,
    placeOfSupply: sub.placeOfSupply,
    lines: sub.lines.flatMap((l) => {
      const row = rows.find((r) => r.line === `plan:${l.planKey}`);
      return row
        ? [{ key: row.line, name: l.name, quantity: t("boxesQuantity", { count: l.boxes }), row }]
        : [];
    }),
    tax: rows,
    hasSeeds: false,
  };
}
