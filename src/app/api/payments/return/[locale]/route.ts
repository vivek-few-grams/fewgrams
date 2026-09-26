import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CART_COOKIE, parseCart, serialiseCart } from "@/lib/cart/cart";
import { cartAfterOrder } from "@/lib/cart/area-split";
import { cartCookieOptions } from "@/lib/cart/server";
import type { Order } from "@/lib/orders/order";
import { isOrderId } from "@/lib/orders/order";
import { settleOrder } from "@/lib/orders/settle";
import { isSubscriptionId } from "@/lib/subscriptions/subscription";
import { settleSubscription } from "@/lib/subscriptions/settle";

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

  /* A subscription (`FS…`) is settled the same way and never touches the
     cart, so its cookie is left alone. */
  if (isSubscriptionId(orderId)) {
    try {
      await settleSubscription(orderId, "return");
    } catch (e) {
      console.error(`[payments] return settle failed for ${orderId}`, e);
    }
    return NextResponse.redirect(new URL(`${prefix}/account/subscriptions?paid=${orderId}`, request.url));
  }

  if (!isOrderId(orderId)) {
    return NextResponse.redirect(new URL(`${prefix}/cart`, request.url));
  }

  let paid: Order | null = null;
  try {
    const settled = await settleOrder(orderId, "return");
    if (settled?.status === "paid") paid = settled;
  } catch (e) {
    /* The gateway being briefly unreachable must not strand the customer on
       an error page. The order page shows "confirming", and the webhook
       settles it when it arrives. */
    console.error(`[payments] return settle failed for ${orderId}`, e);
  }

  const res = NextResponse.redirect(new URL(`${prefix}/account/orders/${orderId}`, request.url));
  /* Only once paid: a customer whose card failed comes back to the same cart
     and tries again. And only what was bought comes out — greens set aside
     for an address outside the area stay in the cart (`cartAfterOrder`). */
  if (paid) {
    const left = serialiseCart(cartAfterOrder(parseCart(request.cookies.get(CART_COOKIE)?.value), paid.lines));
    if (left) res.cookies.set(CART_COOKIE, left, cartCookieOptions());
    else res.cookies.delete(CART_COOKIE);
  }
  return res;
}
