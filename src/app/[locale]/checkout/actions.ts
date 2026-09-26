"use server";

import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { assertRole } from "@/lib/auth/guard";
import { hydrateCart, type HydratedCart } from "@/lib/cart/server";
import { lineId } from "@/lib/cart/cart";
import {
  PAYMENT_WINDOW_MINUTES,
  addressSnapshot,
  linesFromCart,
  newOrderId,
  orderTotal,
  type Order,
  type OrderShipment,
} from "@/lib/orders/order";
import { paymentProvider } from "@/lib/payments";
import { getTranslations } from "next-intl/server";
import { deliveryCharge, deliveryPlan, type ChargeLine } from "@/lib/shipping/charge";
import { checkDeliveryArea } from "@/lib/pincode/place";
import { travelsOnOwnRun } from "@/lib/shipping/parcel";
import { courierArrival, courierPickup, istDateISO, latestDate } from "@/lib/delivery-date";
import { getAddress, getProfile } from "@/lib/repo/profile";
import { createOrder, setProviderOrderId } from "@/lib/repo/orders";
import { choiceField, type CheckoutState, type DeliveryScan } from "./state";

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
 * and the delivery charge from the courier option the customer chose, looked
 * up again in a scan for that address (`deliveryCharge`);
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
  const cart = await hydrateCart(locale);
  if (cart.items.length === 0) return fail("cartEmpty");
  if (cart.unavailable.length > 0 || cart.overStock.length > 0 || !cart.readyDate) return fail("cartChanged");

  const lines = linesFromCart(cart);
  /* SPEC §7: the area gate, enforced here server-side whatever the address
     book holds — for fresh greens only, which go on the owner's own run.
     Everything else goes by courier, and a courier that cannot reach the
     PIN simply offers no price. */
  if (travelsOnOwnRun(lines) && !(await checkDeliveryArea(address.pincode)).served) {
    return fail("pincodeNotServed", { pincode: address.pincode });
  }
  /* Quoted again here, for the address chosen, rather than taken from the
     page: the page's figure is only what the customer was shown, and a
     mismatch below refuses the order just as a moved price does. The choice
     is one courier option per parcel, posted as `delivery:<parcel id>`. */
  const prefix = choiceField("");
  const choices: Record<string, string> = {};
  for (const [name, value] of fd.entries()) {
    if (name.startsWith(prefix)) choices[name.slice(prefix.length)] = String(value);
  }
  const delivery = await deliveryCharge(lines, address.pincode, choices);
  if (!delivery.ok) return fail(delivery.reason === "optionGone" ? "deliveryChanged" : "deliveryUnavailable");
  const total = orderTotal(lines) + delivery.amount;
  if (Number(fd.get("total")) !== total) return fail("priceChanged");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);
  const profile = await getProfile(actor.userId);

  /* Each parcel is dated on its own: packed for a day once its slowest line
     is ready, collected, and arriving the courier's days after that. The
     own run delivers on its ready date itself. With no transit time, the
     pickup day is the best that can be said. */
  const shipments: OrderShipment[] = delivery.shipments.map((x) => {
    const ready = shipmentReady(cart, x.lines);
    return {
      origin: { id: x.origin.id, name: x.origin.name, city: x.origin.city, pincode: x.origin.pincode },
      method: x.method,
      lines: x.lines.map(lineId),
      charge: x.amount,
      quote: x.quote,
      deliveryDate: istDateISO(x.method === "courier" ? courierArrival(courierPickup(ready), x.days ?? 0) : ready),
    };
  });
  const couriered = shipments.filter((x) => x.method === "courier");

  const order: Order = {
    id: newOrderId(),
    userId: actor.userId,
    email: actor.email,
    status: "pending_payment",
    lines,
    total,
    deliveryCharge: delivery.amount,
    deliveryMethod: shipments.some((x) => x.method === "own_run") ? "own_run" : "courier",
    shippingQuote: shipments.length === 1 && couriered.length === 1 ? couriered[0].quote : null,
    shipments,
    /* The order is complete when its last parcel arrives. ISO dates sort as
       strings. */
    deliveryDate: shipments.map((x) => x.deliveryDate).sort().at(-1)!,
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
      /* Cashfree accepts only an HTTPS notify URL, and Razorpay ignores it
         (its webhook is set in the dashboard). On localhost there is no
         webhook, and the return route settles the order instead. */
      notifyUrl: origin.startsWith("https://")
        ? `${origin}/api/payments/${provider.name}/webhook`
        : null,
      expiresAt,
    });
    await setProviderOrderId(order.id, created.providerOrderId);
    return {
      status: "ready",
      orderId: order.id,
      checkout: created.checkout,
    };
  } catch (e) {
    console.error(`[payments] could not open a gateway order for ${order.id}`, e);
    return fail("gatewayError");
  }
}

/**
 * Ask every connected courier what delivering this cart to this address
 * costs — the "finding the cheapest delivery" step (SPEC §7, the owner,
 * 24 Sep 2026). Called when an address is accepted, so the page itself never
 * waits on three couriers, and a customer who never gets that far never
 * costs a quote.
 *
 * Reads the cart and the address itself; the browser sends only which
 * address. `startCheckout` looks the chosen option up again before charging.
 */
export async function scanDelivery(addrId: string, rawLocale: string): Promise<DeliveryScan> {
  const actor = await assertRole("customer");
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const none: DeliveryScan = { status: "none", operatorNote: null };

  const address = await getAddress(actor.userId, addrId);
  if (!address) return none;
  const cart = await hydrateCart(locale);
  if (cart.items.length === 0) return none;
  const lines = linesFromCart(cart);
  if (travelsOnOwnRun(lines) && !(await checkDeliveryArea(address.pincode)).served) return none;

  const found = await deliveryPlan(lines, address.pincode);
  if (found.ok) {
    const names = new Map(cart.items.map((i) => [lineId(i), i.name]));
    const itemNames = (ls: readonly ChargeLine[]) => ls.map((l) => names.get(lineId(l)) ?? l.key);
    return {
      status: "ready",
      ownRun: found.ownRun
        ? {
            amount: found.ownRun.amount,
            arrives: istDateISO(shipmentReady(cart, found.ownRun.lines)),
            items: itemNames(found.ownRun.lines),
          }
        : null,
      parcels: found.parcels.map((p) => {
        const pickup = courierPickup(shipmentReady(cart, p.lines));
        return {
          id: p.id,
          items: itemNames(p.lines),
          pickup: istDateISO(pickup),
          options: p.options.map(({ id, courier, carrier, amount, days }) => ({
            id,
            courier,
            carrier,
            amount,
            arrives: days !== null ? istDateISO(courierArrival(pickup, days)) : null,
          })),
        };
      }),
    };
  }
  /* Something not set up is the owner's to fix, not the customer's to wait
     out — named for an admin, and only for an admin. A courier that did not
     answer is neither's fault, so it carries no note. */
  if (actor.role === "admin" && found.reason !== "unavailable") {
    const ta = await getTranslations({ locale, namespace: "admin.checkoutDelivery" });
    return { status: "none", operatorNote: { body: ta(found.reason), cta: ta("cta") } };
  }
  return none;
}

/** The day a shipment's slowest line is ready — each parcel waits only for
 *  what is in it, not for the rest of the order. */
function shipmentReady(cart: HydratedCart, lines: readonly ChargeLine[]): Date {
  const ids = new Set(lines.map(lineId));
  const date = latestDate(cart.items.filter((i) => ids.has(lineId(i))).map((i) => i.readyDate));
  if (!date) throw new Error("A shipment with no line in the cart");
  return date;
}
