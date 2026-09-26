import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CART_COOKIE } from "@/lib/cart/cart";
import { isOrderId } from "@/lib/orders/order";
import { settleOrder } from "@/lib/orders/settle";

/**
 * Where the gateway sends the customer after the payment screen — SPEC §9.
 *
 * `/api/payments/return/<locale>?order_id=<id>`. The locale is a path segment
 * because Cashfree appends `?order_id=` to the URL it was given (Razorpay's
 * `openGateway` puts it on the same way); a query
 * string of our own would end up with two `?`.
 *
 * **Arriving here proves nothing.** The query string is the customer's to
 * edit, so this only settles the named order against the gateway, server to
 * server — the same call the webhook makes. It exists so the confirmation
 * page is right on the first load, and so payment works in local development
 * where no webhook can reach the machine.
 *
 * A route handler rather than a page because it clears the cart cookie,
 * which a page render cannot write.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/payments/return/[locale]">,
) {
  const { locale: raw } = await ctx.params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;

  const orderId = request.nextUrl.searchParams.get("order_id") ?? "";
  if (!isOrderId(orderId)) {
    return NextResponse.redirect(new URL(`${prefix}/cart`, request.url));
  }

  let paid = false;
  try {
    paid = (await settleOrder(orderId, "return"))?.status === "paid";
  } catch (e) {
    /* The gateway being briefly unreachable must not strand the customer on
       an error page. The order page shows "confirming", and the webhook
       settles it when it arrives. */
    console.error(`[payments] return settle failed for ${orderId}`, e);
  }

  const res = NextResponse.redirect(new URL(`${prefix}/account/orders/${orderId}`, request.url));
  /* Only once paid: a customer whose card failed comes back to the same cart
     and tries again. */
  if (paid) res.cookies.delete(CART_COOKIE);
  return res;
}
