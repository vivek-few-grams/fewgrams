"use server";

import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { assertRole } from "@/lib/auth/guard";
import { hydrateCart } from "@/lib/cart/server";
import {
  PAYMENT_WINDOW_MINUTES,
  addressSnapshot,
  linesFromCart,
  newOrderId,
  orderTotal,
  type Order,
} from "@/lib/orders/order";
import { paymentProvider } from "@/lib/payments";
import { deliveryCharge } from "@/lib/shipping/charge";
import { checkDeliveryArea } from "@/lib/pincode/place";
import { istDateISO } from "@/lib/delivery-date";
import { getAddress, getProfile } from "@/lib/repo/profile";
import { createOrder, setProviderOrderId } from "@/lib/repo/orders";
import type { CheckoutState } from "./state";

const fail = (code: string, values?: Record<string, string>): CheckoutState => ({
  status: "error",
  code,
  ...(values ? { values } : {}),
});

/**
 * Place the order and open a gateway session for it — SPEC §9.
 *
 * **Every figure is recomputed here.** The form sends an address id and the
 * total the customer was looking at, nothing else. The lines, prices and
 * delivery date come from `hydrateCart`, the same read the cart page makes,
 * and the delivery charge from a fresh courier quote for that address;
 * the total the browser saw is used only to refuse the order when the two
 * disagree, so that nobody is charged a price they have not been shown.
 *
 * The order row is written **before** the gateway is called, as
 * `pending_payment`. If the gateway call then fails, what is left is an
 * unpaid order that expires, never a gateway order we have no record of.
 */
export async function startCheckout(
  _prev: CheckoutState,
  fd: FormData,
): Promise<CheckoutState> {
  const actor = await assertRole("customer");

  const provider = paymentProvider();
  if (!provider) return fail("paymentsClosed");

  const rawLocale = String(fd.get("locale") ?? "");
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;

  const address = await getAddress(actor.userId, String(fd.get("addrId") ?? ""));
  if (!address) return fail("addressMissing");
  /* SPEC §7: the PIN gate is enforced here, server-side, whatever the
     address book held when the address was saved. */
  if (!(await checkDeliveryArea(address.pincode)).served) {
    return fail("pincodeNotServed", { pincode: address.pincode });
  }

  const cart = await hydrateCart(locale);
  if (cart.items.length === 0) return fail("cartEmpty");
  if (cart.unavailable.length > 0 || !cart.readyDate) return fail("cartChanged");

  const lines = linesFromCart(cart);
  /* Quoted again here, for the address chosen, rather than taken from the
     page: the page's figure is only what the customer was shown, and a
     mismatch below refuses the order just as a moved price does. */
  const delivery = await deliveryCharge(lines, address.pincode);
  if (!delivery.ok) return fail("deliveryUnavailable");
  const total = orderTotal(lines) + delivery.amount;
  if (Number(fd.get("total")) !== total) return fail("priceChanged");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);
  const profile = await getProfile(actor.userId);

  const order: Order = {
    id: newOrderId(),
    userId: actor.userId,
    email: actor.email,
    status: "pending_payment",
    lines,
    total,
    deliveryCharge: delivery.amount,
    deliveryMethod: delivery.method,
    shippingQuote: delivery.quote,
    deliveryDate: istDateISO(cart.readyDate),
    address: addressSnapshot(address),
    locale,
    provider: provider.name,
    providerOrderId: null,
    receiptNo: null,
    paidAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  await createOrder(order);

  /* AUTH_URL is the app's public origin, already required by Auth.js. Not
     the request's Host header, which the client controls. */
  if (!process.env.AUTH_URL) throw new Error("AUTH_URL must be set to the app's public origin");
  const origin = new URL(process.env.AUTH_URL).origin;

  try {
    const created = await provider.createOrder({
      orderId: order.id,
      amount: total,
      customer: {
        id: actor.userId,
        phone: address.phone,
        email: actor.email,
        name: profile?.name ?? address.recipient,
      },
      returnUrl: `${origin}/api/payments/return/${locale}`,
      /* Cashfree accepts only an HTTPS notify URL. On localhost there is no
         webhook, and the return route settles the order instead. */
      notifyUrl: origin.startsWith("https://")
        ? `${origin}/api/payments/cashfree/webhook`
        : null,
      expiresAt,
    });
    await setProviderOrderId(order.id, created.providerOrderId);
    return {
      status: "ready",
      orderId: order.id,
      sessionId: created.sessionId,
      mode: provider.mode,
    };
  } catch (e) {
    console.error(`[payments] could not open a gateway order for ${order.id}`, e);
    return fail("gatewayError");
  }
}
